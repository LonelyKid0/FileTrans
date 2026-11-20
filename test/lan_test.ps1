<#
  FileTrans 局域网跨主机测试
  --------------------------
  启动服务后，用本机「局域网 IP」访问，并在可用时通过 WSL（独立的网络栈/另一个“设备”）
  完成上传、下载、哈希校验以及点对点投递收件箱验证。

  用法：
    powershell -ExecutionPolicy Bypass -File test\lan_test.ps1
    powershell -ExecutionPolicy Bypass -File test\lan_test.ps1 -NoBuild -SkipWsl
#>
[CmdletBinding()]
param(
    [switch]$NoBuild,
    [int]$Port = 0,
    [switch]$SkipWsl
)

$ErrorActionPreference = 'Stop'
foreach ($assembly in @('System.Net.Http')) {
    try { Add-Type -AssemblyName $assembly -ErrorAction Stop } catch { }
}

$script:passes = 0
$script:failures = @()

function Check {
    param([string]$Name, [bool]$Condition, [string]$Detail = '')
    if ($Condition) {
        $script:passes++
        Write-Host "  [PASS] $Name" -ForegroundColor Green
    }
    else {
        $script:failures += "$Name $Detail"
        Write-Host "  [FAIL] $Name $Detail" -ForegroundColor Red
    }
}

function Invoke-RestMethodUtf8 {
    param([string]$Method, [string]$Uri, $Body = $null, [string]$ContentType = 'application/json')
    $request = New-Object System.Net.Http.HttpRequestMessage ([System.Net.Http.HttpMethod]::new($Method), $Uri)
    if ($null -ne $Body) {
        if ($Body -is [byte[]]) {
            $request.Content = New-Object System.Net.Http.ByteArrayContent (, $Body)
            $request.Content.Headers.ContentType = [System.Net.Http.Headers.MediaTypeHeaderValue]::new('application/octet-stream')
        }
        else {
            $request.Content = New-Object System.Net.Http.StringContent ([string]$Body, [System.Text.Encoding]::UTF8, $ContentType)
        }
    }
    $response = $script:client.SendAsync($request).GetAwaiter().GetResult()
    $bytes = $response.Content.ReadAsByteArrayAsync().GetAwaiter().GetResult()
    $status = [int]$response.StatusCode
    $headers = $response.Headers
    $response.Dispose()
    $request.Dispose()
    $text = [System.Text.Encoding]::UTF8.GetString($bytes)
    return [pscustomobject]@{ Status = $status; Text = $text; Bytes = $bytes; Headers = $headers }
}

$root = Split-Path -Parent $PSScriptRoot
$project = Join-Path $root 'src\FileTrans\FileTrans.csproj'
$dll = Join-Path $root 'src\FileTrans\bin\Release\net8.0\FileTrans.dll'
$testRoot = Join-Path $root '.test'
$share = Join-Path $testRoot 'lan-share'
$logOut = Join-Path $testRoot 'lan-run.out.log'
$logErr = Join-Path $testRoot 'lan-run.err.log'
$process = $null
$script:client = $null

