using System.Diagnostics;
using System.IO.Compression;
using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.StaticFiles;
using Microsoft.Extensions.FileProviders;
using Microsoft.Net.Http.Headers;

namespace FileTrans;

public static class Program
{
    private const string AppTitle = "局域网文件快传";
    private const long TextPreviewLimit = 2 * 1024 * 1024;

    public static DateTimeOffset StartedAt { get; } = DateTimeOffset.Now;

    private static string Version =>
        typeof(Program).Assembly.GetName().Version?.ToString(3) ?? "1.0.0";

    public static async Task<int> Main(string[] args)
    {
        try
        {
            Console.OutputEncoding = Encoding.UTF8;
        }
        catch
        {
            // 某些无控制台环境下无法设置编码，忽略。
        }

        AppOptions options;
        try
        {
            options = AppOptions.Parse(args);
        }
        catch (OptionException ex)
        {
            Console.Error.WriteLine(ex.Message);
            Console.Error.WriteLine();
            AppOptions.PrintUsage();
            return 2;
        }

        if (options.ShowHelp)
        {
            AppOptions.PrintUsage();
            return 0;
        }

        Storage storage;
        string webRoot;
        try
        {
            storage = new Storage(options.DataDirectory);
            webRoot = ResolveWebRoot();
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"启动失败：{ex.Message}");
            return 1;
        }

        var builder = WebApplication.CreateBuilder(new WebApplicationOptions
        {
            Args = args,
            ContentRootPath = AppContext.BaseDirectory,
            ApplicationName = typeof(Program).Assembly.GetName().Name
        });

        builder.WebHost.ConfigureKestrel(kestrel =>
        {
            kestrel.AddServerHeader = false;
            kestrel.Limits.MaxRequestBodySize = options.MaxUploadBytes;
            kestrel.Limits.MinRequestBodyDataRate = null;
            kestrel.Limits.MinResponseDataRate = null;
            kestrel.Limits.MaxRequestLineSize = 32 * 1024;
            kestrel.Limits.MaxRequestHeadersTotalSize = 64 * 1024;
            kestrel.ListenAnyIP(options.Port);
        });

        builder.Logging.ClearProviders();
        builder.Logging.AddSimpleConsole(console =>
        {
            console.SingleLine = true;
            console.TimestampFormat = "HH:mm:ss ";
        });
        builder.Logging.SetMinimumLevel(LogLevel.Information);
        builder.Logging.AddFilter("Microsoft.AspNetCore", LogLevel.Warning);
        builder.Logging.AddFilter("Microsoft.Hosting.Lifetime", LogLevel.Warning);

        builder.Services.AddSingleton(options);
        builder.Services.AddSingleton(storage);
        builder.Services.AddSingleton<PresenceService>();
        builder.Services.AddSingleton<FileExtensionContentTypeProvider>();
        builder.Services.ConfigureHttpJsonOptions(json =>
        {
            json.SerializerOptions.DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull;
        });

        var app = builder.Build();

        app.Use(async (context, next) =>
        {
            if (context.Request.Path.StartsWithSegments("/api"))
                context.Response.Headers.CacheControl = "no-store";

            try
            {
                await next();
            }
            catch (OperationCanceledException) when (context.RequestAborted.IsCancellationRequested)
            {
                // 客户端主动取消（上传/下载中断），不需要记录错误。
            }
            catch (Exception ex)
            {
                var status = ex switch
                {
                    ApiException api => api.Status,
                    BadHttpRequestException bad => bad.StatusCode,
                    UnauthorizedAccessException => StatusCodes.Status403Forbidden,
                    FileNotFoundException or DirectoryNotFoundException => StatusCodes.Status404NotFound,
                    _ => StatusCodes.Status500InternalServerError
                };

                var message = status >= 500 ? "服务器内部错误" : ex.Message;
                if (status >= 500)
                    app.Logger.LogError(ex, "请求处理失败 {Method} {Path}", context.Request.Method, context.Request.Path);
                else
                    app.Logger.LogWarning("请求被拒绝 {Method} {Path}: {Message}", context.Request.Method, context.Request.Path, ex.Message);

                if (context.Response.HasStarted) throw;

                context.Response.Clear();
                context.Response.StatusCode = status;
                context.Response.ContentType = "application/json; charset=utf-8";
                await context.Response.WriteAsJsonAsync(new { error = message, status });
            }
        });

