using System.Globalization;

namespace FileTrans;

/// <summary>启动参数解析错误。</summary>
public sealed class OptionException : Exception
{
    public OptionException(string message) : base(message) { }
}

/// <summary>命令行 / 启动脚本参数。</summary>
public sealed class AppOptions
{
    public const int DefaultPort = 8899;

    /// <summary>监听端口（所有网卡）。</summary>
    public int Port { get; private set; } = DefaultPort;

    /// <summary>共享目录的绝对路径。</summary>
    public string DataDirectory { get; private set; } = string.Empty;

    /// <summary>启动后是否自动打开本机浏览器。</summary>
    public bool OpenBrowser { get; private set; } = true;

    /// <summary>单次上传上限（字节），null 表示不限制。</summary>
    public long? MaxUploadBytes { get; private set; }

    public bool ShowHelp { get; private set; }

    public static AppOptions Parse(string[] args)
    {
        var options = new AppOptions();
        for (var i = 0; i < args.Length; i++)
        {
            var raw = args[i];
            var name = raw.Split('=', 2)[0].ToLowerInvariant();

            string? Inline() => raw.Contains('=') ? raw[(raw.IndexOf('=') + 1)..] : null;
            string Next()
            {
                if (i + 1 >= args.Length) throw new OptionException($"参数 {name} 缺少取值");
                return args[++i];
            }

            switch (name)
            {
                case "-p":
                case "--port":
                {
                    var text = Inline() ?? Next();
                    if (!int.TryParse(text, NumberStyles.Integer, CultureInfo.InvariantCulture, out var port) || port < 1 || port > 65535)
                        throw new OptionException($"端口号无效：{text}（应为 1-65535）");
                    options.Port = port;
                    break;
                }
                case "-d":
                case "--data":
                case "--dir":
                {
                    var text = (Inline() ?? Next()).Trim();
                    if (text.Length == 0) throw new OptionException("共享目录不能为空");
                    options.DataDirectory = text;
                    break;
                }
                case "--no-browser":
                case "--nobrowser":
                    options.OpenBrowser = false;
                    break;
                case "--max-upload-mb":
                {
                    var text = Inline() ?? Next();
                    if (!long.TryParse(text, NumberStyles.Integer, CultureInfo.InvariantCulture, out var mb) || mb < 0)
                        throw new OptionException($"上传上限无效：{text}");
                    options.MaxUploadBytes = mb == 0 ? null : mb * 1024L * 1024L;
                    break;
                }
                case "-h":
                case "--help":
                case "/?":
                    options.ShowHelp = true;
                    return options;
                default:
                    throw new OptionException($"未知参数：{raw}");
            }
        }

        if (string.IsNullOrWhiteSpace(options.DataDirectory))
        {
            // 默认：当前工作目录下的 files 文件夹；若不可写则退回到程序目录。
            var cwdRoot = Path.Combine(Environment.CurrentDirectory, "files");
            options.DataDirectory = TryPrepare(cwdRoot)
                ? cwdRoot
                : Path.Combine(AppContext.BaseDirectory, "files");
        }

        options.DataDirectory = Path.GetFullPath(options.DataDirectory);
        TryPrepare(options.DataDirectory);
        return options;
    }

    private static bool TryPrepare(string path)
    {
        try
        {
            Directory.CreateDirectory(path);
            return true;
        }
        catch
        {
            return false;
        }
    }

    public static void PrintUsage()
    {
        Console.WriteLine(
            """
            局域网文件快传 FileTrans

            用法：
              start.bat [选项]            在 Windows 上启动（推荐）
              dotnet run -- [选项]        在源码目录中直接启动
              FileTrans.exe [选项]        运行已发布版本

            选项：
              -p, --port <端口>           监听端口，默认 8899
              -d, --data <目录>           共享目录，默认 .\files
                  --no-browser            启动后不自动打开浏览器
                  --max-upload-mb <MB>    单文件上传上限，0 表示不限制（默认）
              -h, --help                  显示本帮助

            示例：
              start.bat --port 9000 --data D:\Share
            """);
    }
}
