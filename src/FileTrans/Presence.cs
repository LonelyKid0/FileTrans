using System.Collections.Concurrent;
using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;

namespace FileTrans;

public sealed record PresenceUser(
    string ClientId,
    string Name,
    string Ip,
    string DeliveryPath,
    bool IsSelf,
    DateTimeOffset LastSeen,
    bool Online);

public sealed record PresenceSnapshot(PresenceUser Self, IReadOnlyList<PresenceUser> Users);

public sealed record InboxDelivery(
    string Path,
    string Sender,
    DateTimeOffset DeliveredAt,
    long TotalBytes,
    IReadOnlyList<FileEntry> Files);

public sealed record PresenceRequest(string? ClientId, string? Name);

public sealed record PrepareDeliveryRequest(string? SenderClientId, string? RecipientClientId);

/// <summary>内存中的在线用户表：支持修改昵称、心跳与点对点投递目录。</summary>
public sealed class PresenceService
{
    public static readonly TimeSpan OnlineWindow = TimeSpan.FromSeconds(45);
    private static readonly TimeSpan RetainWindow = TimeSpan.FromHours(24);
    private static readonly Regex DeliveryFolderPattern = new(
        @"^来自-(?<sender>.+)-(?<stamp>\d{8}-\d{6})-(?<rand>\d{4})$",
        RegexOptions.Compiled | RegexOptions.CultureInvariant);

    private readonly ConcurrentDictionary<string, PresenceEntry> _users = new(StringComparer.Ordinal);

    public PresenceSnapshot Touch(string? clientId, string? name, string ip)
    {
        var id = NormalizeClientId(clientId);
        var entry = _users.GetOrAdd(id, key => new PresenceEntry(key, DefaultName(key)));
        lock (entry.Sync)
        {
            var cleanName = SanitizeName(name);
            if (cleanName.Length > 0) entry.Name = cleanName;
            entry.Ip = string.IsNullOrWhiteSpace(ip) ? entry.Ip : ip;
            entry.LastSeen = DateTimeOffset.UtcNow;
        }

        RemoveStale();
        return Snapshot(id);
    }

    public PresenceSnapshot Snapshot(string? clientId)
    {
        var id = NormalizeClientId(clientId);
        var now = DateTimeOffset.UtcNow;
        var users = _users.Values
            .Select(entry =>
            {
                lock (entry.Sync) return entry.ToUser(id, now);
            })
            .OrderByDescending(user => user.IsSelf)
            .ThenByDescending(user => user.Online)
            .ThenBy(user => user.Name, StringComparer.OrdinalIgnoreCase)
            .ToList();

        var self = users.FirstOrDefault(user => user.IsSelf);
        if (self is null)
        {
            self = new PresenceUser(id, DefaultName(id), string.Empty, DeliveryRootFor(id), true, now, false);
            users.Insert(0, self);
        }

        return new PresenceSnapshot(self, users);
    }

    public PresenceUser RequireOnline(string? clientId)
    {
        var id = NormalizeClientId(clientId);
        if (!_users.TryGetValue(id, out var entry))
            throw new ApiException(404, "对方尚未打开本页面");

        PresenceUser user;
        lock (entry.Sync) user = entry.ToUser(id, DateTimeOffset.UtcNow);
        if (!user.Online)
            throw new ApiException(409, "对方已离线，请让对方保持页面打开后重试");
        return user;
    }

    /// <summary>创建一次投递目录（发送方 → 接收方），返回共享目录内的相对路径。</summary>
    public string BeginDelivery(string? senderClientId, string? recipientClientId)
    {
        var sender = RequireOnline(senderClientId);
        var recipient = RequireOnline(recipientClientId);
        if (string.Equals(sender.ClientId, recipient.ClientId, StringComparison.Ordinal))
            throw new ApiException(400, "不能发送给自己");

        var safeName = SanitizeName(sender.Name);
        if (safeName.Length == 0) safeName = "用户";

        var folder = $"来自-{safeName}-{DateTimeOffset.Now:yyyyMMdd-HHmmss}-{Random.Shared.Next(1000, 9999)}";
        return $"{DeliveryRootFor(recipient.ClientId)}/{folder}";
    }