        var fileProvider = new PhysicalFileProvider(webRoot);
        app.UseDefaultFiles(new DefaultFilesOptions { FileProvider = fileProvider });
        app.UseStaticFiles(new StaticFileOptions
        {
            FileProvider = fileProvider,
            OnPrepareResponse = ctx =>
            {
                // 局域网内自行更新文件后无需强刷缓存。
                ctx.Context.Response.Headers.CacheControl = "no-cache, max-age=0";
            }
        });

        MapApi(app);

        var indexFile = Path.Combine(webRoot, "index.html");
        app.MapFallback(async context =>
        {
            if (context.Request.Path.StartsWithSegments("/api"))
            {
                context.Response.StatusCode = StatusCodes.Status404NotFound;
                context.Response.ContentType = "application/json; charset=utf-8";
                await context.Response.WriteAsJsonAsync(new { error = "接口不存在", status = 404 });
                return;
            }

            context.Response.ContentType = "text/html; charset=utf-8";
            context.Response.Headers.CacheControl = "no-cache, max-age=0";
            await context.Response.SendFileAsync(indexFile);
        });

        app.Lifetime.ApplicationStarted.Register(() =>
        {
            PrintBanner(options, storage);
            if (options.OpenBrowser)
            {
                var url = $"http://localhost:{options.Port}/";
                _ = Task.Run(() =>
                {
                    Thread.Sleep(600);
                    TryOpenBrowser(url);
                });
            }
        });

        try
        {
            await app.RunAsync();
        }
        catch (IOException ex) when (IsAddressInUse(ex))
        {
            Console.Error.WriteLine();
            Console.Error.WriteLine($"端口 {options.Port} 已被占用，请换一个端口启动，例如：start.bat --port {options.Port + 1}");
            return 3;
        }
        catch (IOException ex)
        {
            Console.Error.WriteLine();
            Console.Error.WriteLine($"服务启动失败：{ex.Message}");
            return 1;
        }

