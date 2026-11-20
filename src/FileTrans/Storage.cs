using System.Globalization;

namespace FileTrans;

/// <summary>可安全返回给前端的业务异常。</summary>
public sealed class ApiException : Exception
{
    public int Status { get; }

    public ApiException(int status, string message) : base(message) => Status = status;
}

/// <summary>目录中的一个条目（文件或文件夹）。</summary>
public sealed record FileEntry(
    string Name,
    string RelativePath,
    bool IsDirectory,
    long Size,
    DateTimeOffset Modified,
    int? ChildCount,
    string? Extension);

public sealed record StorageStats(long FileCount, long TotalBytes, DateTimeOffset ComputedAt);

/// <summary>共享目录：负责路径校验、目录读取与文件元数据。</summary>
public sealed class Storage
{
    private const string TempFolderName = ".filetrans-tmp";

    /// <summary>用户点对点投递的根目录名（在普通文件列表中隐藏）。</summary>
    public const string DeliveryRootFolderName = "用户投递";

    private static readonly StringComparison PathComparison = OperatingSystem.IsWindows()
        ? StringComparison.OrdinalIgnoreCase
        : StringComparison.Ordinal;

    private readonly object _statsLock = new();
    private StorageStats _stats = new(0, 0, DateTimeOffset.MinValue);

    /// <summary>共享根目录（绝对路径，无多余结尾分隔符时保持原样）。</summary>
    public string Root { get; }

    /// <summary>上传临时文件目录（位于共享目录内部，列表中不可见）。</summary>
    public string TempDirectory { get; }

    public Storage(string root)
    {
        Root = Path.GetFullPath(root);
        Directory.CreateDirectory(Root);
        TempDirectory = Path.Combine(Root, TempFolderName);
        Directory.CreateDirectory(TempDirectory);
        CleanupTempDirectory();
    }

    private string RootPrefix =>
        Root.EndsWith(Path.DirectorySeparatorChar) || Root.EndsWith(Path.AltDirectorySeparatorChar)
            ? Root
            : Root + Path.DirectorySeparatorChar;

    public string Relative(string fullPath)
    {
        var rel = Path.GetRelativePath(Root, fullPath);
        return rel == "." ? string.Empty : rel.Replace('\\', '/');
    }

    /// <summary>把前端传入的相对路径解析为共享目录内的绝对路径，并做完整越界校验。</summary>
    public string Resolve(string? relativePath, bool allowRoot = true)
    {
        var rel = (relativePath ?? string.Empty).Replace('\\', '/').Trim();
        rel = rel.Trim('/');

        if (rel is "." or "/") rel = string.Empty;

        if (rel.Length > 0)
        {
            foreach (var segment in rel.Split('/'))
            {
                if (segment.Length == 0) continue;
                if (segment is "." or "..")
                    throw new ApiException(400, "路径中不允许出现 . 或 .. 片段");
                if (IsReservedName(segment))
                    throw new ApiException(400, "该路径为系统保留路径");
                if (segment.IndexOfAny(Path.GetInvalidFileNameChars()) >= 0)
                    throw new ApiException(400, $"路径包含非法字符：{segment}");
            }
        }

        string full;
        try
        {
            full = Path.GetFullPath(rel.Length == 0 ? Root : Path.Combine(Root, rel));
        }
        catch (Exception ex) when (ex is ArgumentException or NotSupportedException or PathTooLongException)
        {
            throw new ApiException(400, "路径无效或过长");
        }

        if (!IsUnderRoot(full))
            throw new ApiException(400, "路径超出共享目录范围");

        if (IsRootPath(full))
        {
            if (!allowRoot) throw new ApiException(400, "不能对共享根目录执行该操作");
            return full;
        }

        if (IsReservedName(Path.GetFileName(full)))
            throw new ApiException(400, "该路径为系统保留路径");
        EnsureNoReparsePoint(full);
        return full;
    }

    public string ResolveDirectory(string? relativePath)
    {
        var full = Resolve(relativePath);
        if (File.Exists(full)) throw new ApiException(400, "目标是一个文件，不是文件夹");
        if (!Directory.Exists(full)) throw new ApiException(404, "文件夹不存在");
        return full;
    }

    public string ResolveFile(string? relativePath)
    {
        if (string.IsNullOrWhiteSpace(relativePath)) throw new ApiException(400, "缺少文件路径参数 path");
        var full = Resolve(relativePath, allowRoot: false);
        if (Directory.Exists(full)) throw new ApiException(400, "目标是文件夹，不是文件");
        if (!File.Exists(full)) throw new ApiException(404, "文件不存在");
        return full;
    }