    public static string DeliveryRootFor(string normalizedClientId) =>
        $"{Storage.DeliveryRootFolderName}/{DeliveryPathSegment(normalizedClientId)}";

    public static string DeliveryPathSegment(string normalizedClientId) =>
        "u-" + ShortHash(normalizedClientId);

    public static string NormalizeClientId(string? clientId)
    {
        if (string.IsNullOrWhiteSpace(clientId))
            throw new ApiException(400, "缺少客户端标识 clientId");

        var id = clientId.Trim();
        if (id.Length is < 8 or > 64)
            throw new ApiException(400, "客户端标识长度无效");

        foreach (var character in id)
        {
            if (!char.IsAsciiLetterOrDigit(character) && character is not ('-' or '_'))
                throw new ApiException(400, "客户端标识包含非法字符");
        }

        return id;
    }

    public static string SanitizeName(string? name)
    {
        if (string.IsNullOrWhiteSpace(name)) return string.Empty;

        var builder = new StringBuilder(name.Length);
        foreach (var character in name.Trim())
        {
            if (char.IsControl(character)) continue;
            if (character is '/' or '\\' or ':' or '*' or '?' or '"' or '<' or '>' or '|') continue;
            builder.Append(character);
        }

        var result = builder.ToString().Trim().Trim('.');
        if (result.Length > 24) result = result[..24].Trim();
        return result.Trim('.');
    }

    public static bool TryParseDeliveryFolder(string folderName, out string sender, out DateTimeOffset deliveredAt)
    {
        sender = folderName;
        deliveredAt = default;

        var match = DeliveryFolderPattern.Match(folderName);
        if (!match.Success) return false;

        sender = match.Groups["sender"].Value;
        if (!DateTime.TryParseExact(
                match.Groups["stamp"].Value,
                "yyyyMMdd-HHmmss",
                CultureInfo.InvariantCulture,
                DateTimeStyles.None,
                out var parsed))
        {
            return false;
        }

        deliveredAt = new DateTimeOffset(parsed, TimeZoneInfo.Local.GetUtcOffset(parsed));
        return true;
    }

    private static string DefaultName(string clientId)
    {
        var suffix = clientId.Length >= 4 ? clientId[..4] : clientId;
        return $"访客-{suffix.ToUpperInvariant()}";
    }

    private static string ShortHash(string clientId)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(clientId));
        return Convert.ToHexString(bytes, 0, 5).ToLowerInvariant();
    }

    private void RemoveStale()
    {
        var cutoff = DateTimeOffset.UtcNow - RetainWindow;
        foreach (var pair in _users)
        {
            DateTimeOffset lastSeen;
            lock (pair.Value.Sync) lastSeen = pair.Value.LastSeen;
            if (lastSeen < cutoff)
                _users.TryRemove(pair.Key, out _);
        }
    }
}

internal sealed class PresenceEntry
{
    public PresenceEntry(string clientId, string name)
    {
        ClientId = clientId;
        Name = name;
        Ip = string.Empty;
        LastSeen = DateTimeOffset.UtcNow;
    }

    public object Sync { get; } = new();
    public string ClientId { get; }
    public string Name { get; set; }
    public string Ip { get; set; }
    public DateTimeOffset LastSeen { get; set; }

    public PresenceUser ToUser(string selfClientId, DateTimeOffset now) =>
        new(
            ClientId,
            Name,
            Ip,
            PresenceService.DeliveryRootFor(ClientId),
            string.Equals(ClientId, selfClientId, StringComparison.Ordinal),
            LastSeen,
            now - LastSeen <= PresenceService.OnlineWindow);
}