        Console.WriteLine();
        Console.WriteLine("服务已停止。");
        return 0;
    }

    private static void MapApi(WebApplication app)
    {
        var api = app.MapGroup("/api");

        api.MapGet("/health", () => Results.Json(new { status = "ok", time = DateTimeOffset.UtcNow }));
        api.MapGet("/info", GetInfo);
        api.MapGet("/files", GetFiles);
        api.MapGet("/files/stat", StatFile);
        api.MapGet("/files/content", DownloadFile);
        api.MapGet("/files/text", GetTextFile);
        api.MapPut("/files/content", UploadFile);
        api.MapDelete("/files/content", DeleteItem);
        api.MapPost("/files/directory", CreateFolder);
        api.MapPost("/files/rename", RenameItem);
        api.MapPost("/files/conflicts", CheckConflicts);
        api.MapGet("/archive", DownloadArchive);
        api.MapPost("/presence", PostPresence);
        api.MapPost("/deliver/prepare", PrepareDelivery);
        api.MapGet("/inbox", GetInbox);
    }

    private static IResult GetInfo(AppOptions options, Storage storage)
    {
        var stats = storage.GetStats();
        var lanUrls = NetworkInfo.GetLanUrls(options.Port);

        return Results.Json(new
        {
            app = "FileTrans",
            title = AppTitle,
            version = Version,
            machine = Environment.MachineName,
            user = Environment.UserName,
            os = RuntimeInformation.OSDescription,
            platform = RuntimeInformation.ProcessArchitecture.ToString().ToLowerInvariant(),
            startedAt = StartedAt,
            serverTime = DateTimeOffset.Now,
            port = options.Port,
            storage = new
            {
                root = storage.Root,
                fileCount = stats.FileCount,
                totalBytes = stats.TotalBytes,
                freeBytes = NetworkInfo.GetFreeBytes(storage.Root)
            },
            upload = new
            {
                maxBytes = options.MaxUploadBytes,
                unlimited = options.MaxUploadBytes is null
            },
            urls = new
            {
                local = $"http://localhost:{options.Port}/",
                lan = lanUrls
            }
        });
    }

    private static IResult GetFiles(string? path, Storage storage)
    {
        var directory = storage.ResolveDirectory(path);
        var entries = storage.List(path);
        return Results.Json(new
        {
            path = storage.Relative(directory),
            parent = GetParent(storage.Relative(directory)),
            entries
        });
    }

    private static IResult StatFile(string? path, Storage storage)
    {
        if (string.IsNullOrWhiteSpace(path))
            throw new ApiException(400, "缺少文件路径参数 path");

        var full = storage.Resolve(path, allowRoot: false);
        if (File.Exists(full))
            return Results.Json(new { exists = true, isDirectory = false, entry = storage.Describe(new FileInfo(full)) });

        if (Directory.Exists(full))
            return Results.Json(new { exists = true, isDirectory = true, entry = storage.Describe(new DirectoryInfo(full)) });

        return Results.Json(new { exists = false });
    }

    private static async Task<IResult> UploadFile(HttpRequest request, string? path, string? overwrite, Storage storage)
    {
        if (string.IsNullOrWhiteSpace(path))
            throw new ApiException(400, "缺少文件路径参数 path");

        var allowOverwrite = overwrite is not null &&
            (overwrite == "1" || overwrite.Equals("true", StringComparison.OrdinalIgnoreCase) ||
             overwrite.Equals("yes", StringComparison.OrdinalIgnoreCase) || overwrite.Equals("on", StringComparison.OrdinalIgnoreCase));

        var target = storage.Resolve(path, allowRoot: false);
        if (Directory.Exists(target))
            throw new ApiException(409, "目标路径已存在同名文件夹");

        var parent = Path.GetDirectoryName(target);
        if (!string.IsNullOrEmpty(parent))
        {
            try { Directory.CreateDirectory(parent); }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
            {
                throw new ApiException(500, "无法创建目标文件夹：" + ex.Message);
            }
        }

        var temp = storage.CreateTempFilePath();
        try
        {
            await using (var stream = new FileStream(
                temp, FileMode.CreateNew, FileAccess.Write, FileShare.None,
                bufferSize: 128 * 1024,
                FileOptions.Asynchronous | FileOptions.SequentialScan))
            {
                await request.Body.CopyToAsync(stream, 128 * 1024, request.HttpContext.RequestAborted);
                await stream.FlushAsync(request.HttpContext.RequestAborted);
            }

            if (File.Exists(target) && !allowOverwrite)
                throw new ApiException(409, "同名文件已存在");

            try
            {
                File.Move(temp, target, overwrite: true);
            }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
            {
                throw new ApiException(409, "写入文件失败：" + ex.Message);
            }

            storage.InvalidateStats();
            var entry = storage.Describe(new FileInfo(target));
            return Results.Json(new { ok = true, file = entry }, statusCode: StatusCodes.Status201Created);
        }
        finally
        {
            if (File.Exists(temp))
            {
                try { File.Delete(temp); } catch { /* 忽略清理失败 */ }
            }
        }
    }

    private static IResult DownloadFile(
        string? path,
        string? inline,
        Storage storage,
        FileExtensionContentTypeProvider contentTypes)
    {
        var full = storage.ResolveFile(path);
        var info = new FileInfo(full);
        var lastModified = new DateTimeOffset(info.LastWriteTimeUtc);
        var contentType = contentTypes.TryGetContentType(info.Name, out var detected)
            ? detected
            : "application/octet-stream";

        var wantsInline = inline is not null &&
            (inline == "1" || inline.Equals("true", StringComparison.OrdinalIgnoreCase));

        if (wantsInline && IsInlineSafe(contentType))
        {
            return Results.File(
                full,
                contentType,
                fileDownloadName: null,
                enableRangeProcessing: true,
                lastModified: lastModified);
        }

        return Results.File(
            full,
            "application/octet-stream",
            fileDownloadName: info.Name,
            enableRangeProcessing: true,
            lastModified: lastModified);
    }

    private static async Task<IResult> GetTextFile(string? path, Storage storage)
    {
        var full = storage.ResolveFile(path);
        var info = new FileInfo(full);
        if (info.Length > TextPreviewLimit)
            throw new ApiException(413, "文件超过 2 MB，无法在线预览文本");

        string text;
        try
        {
            await using var stream = new FileStream(
                full, FileMode.Open, FileAccess.Read, FileShare.ReadWrite,
                bufferSize: 64 * 1024,
                FileOptions.Asynchronous | FileOptions.SequentialScan);
            using var reader = new StreamReader(stream, Encoding.UTF8, detectEncodingFromByteOrderMarks: true);
            text = await reader.ReadToEndAsync();
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            throw new ApiException(500, "读取文本失败：" + ex.Message);
        }

        return Results.Text(text, "text/plain; charset=utf-8");
    }

    private static IResult DeleteItem(string? path, Storage storage)
    {
        var full = storage.Resolve(path, allowRoot: false);
        storage.Delete(path);
        return Results.Json(new { ok = true, path = storage.Relative(full) });
    }

    private static IResult CreateFolder(string? path, Storage storage)
    {
        var entry = storage.CreateDirectory(path);
        return Results.Json(new { ok = true, entry }, statusCode: StatusCodes.Status201Created);
    }

    private static IResult RenameItem(string? from, string? to, Storage storage)
    {
        var entry = storage.Move(from, to);
        return Results.Json(new { ok = true, entry });
    }

    private static IResult CheckConflicts(ConflictRequest request, Storage storage)
    {
        var conflicts = new List<string>();
        var invalid = new List<string>();

        foreach (var item in request.Paths ?? new List<string>())
        {
            if (string.IsNullOrWhiteSpace(item)) continue;
            try
            {
                var full = storage.Resolve(item, allowRoot: false);
                if (File.Exists(full) || Directory.Exists(full)) conflicts.Add(item);
            }
            catch (ApiException)
            {
                invalid.Add(item);
            }
        }

        return Results.Json(new { conflicts, invalid });
    }

    private static IResult PostPresence(PresenceRequest request, HttpContext context, PresenceService presence)
    {
        var snapshot = presence.Touch(request.ClientId, request.Name, GetClientIp(context));
        return Results.Json(snapshot);
    }

    private static IResult PrepareDelivery(PrepareDeliveryRequest request, Storage storage, PresenceService presence)
    {
        var relativePath = presence.BeginDelivery(request.SenderClientId, request.RecipientClientId);
        var fullPath = storage.Resolve(relativePath, allowRoot: false);
        Directory.CreateDirectory(fullPath);
        return Results.Json(new { deliveryPath = relativePath });
    }

    private static IResult GetInbox(string? clientId, Storage storage, PresenceService presence)
    {
        var snapshot = presence.Snapshot(clientId);
        var relativeRoot = PresenceService.DeliveryRootFor(snapshot.Self.ClientId);
        var fullRoot = storage.Resolve(relativeRoot);
        var deliveries = new List<InboxDelivery>();

        if (Directory.Exists(fullRoot))
        {
            try
            {
                foreach (var folder in new DirectoryInfo(fullRoot).EnumerateDirectories())
                {
                    if (folder.Name.StartsWith('.')) continue;

                    var files = new List<FileEntry>();
                    try
                    {
                        foreach (var file in folder.EnumerateFiles())
                        {
                            try { files.Add(storage.Describe(file)); }
                            catch { /* 单个文件读不到时忽略 */ }
                        }
                    }
                    catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
                    {
                        continue;
                    }

                    files.Sort(NaturalFileEntryComparer.Instance);
                    var sender = folder.Name;
                    var deliveredAt = new DateTimeOffset(folder.LastWriteTimeUtc);
                    if (PresenceService.TryParseDeliveryFolder(folder.Name, out var parsedSender, out var parsedAt))
                    {
                        sender = parsedSender;
                        deliveredAt = parsedAt;
                    }

                    deliveries.Add(new InboxDelivery(
                        storage.Relative(folder.FullName),
                        sender,
                        deliveredAt,
                        files.Sum(file => file.Size),
                        files));
                }
            }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
            {
                // 收件目录暂时不可读时返回已有结果。
            }
        }

        deliveries.Sort((left, right) => right.DeliveredAt.CompareTo(left.DeliveredAt));
        return Results.Json(new { self = snapshot.Self, users = snapshot.Users, deliveries });
    }

    private static string GetClientIp(HttpContext context)
    {
        var address = context.Connection.RemoteIpAddress;
        if (address is null) return "未知";
        if (address.IsIPv4MappedToIPv6) address = address.MapToIPv4();
        return address.ToString();
    }

    private static async Task DownloadArchive(HttpContext context, string? path, Storage storage)
    {
        var directory = storage.ResolveDirectory(path);
        var relativeDirectory = storage.Relative(directory);
        var folderName = string.IsNullOrEmpty(relativeDirectory)
            ? "shared-files"
            : Path.GetFileName(directory.TrimEnd(Path.DirectorySeparatorChar));
        if (string.IsNullOrWhiteSpace(folderName)) folderName = "shared-files";

        var zipName = $"{folderName}-{DateTime.Now:yyyyMMdd-HHmmss}.zip";

        context.Response.StatusCode = StatusCodes.Status200OK;
        context.Response.ContentType = "application/zip";
        context.Response.Headers[HeaderNames.ContentDisposition] =
            new ContentDispositionHeaderValue("attachment") { FileNameStar = zipName }.ToString();
        context.Response.Headers.CacheControl = "no-store";
        context.Features.Get<Microsoft.AspNetCore.Http.Features.IHttpResponseBodyFeature>()?.DisableBuffering();

        // ZipArchive 在 Dispose 时同步写入中央目录，需显式允许本次响应的同步写入。
        var bodyControl = context.Features.Get<Microsoft.AspNetCore.Http.Features.IHttpBodyControlFeature>();
        if (bodyControl is not null) bodyControl.AllowSynchronousIO = true;

        using var archive = new ZipArchive(context.Response.Body, ZipArchiveMode.Create, leaveOpen: true);

        IEnumerable<string> files;
        try
        {
            files = Directory.EnumerateFiles(directory, "*", SearchOption.AllDirectories);
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            throw new ApiException(500, "读取文件夹失败：" + ex.Message);
        }

        foreach (var file in files)
        {
            if (context.RequestAborted.IsCancellationRequested) return;

            var entryName = Path.GetRelativePath(directory, file).Replace('\\', '/');
            if (entryName.Split('/').Any(Storage.IsHiddenName)) continue;

            try
            {
                if ((File.GetAttributes(file) & FileAttributes.ReparsePoint) != 0) continue;

                var entry = archive.CreateEntry(entryName, CompressionLevel.Fastest);
                var modified = File.GetLastWriteTime(file);
                entry.LastWriteTime = modified.Year is < 1980 or > 2107
                    ? new DateTimeOffset(1980, 1, 1, 0, 0, 0, TimeSpan.Zero)
                    : new DateTimeOffset(modified);

                await using var source = new FileStream(
                    file, FileMode.Open, FileAccess.Read, FileShare.ReadWrite,
                    bufferSize: 128 * 1024,
                    FileOptions.Asynchronous | FileOptions.SequentialScan);
                await using var target = entry.Open();
                await source.CopyToAsync(target, 128 * 1024, context.RequestAborted);
            }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
            {
                // 单个文件读取失败时跳过，保证压缩包仍可下载。
                LogArchiveSkip(context, file, ex);
            }
        }
    }

    private static void LogArchiveSkip(HttpContext context, string file, Exception ex)
    {
        var logger = context.RequestServices.GetService<ILoggerFactory>()?.CreateLogger("FileTrans.Archive");
        logger?.LogWarning("打包时跳过文件 {File}：{Message}", file, ex.Message);
    }

    private static string? GetParent(string relativePath)
    {
        if (string.IsNullOrEmpty(relativePath)) return null;
        var index = relativePath.LastIndexOf('/');
        return index <= 0 ? string.Empty : relativePath[..index];
    }

    private static bool IsInlineSafe(string? contentType)
    {
        if (string.IsNullOrEmpty(contentType)) return false;
        if (string.Equals(contentType, "image/svg+xml", StringComparison.OrdinalIgnoreCase)) return false;
        if (contentType.StartsWith("image/", StringComparison.OrdinalIgnoreCase)) return true;
        if (contentType.StartsWith("video/", StringComparison.OrdinalIgnoreCase)) return true;
        if (contentType.StartsWith("audio/", StringComparison.OrdinalIgnoreCase)) return true;
        return string.Equals(contentType, "application/pdf", StringComparison.OrdinalIgnoreCase);
    }

    private static string ResolveWebRoot()
    {
        var candidates = new List<string>();

        void AddCandidate(string? candidate)
        {
            if (!string.IsNullOrWhiteSpace(candidate))
                candidates.Add(Path.GetFullPath(candidate));
        }

        AddCandidate(Path.Combine(AppContext.BaseDirectory, "wwwroot"));
        AddCandidate(Path.Combine(Environment.CurrentDirectory, "wwwroot"));

        var directory = new DirectoryInfo(AppContext.BaseDirectory);
        for (var i = 0; i < 6 && directory is not null; i++, directory = directory.Parent)
        {
            AddCandidate(Path.Combine(directory.FullName, "wwwroot"));
            AddCandidate(Path.Combine(directory.FullName, "src", "FileTrans", "wwwroot"));
        }

        foreach (var candidate in candidates.Distinct(StringComparer.OrdinalIgnoreCase))
        {
            if (File.Exists(Path.Combine(candidate, "index.html")))
                return candidate;
        }

        throw new DirectoryNotFoundException(
            "找不到网页资源目录 wwwroot（应包含 index.html）。请确认项目文件完整，或重新发布后再运行。");
    }

    private static bool IsAddressInUse(IOException ex)
    {
        for (Exception? current = ex; current is not null; current = current.InnerException)
        {
            if (current is SocketException socket &&
                socket.SocketErrorCode is SocketError.AddressAlreadyInUse or SocketError.AddressNotAvailable)
                return true;
            if (current.Message.Contains("address already in use", StringComparison.OrdinalIgnoreCase))
                return true;
        }

        return false;
    }

    private static void PrintBanner(AppOptions options, Storage storage)
    {
        var lanUrls = NetworkInfo.GetLanUrls(options.Port);
        var line = new string('=', 64);

        Console.WriteLine();
        Console.WriteLine(line);
        Console.WriteLine($"  {AppTitle} FileTrans  v{Version}");
        Console.WriteLine(line);
        Console.WriteLine($"  本机访问 : http://localhost:{options.Port}/");
        if (lanUrls.Count == 0)
            Console.WriteLine("  局域网   : 未检测到可用的局域网 IPv4 地址");
        else
            foreach (var url in lanUrls)
                Console.WriteLine($"  局域网   : {url}");

        Console.WriteLine($"  共享目录 : {storage.Root}");
        Console.WriteLine($"  上传上限 : {(options.MaxUploadBytes is null ? "不限制" : FormatSize(options.MaxUploadBytes.Value))}");
        Console.WriteLine("  停止服务 : 按 Ctrl+C");
        Console.WriteLine(line);
        Console.WriteLine("  把上面的局域网地址发给同一网络中的其他设备，用浏览器打开即可互传文件。");
        Console.WriteLine();
    }

    private static string FormatSize(long bytes)
    {
        string[] units = ["B", "KB", "MB", "GB", "TB"];
        double value = bytes;
        var unit = 0;
        while (value >= 1024 && unit < units.Length - 1)
        {
            value /= 1024;
            unit++;
        }

        return unit == 0 ? $"{bytes} B" : $"{value:0.##} {units[unit]}";
    }

    private static void TryOpenBrowser(string url)
    {
        try
        {
            Process.Start(new ProcessStartInfo(url) { UseShellExecute = true });
            return;
        }
        catch
        {
            // 继续尝试各平台命令。
        }

        try
        {
            if (OperatingSystem.IsWindows())
                Process.Start(new ProcessStartInfo("cmd.exe", $"/c start \"\" \"{url}\"")
                {
                    CreateNoWindow = true,
                    UseShellExecute = false
                });
            else if (OperatingSystem.IsMacOS())
                Process.Start("open", url);
            else
                Process.Start("xdg-open", url);
        }
        catch (Exception ex)
        {
            Console.WriteLine($"  无法自动打开浏览器，请手动访问 {url}（{ex.Message}）");
        }
    }
}