    public FileEntry Describe(FileSystemInfo info)
    {
        if (info is DirectoryInfo directory)
        {
            int? childCount = null;
            try
            {
                childCount = directory.EnumerateFileSystemInfos()
                    .Count(x => !IsHiddenName(x.Name) && (x.Attributes & FileAttributes.ReparsePoint) == 0);
            }
            catch
            {
                // 无权限读取子项时忽略数量。
            }

            return new FileEntry(
                directory.Name,
                Relative(directory.FullName),
                true,
                0,
                new DateTimeOffset(directory.LastWriteTimeUtc),
                childCount,
                null);
        }

        var file = (FileInfo)info;
        return new FileEntry(
            file.Name,
            Relative(file.FullName),
            false,
            file.Length,
            new DateTimeOffset(file.LastWriteTimeUtc),
            null,
            file.Extension.TrimStart('.').ToLowerInvariant());
    }

    public IReadOnlyList<FileEntry> List(string? relativePath)
    {
        var directory = ResolveDirectory(relativePath);
        var result = new List<FileEntry>();
        try
        {
            foreach (var info in new DirectoryInfo(directory).EnumerateFileSystemInfos())
            {
                if (IsHiddenName(info.Name)) continue;
                if ((info.Attributes & FileAttributes.ReparsePoint) != 0) continue;
                result.Add(Describe(info));
            }
        }
        catch (UnauthorizedAccessException)
        {
            throw new ApiException(403, "没有权限读取该文件夹");
        }
        catch (DirectoryNotFoundException)
        {
            throw new ApiException(404, "文件夹不存在");
        }

        result.Sort(NaturalFileEntryComparer.Instance);
        return result;
    }

    public FileEntry CreateDirectory(string? relativePath)
    {
        if (string.IsNullOrWhiteSpace(relativePath)) throw new ApiException(400, "缺少文件夹路径参数 path");
        var full = Resolve(relativePath, allowRoot: false);
        if (Directory.Exists(full) || File.Exists(full))
            throw new ApiException(409, "同名文件或文件夹已存在");
        Directory.CreateDirectory(full);
        InvalidateStats();
        return Describe(new DirectoryInfo(full));
    }

    public FileEntry Move(string? fromRelative, string? toRelative)
    {
        if (string.IsNullOrWhiteSpace(fromRelative) || string.IsNullOrWhiteSpace(toRelative))
            throw new ApiException(400, "缺少 from 或 to 参数");

        var source = Resolve(fromRelative, allowRoot: false);
        var destination = Resolve(toRelative, allowRoot: false);

        if (string.Equals(source, destination, PathComparison))
            return Describe(File.Exists(source) ? new FileInfo(source) : new DirectoryInfo(source));

        var sourceIsDirectory = Directory.Exists(source);
        if (!sourceIsDirectory && !File.Exists(source))
            throw new ApiException(404, "源文件或文件夹不存在");

        if (File.Exists(destination) || Directory.Exists(destination))
            throw new ApiException(409, "目标位置已存在同名文件或文件夹");

        if (sourceIsDirectory && IsUnderPrefix(destination, source))
            throw new ApiException(400, "不能把文件夹移动到它自身内部");

        var parent = Path.GetDirectoryName(destination);
        if (!string.IsNullOrEmpty(parent)) Directory.CreateDirectory(parent);

        if (sourceIsDirectory)
        {
            Directory.Move(source, destination);
            InvalidateStats();
            return Describe(new DirectoryInfo(destination));
        }

        File.Move(source, destination);
        InvalidateStats();
        return Describe(new FileInfo(destination));
    }

    public void Delete(string? relativePath)
    {
        var full = Resolve(relativePath, allowRoot: false);
        if (Directory.Exists(full))
        {
            Directory.Delete(full, recursive: true);
            InvalidateStats();
            return;
        }

        if (File.Exists(full))
        {
            File.Delete(full);
            InvalidateStats();
            return;
        }

        throw new ApiException(404, "文件或文件夹不存在");
    }

    public string CreateTempFilePath() =>
        Path.Combine(TempDirectory, Guid.NewGuid().ToString("N", CultureInfo.InvariantCulture) + ".part");

    public StorageStats GetStats(bool refresh = false)
    {
        lock (_statsLock)
        {
            if (!refresh && DateTimeOffset.UtcNow - _stats.ComputedAt < TimeSpan.FromSeconds(3))
                return _stats;

            long files = 0;
            long bytes = 0;
            var stack = new Stack<string>();
            stack.Push(Root);

            while (stack.Count > 0)
            {
                var directory = stack.Pop();
                try
                {
                    foreach (var info in new DirectoryInfo(directory).EnumerateFileSystemInfos())
                    {
                        if (IsHiddenName(info.Name)) continue;
                        if ((info.Attributes & FileAttributes.ReparsePoint) != 0) continue;

                        if (info is DirectoryInfo child) stack.Push(child.FullName);
                        else if (info is FileInfo file)
                        {
                            files++;
                            bytes += file.Length;
                        }
                    }
                }
                catch
                {
                    // 忽略无权限目录，统计尽量完整。
                }
            }

            _stats = new StorageStats(files, bytes, DateTimeOffset.UtcNow);
            return _stats;
        }
    }