function Get-WslPath([string]$windowsPath) {
    $full = [IO.Path]::GetFullPath($windowsPath).Replace('\', '/')
    if ($full -match '^([A-Za-z]):/(.*)$') {
        return "/mnt/$($matches[1].ToLowerInvariant())/$($matches[2])"
    }
    return $full
}

function Invoke-Wsl([string]$command) {
    $output = wsl.exe -d Ubuntu -- bash -lc $command 2>&1 | Out-String
    return $output.Trim()
}

$wslAvailable = $false
try {
    if (-not $SkipWsl) {
        $probe = wsl.exe -d Ubuntu -- bash -lc 'echo wsl-ok' 2>&1 | Out-String
        $wslAvailable = $probe -match 'wsl-ok'
    }
}
catch { $wslAvailable = $false }

try {
    if (-not $NoBuild) {
        Write-Host '==> 构建项目 ...' -ForegroundColor Cyan
        & dotnet build $project -c Release --nologo -v quiet | Out-Host
        if ($LASTEXITCODE -ne 0) { throw 'dotnet build 失败' }
    }
    if (-not (Test-Path $dll)) { throw "找不到 $dll" }

    New-Item -ItemType Directory -Force -Path $testRoot, $share | Out-Null
    Get-ChildItem -LiteralPath $share -Force -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue

    if ($Port -le 0) {
        $listener = New-Object System.Net.Sockets.TcpListener ([System.Net.IPAddress]::Loopback), 0
        $listener.Start()
        $Port = ([System.Net.IPEndPoint]$listener.LocalEndpoint).Port
        $listener.Stop()
    }

    Remove-Item -LiteralPath $logOut, $logErr -Force -ErrorAction SilentlyContinue
    Write-Host "==> 启动服务，端口 $Port ..." -ForegroundColor Cyan
    $process = Start-Process -FilePath 'dotnet' `
        -ArgumentList @($dll, '--port', $Port, '--data', $share, '--no-browser') `
        -WorkingDirectory $root -PassThru -WindowStyle Hidden `
        -RedirectStandardOutput $logOut -RedirectStandardError $logErr

    $base = "http://127.0.0.1:$Port/"
    $script:client = New-Object System.Net.Http.HttpClient
    $script:client.Timeout = [TimeSpan]::FromSeconds(120)

    $ready = $false
    for ($i = 0; $i -lt 100; $i++) {
        Start-Sleep -Milliseconds 200
        try {
            $probe = Invoke-RestMethodUtf8 -Method 'GET' -Uri ($base + 'api/health')
            if ($probe.Status -eq 200) { $ready = $true; break }
        }
        catch { }
    }
    if (-not $ready) { throw '测试服务未能启动' }

    $info = (Invoke-RestMethodUtf8 -Method 'GET' -Uri ($base + 'api/info')).Text | ConvertFrom-Json
    $lanUrls = @($info.urls.lan)
    Check '检测到局域网地址' ($lanUrls.Count -gt 0) ($lanUrls -join ', ')
    if ($lanUrls.Count -eq 0) { throw '未检测到局域网 IPv4 地址，无法进行跨主机测试' }
    $lanUrl = $lanUrls[0].TrimEnd('/')
    Write-Host "    使用局域网地址：$lanUrl" -ForegroundColor DarkGray

    Write-Host ''
    Write-Host '==> 本机通过局域网地址访问' -ForegroundColor Cyan
    $lanHealth = Invoke-RestMethodUtf8 -Method 'GET' -Uri ($lanUrl + '/api/health')
    Check '局域网地址健康检查' ($lanHealth.Status -eq 200) "status=$($lanHealth.Status)"

    $hostBytes = New-Object byte[] (256 * 1024)
    (New-Object System.Random 2026).NextBytes($hostBytes)
    $upload = Invoke-RestMethodUtf8 -Method 'PUT' -Uri ($lanUrl + '/api/files/content?path=' + [Uri]::EscapeDataString('来自宿主机.bin')) -Body $hostBytes
    Check '通过局域网地址上传文件' ($upload.Status -eq 201) "status=$($upload.Status)"
    $download = Invoke-RestMethodUtf8 -Method 'GET' -Uri ($lanUrl + '/api/files/content?path=' + [Uri]::EscapeDataString('来自宿主机.bin'))
    $downloadHash = [BitConverter]::ToString([System.Security.Cryptography.SHA256]::Create().ComputeHash($download.Bytes))
    $uploadHash = [BitConverter]::ToString([System.Security.Cryptography.SHA256]::Create().ComputeHash($hostBytes))
    Check '通过局域网地址下载并校验' ($downloadHash -eq $uploadHash)

    if ($wslAvailable) {
        Write-Host ''
        Write-Host '==> WSL（另一个网络栈）访问' -ForegroundColor Cyan
        $wslHealth = Invoke-Wsl "curl -sS -m 10 -o /dev/null -w '%{http_code}' $lanUrl/api/health"
        Check 'WSL 可访问局域网地址' ($wslHealth -eq '200') "code=$wslHealth"

        $wslUploadName = '来自WSL.bin'
        $wslSourcePath = Join-Path $testRoot 'lan-wsl-source.bin'
        $wslBytes = New-Object byte[] (128 * 1024)
        (New-Object System.Random 2027).NextBytes($wslBytes)
        [IO.File]::WriteAllBytes($wslSourcePath, $wslBytes)
        $wslSource = Get-WslPath $wslSourcePath
        $encodedName = [Uri]::EscapeDataString($wslUploadName)
        $wslUpload = Invoke-Wsl "curl -sS -m 30 -o /dev/null -w '%{http_code}' -X PUT --data-binary @'$wslSource' $lanUrl/api/files/content?path=$encodedName"
        Check 'WSL 上传文件到共享目录' ($wslUpload -eq '201') "code=$wslUpload"

        $wslDownloadPath = Join-Path $testRoot 'lan-wsl-download.bin'
        $wslDownloadArg = Get-WslPath $wslDownloadPath
        $wslDownload = Invoke-Wsl "curl -sS -m 30 -o '$wslDownloadArg' -w '%{http_code}' $lanUrl/api/files/content?path=$encodedName"
        Check 'WSL 下载文件' ($wslDownload -eq '200') "code=$wslDownload"
        if (Test-Path $wslDownloadPath) {
            $wslHash = (Get-FileHash -LiteralPath $wslDownloadPath -Algorithm SHA256).Hash
            $sourceHash = (Get-FileHash -LiteralPath $wslSourcePath -Algorithm SHA256).Hash
            Check 'WSL 上传下载内容一致' ($wslHash -eq $sourceHash)
        }
        else {
            Check 'WSL 上传下载内容一致' $false '下载文件不存在'
        }

        Write-Host ''
        Write-Host '==> 跨主机点对点投递（宿主机 → WSL 用户，WSL → 宿主机）' -ForegroundColor Cyan
        $hostClientId = 'host-' + ([Guid]::NewGuid().ToString('N'))
        $wslClientId = 'wsl-' + ([Guid]::NewGuid().ToString('N'))

        $hostPresenceBody = @{ clientId = $hostClientId; name = 'Host user' } | ConvertTo-Json -Compress
        $wslPresenceBody = @{ clientId = $wslClientId; name = 'WSL user' } | ConvertTo-Json -Compress
        $hostPresence = Invoke-RestMethodUtf8 -Method 'POST' -Uri ($base + 'api/presence') -Body $hostPresenceBody
        Check '宿主机用户注册' (($hostPresence.Status -eq 200) -and ($hostPresence.Text -match 'Host user')) "status=$($hostPresence.Status)"

        $wslPresenceFile = Join-Path $testRoot 'lan-wsl-presence.json'
        [IO.File]::WriteAllText($wslPresenceFile, $wslPresenceBody, [System.Text.Encoding]::UTF8)
        $wslPresence = Invoke-Wsl "curl -sS -m 20 -X POST -H 'Content-Type: application/json' --data-binary @'$(Get-WslPath $wslPresenceFile)' $lanUrl/api/presence"
        Check 'WSL 用户注册' ($wslPresence -match 'WSL user') $wslPresence

        $prepareBody = @{ senderClientId = $hostClientId; recipientClientId = $wslClientId } | ConvertTo-Json -Compress
        $prepare = Invoke-RestMethodUtf8 -Method 'POST' -Uri ($base + 'api/deliver/prepare') -Body $prepareBody
        $delivery = $prepare.Text | ConvertFrom-Json
        Check '宿主机创建投递目录' ($prepare.Status -eq 200 -and -not [string]::IsNullOrWhiteSpace($delivery.deliveryPath)) "status=$($prepare.Status)"

        $deliveryFile = $delivery.deliveryPath + '/给WSL用户的文件.txt'
        $deliveryText = '来自宿主机的点对点文件'
        $deliveryBytes = [System.Text.Encoding]::UTF8.GetBytes($deliveryText)
        $deliveryUpload = Invoke-RestMethodUtf8 -Method 'PUT' -Uri ($base + 'api/files/content?path=' + [Uri]::EscapeDataString($deliveryFile)) -Body $deliveryBytes
        Check '宿主机上传投递文件' ($deliveryUpload.Status -eq 201) "status=$($deliveryUpload.Status)"

        $inboxJson = Invoke-Wsl "curl -sS -m 15 '$lanUrl/api/inbox?clientId=$wslClientId'"
        Check 'WSL 收件箱显示宿主机投递' ($inboxJson -match 'Host user' -and $inboxJson -match '给WSL用户的文件') $inboxJson

        # 反向：WSL 发送给宿主机
        $reverseBody = @{ senderClientId = $wslClientId; recipientClientId = $hostClientId } | ConvertTo-Json -Compress
        $reverseBodyFile = Join-Path $testRoot 'lan-reverse-prepare.json'
        [IO.File]::WriteAllText($reverseBodyFile, $reverseBody, [System.Text.Encoding]::UTF8)
        $reversePrepare = Invoke-Wsl "curl -sS -m 20 -X POST -H 'Content-Type: application/json' --data-binary @'$(Get-WslPath $reverseBodyFile)' $lanUrl/api/deliver/prepare"
        $reverseDelivery = $reversePrepare | ConvertFrom-Json
        Check 'WSL 创建投递目录' (-not [string]::IsNullOrWhiteSpace($reverseDelivery.deliveryPath)) $reversePrepare
        if ($reverseDelivery.deliveryPath) {
            $reverseFile = $reverseDelivery.deliveryPath + '/给宿主机的文件.txt'
            $reverseSourcePath = Join-Path $testRoot 'lan-wsl-message.txt'
            [IO.File]::WriteAllText($reverseSourcePath, '来自 WSL 用户的点对点文件', [System.Text.Encoding]::UTF8)
            $reverseUpload = Invoke-Wsl "curl -sS -m 20 -o /dev/null -w '%{http_code}' -X PUT --data-binary @'$(Get-WslPath $reverseSourcePath)' '$lanUrl/api/files/content?path=$([Uri]::EscapeDataString($reverseFile))'"
            Check 'WSL 上传投递文件' ($reverseUpload -eq '201') "code=$reverseUpload"
            $hostInbox = (Invoke-RestMethodUtf8 -Method 'GET' -Uri ($base + 'api/inbox?clientId=' + $hostClientId)).Text | ConvertFrom-Json
            $hostInboxText = $hostInbox | ConvertTo-Json -Depth 8 -Compress
            Check '宿主机收件箱显示 WSL 投递' ($hostInboxText -match 'WSL user' -and $hostInboxText -match '给宿主机的文件') $hostInboxText
        }
    }
    else {
        Write-Host '==> 未检测到可用的 WSL，跳过跨主机测试' -ForegroundColor Yellow
    }
}
catch {
    Write-Host ''
    Write-Host "测试执行出错：$($_.Exception.Message)" -ForegroundColor Red
    $script:failures += "测试执行异常：$($_.Exception.Message)"
}
finally {
    if ($script:client) { $script:client.Dispose() }
    if ($process -and -not $process.HasExited) {
        Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
        Write-Host '==> 测试服务已停止'
    }
}

Write-Host ''
Write-Host ('=' * 56)
if ($script:failures.Count -eq 0) {
    Write-Host "全部通过：$($script:passes) 项检查" -ForegroundColor Green
    exit 0
}
else {
    Write-Host "通过 $($script:passes) 项，失败 $($script:failures.Count) 项：" -ForegroundColor Red
    $script:failures | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
    exit 1
}