public sealed record ConflictRequest(List<string>? Paths);

public static class NetworkInfo
{
    private static readonly string[] VirtualInterfaceHints =
    [
        "vmware", "virtual", "hyper-v", "vethernet", "wsl", "tap-", "tap adapter",
        "vpn", "tunnel", "bluetooth", "sangfor", "atrust", "docker", "zerotier",
        "tailscale", "hamachi", "loopback", "pseudo"
    ];

    public static IReadOnlyList<string> GetLanUrls(int port)
    {
        var candidates = new List<(string Url, int Score, int Priority)>();

        try
        {
            foreach (var networkInterface in NetworkInterface.GetAllNetworkInterfaces())
            {
                if (networkInterface.OperationalStatus != OperationalStatus.Up) continue;
                if (networkInterface.NetworkInterfaceType == NetworkInterfaceType.Loopback) continue;

                var properties = networkInterface.GetIPProperties();
                var hasGateway = properties.GatewayAddresses.Any(gateway =>
                    gateway.Address.AddressFamily == AddressFamily.InterNetwork &&
                    !gateway.Address.Equals(IPAddress.Any) &&
                    !gateway.Address.Equals(IPAddress.None));
                var isVirtual = IsVirtualInterface(networkInterface);

                foreach (var unicast in properties.UnicastAddresses)
                {
                    if (unicast.Address.AddressFamily != AddressFamily.InterNetwork) continue;

                    var ip = unicast.Address.ToString();
                    if (ip.StartsWith("169.254.", StringComparison.Ordinal)) continue;
                    if (ip.StartsWith("127.", StringComparison.Ordinal)) continue;

                    var score = 0;
                    if (!isVirtual) score += 100;
                    if (hasGateway) score += 30;
                    if (networkInterface.NetworkInterfaceType is NetworkInterfaceType.Ethernet or NetworkInterfaceType.Wireless80211)
                        score += 20;
                    if (IsPrivateAddress(ip)) score += 10;

                    var url = $"http://{ip}:{port}/";
                    candidates.Add((url, score, UrlPriority(ip)));
                }
            }
        }
        catch
        {
            // 枚举网卡失败时返回已收集到的地址。
        }

        return candidates
            .GroupBy(candidate => candidate.Url, StringComparer.OrdinalIgnoreCase)
            .Select(group => group.First())
            .OrderByDescending(candidate => candidate.Score)
            .ThenBy(candidate => candidate.Priority)
            .ThenBy(candidate => candidate.Url, StringComparer.OrdinalIgnoreCase)
            .Select(candidate => candidate.Url)
            .ToList();
    }