    public void InvalidateStats()
    {
        lock (_statsLock) _stats = new StorageStats(0, 0, DateTimeOffset.MinValue);
    }

    public static bool IsReservedName(string? name) =>
        string.Equals(name, TempFolderName, StringComparison.OrdinalIgnoreCase);

    /// <summary>内部目录：不在普通文件列表中显示，也不会被打包下载。</summary>
    public static bool IsHiddenName(string? name) =>
        IsReservedName(name) || string.Equals(name, DeliveryRootFolderName, StringComparison.OrdinalIgnoreCase);

    private bool IsUnderRoot(string fullPath) =>
        IsRootPath(fullPath) || fullPath.StartsWith(RootPrefix, PathComparison);

    private bool IsRootPath(string fullPath) =>
        string.Equals(fullPath.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar),
            Root.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar),
            PathComparison);

    private static bool IsUnderPrefix(string candidate, string prefix)
    {
        var normalizedPrefix = prefix.EndsWith(Path.DirectorySeparatorChar)
            ? prefix
            : prefix + Path.DirectorySeparatorChar;
        return candidate.StartsWith(normalizedPrefix, PathComparison);
    }

    private void EnsureNoReparsePoint(string fullPath)
    {
        var relative = Path.GetRelativePath(Root, fullPath);
        if (relative == ".") return;

        var current = Root;
        foreach (var part in relative.Split(Path.DirectorySeparatorChar, StringSplitOptions.RemoveEmptyEntries))
        {
            current = Path.Combine(current, part);
            try
            {
                if (!Directory.Exists(current) && !File.Exists(current)) break;
                if ((File.GetAttributes(current) & FileAttributes.ReparsePoint) != 0)
                    throw new ApiException(403, "不允许通过符号链接访问共享目录之外的内容");
            }
            catch (ApiException) { throw; }
            catch { break; }
        }
    }

    private void CleanupTempDirectory()
    {
        try
        {
            foreach (var file in Directory.EnumerateFiles(TempDirectory))
            {
                try { File.Delete(file); } catch { /* 忽略其它进程仍占用的文件 */ }
            }
        }
        catch
        {
            // 忽略清理失败，不影响启动。
        }
    }
}

/// <summary>文件夹优先、名称按“自然排序”（file2 在 file10 之前）的排序器。</summary>
public sealed class NaturalFileEntryComparer : IComparer<FileEntry>
{
    public static readonly NaturalFileEntryComparer Instance = new();

    public int Compare(FileEntry? x, FileEntry? y)
    {
        if (ReferenceEquals(x, y)) return 0;
        if (x is null) return -1;
        if (y is null) return 1;
        if (x.IsDirectory != y.IsDirectory) return x.IsDirectory ? -1 : 1;

        var result = NaturalStringComparer.Compare(x.Name, y.Name);
        return result != 0 ? result : string.CompareOrdinal(x.Name, y.Name);
    }
}

public static class NaturalStringComparer
{
    public static int Compare(string? a, string? b)
    {
        if (ReferenceEquals(a, b)) return 0;
        if (a is null) return -1;
        if (b is null) return 1;

        int ia = 0, ib = 0;
        while (ia < a.Length && ib < b.Length)
        {
            var ca = a[ia];
            var cb = b[ib];

            if (char.IsDigit(ca) && char.IsDigit(cb))
            {
                var startA = ia;
                var startB = ib;
                while (ia < a.Length && char.IsDigit(a[ia])) ia++;
                while (ib < b.Length && char.IsDigit(b[ib])) ib++;

                var numA = a.AsSpan(startA, ia - startA).TrimStart('0');
                var numB = b.AsSpan(startB, ib - startB).TrimStart('0');

                int cmp;
                if (numA.Length != numB.Length) cmp = numA.Length.CompareTo(numB.Length);
                else cmp = numA.SequenceCompareTo(numB);
                if (cmp != 0) return cmp;

                cmp = (ia - startA).CompareTo(ib - startB);
                if (cmp != 0) return cmp;
            }
            else
            {
                var cmp = char.ToUpperInvariant(ca).CompareTo(char.ToUpperInvariant(cb));
                if (cmp != 0) return cmp;
                ia++;
                ib++;
            }
        }

        return (a.Length - ia).CompareTo(b.Length - ib);
    }
}