    private static bool IsVirtualInterface(NetworkInterface networkInterface)
    {
        var text = $"{networkInterface.Name} {networkInterface.Description}".ToLowerInvariant();
        return VirtualInterfaceHints.Any(hint => text.Contains(hint, StringComparison.Ordinal));
    }

    private static bool IsPrivateAddress(string ip)
    {
        if (ip.StartsWith("192.168.", StringComparison.Ordinal)) return true;
        if (ip.StartsWith("10.", StringComparison.Ordinal)) return true;
        if (!ip.StartsWith("172.", StringComparison.Ordinal)) return false;

        var parts = ip.Split('.');
        return parts.Length > 1 && int.TryParse(parts[1], out var second) && second is >= 16 and <= 31;
    }

    private static int UrlPriority(string ip)
    {
        if (ip.StartsWith("192.168.", StringComparison.Ordinal)) return 0;
        if (ip.StartsWith("10.", StringComparison.Ordinal)) return 1;
        if (ip.StartsWith("172.", StringComparison.Ordinal))
        {
            var parts = ip.Split('.');
            if (parts.Length > 1 && int.TryParse(parts[1], out var second) && second is >= 16 and <= 31)
                return 2;
        }

        return 3;
    }

    public static long GetFreeBytes(string path)
    {
        try
        {
            var root = Path.GetPathRoot(Path.GetFullPath(path));
            if (string.IsNullOrEmpty(root)) return 0;
            return new DriveInfo(root).AvailableFreeSpace;
        }
        catch
        {
            return 0;
        }
    }
}
