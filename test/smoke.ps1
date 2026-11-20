<#
  FileTrans 冒烟测试
  ------------------
  自动构建并启动一个临时服务实例，覆盖上传 / 下载 / 校验 / Range / 预览 /
  重命名 / 打包 / 路径穿越防护 / 冲突处理 / 删除等核心接口。

  用法：
    powershell -ExecutionPolicy Bypass -File test\smoke.ps1
    powershell -ExecutionPolicy Bypass -File test\smoke.ps1 -NoBuild
#>
[CmdletBinding()]
param(
    [switch]$NoBuild,
    [int]$Port = 0
)

$ErrorActionPreference = 'Stop'

# Windows PowerShell 5.1 需要显式加载这些程序集。
foreach ($assembly in @('System.Net.Http', 'System.IO.Compression', 'System.IO.Compression.FileSystem')) {
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

function Invoke-Api {
    param(
        [string]$Method,
        [string]$Path,
        $Body = $null,
        [string]$ContentType = 'application/octet-stream',
        [hashtable]$Headers = @{}
    )

    $target = $Path
    if ($target.StartsWith('http')) { }
    elseif ($target.Length -eq 0) { $target = $script:client.BaseAddress.AbsoluteUri }
    $request = New-Object System.Net.Http.HttpRequestMessage ([System.Net.Http.HttpMethod]::new($Method), $target)
    foreach ($key in $Headers.Keys) {
        [void]$request.Headers.TryAddWithoutValidation($key, [string]$Headers[$key])
    }

    if ($null -ne $Body) {
        if ($Body -is [byte[]]) {
            $content = New-Object System.Net.Http.ByteArrayContent (, $Body)
            $content.Headers.ContentType = [System.Net.Http.Headers.MediaTypeHeaderValue]::new($ContentType)
            $request.Content = $content
        }
        else {
            $content = New-Object System.Net.Http.StringContent ([string]$Body, [System.Text.Encoding]::UTF8, $ContentType)
            $request.Content = $content
        }
    }

    $response = $script:client.SendAsync($request).GetAwaiter().GetResult()
    $bytes = $response.Content.ReadAsByteArrayAsync().GetAwaiter().GetResult()
    $result = [pscustomobject]@{
        Status         = [int]$response.StatusCode
        Headers        = $response.Headers
        ContentHeaders = $response.Content.Headers
        Bytes          = $bytes
        Text           = [System.Text.Encoding]::UTF8.GetString($bytes)
    }
    $response.Dispose()
    $request.Dispose()
    return $result
}

function Upload-Bytes {
    param([string]$Path, [byte[]]$Bytes, [switch]$Overwrite)
    $url = 'api/files/content?path=' + [Uri]::EscapeDataString($Path)
    if ($Overwrite) { $url += '&overwrite=1' }
    return Invoke-Api -Method 'PUT' -Path $url -Body $Bytes
}

function Get-Json {
    param($Response)
    return $Response.Text | ConvertFrom-Json
}

$root = Split-Path -Parent $PSScriptRoot
$project = Join-Path $root 'src\FileTrans\FileTrans.csproj'
$dll = Join-Path $root 'src\FileTrans\bin\Release\net8.0\FileTrans.dll'
$testRoot = Join-Path $root '.test'
$share = Join-Path $testRoot 'smoke-share'
$logOut = Join-Path $testRoot 'smoke-server.out.log'
$logErr = Join-Path $testRoot 'smoke-server.err.log'
$process = $null
$script:client = $null

try {
    if (-not $NoBuild) {
        Write-Host '==> 构建项目 ...' -ForegroundColor Cyan
        & dotnet build $project -c Release --nologo -v quiet | Out-Host
        if ($LASTEXITCODE -ne 0) { throw 'dotnet build 失败' }
    }

    if (-not (Test-Path $dll)) { throw "找不到 $dll，请先执行 dotnet build -c Release" }

    New-Item -ItemType Directory -Force -Path $testRoot, $share | Out-Null
    Get-ChildItem -LiteralPath $share -Force -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue

    if ($Port -le 0) {
        $listener = New-Object System.Net.Sockets.TcpListener ([System.Net.IPAddress]::Loopback), 0
        $listener.Start()
        $Port = ([System.Net.IPEndPoint]$listener.LocalEndpoint).Port
        $listener.Stop()
    }

    Remove-Item -LiteralPath $logOut, $logErr -Force -ErrorAction SilentlyContinue
    Write-Host "==> 启动测试服务，端口 $Port ..." -ForegroundColor Cyan
    $process = Start-Process -FilePath 'dotnet' `
        -ArgumentList @($dll, '--port', $Port, '--data', $share, '--no-browser') `
        -WorkingDirectory $root -PassThru -WindowStyle Hidden `
        -RedirectStandardOutput $logOut -RedirectStandardError $logErr

    $base = "http://127.0.0.1:$Port/"
    $script:client = New-Object System.Net.Http.HttpClient
    $script:client.BaseAddress = [Uri]$base
    $script:client.Timeout = [TimeSpan]::FromSeconds(120)

    $ready = $false
    for ($i = 0; $i -lt 100; $i++) {
        Start-Sleep -Milliseconds 200
        try {
            $probe = Invoke-Api -Method 'GET' -Path 'api/health'
            if ($probe.Status -eq 200) { $ready = $true; break }
        }
        catch { }
    }
    if (-not $ready) { throw '测试服务未能启动，请查看 .test\smoke-server.*.log' }

    Write-Host ''
    Write-Host '==> 静态页面' -ForegroundColor Cyan
    $page = Invoke-Api -Method 'GET' -Path $base
    Check '首页返回 200' ($page.Status -eq 200) "status=$($page.Status)"
    Check '首页包含应用标题' ($page.Text.Contains('局域网文件快传'))
    $js = Invoke-Api -Method 'GET' -Path 'app.js'
    Check 'app.js 可访问' ($js.Status -eq 200 -and $js.Text.Length -gt 5000) "length=$($js.Text.Length)"
    $css = Invoke-Api -Method 'GET' -Path 'app.css'
    Check 'app.css 可访问' ($css.Status -eq 200 -and $css.Text.Length -gt 1000) "length=$($css.Text.Length)"
    $spa = Invoke-Api -Method 'GET' -Path 'some/deep/route'
    Check '前端路由回退到首页' ($spa.Status -eq 200 -and $spa.Text.Contains('局域网文件快传'))

    Write-Host ''
    Write-Host '==> 服务信息' -ForegroundColor Cyan
    $infoResponse = Invoke-Api -Method 'GET' -Path 'api/info'
    $info = Get-Json $infoResponse
    Check 'info 返回 200' ($infoResponse.Status -eq 200) "status=$($infoResponse.Status)"
    Check 'info.app 正确' ($info.app -eq 'FileTrans')
    Check 'info 端口正确' ([int]$info.port -eq $Port) "port=$($info.port)"
    Check 'info 返回共享目录' (-not [string]::IsNullOrWhiteSpace($info.storage.root))
    Check 'info 包含本机地址' ($info.urls.local -like "*:$Port/*")

    Write-Host ''
    Write-Host '==> 文件夹与上传' -ForegroundColor Cyan
    $folderName = '资料 目录'
    $folderPath = '资料 目录/子文件夹'
    $create = Invoke-Api -Method 'POST' -Path ('api/files/directory?path=' + [Uri]::EscapeDataString($folderPath))
    Check '创建多级文件夹' ($create.Status -eq 201) "status=$($create.Status)"

    $textContent = '你好，局域网！FileTrans smoke test 1234567890'
    $textBytes = [System.Text.Encoding]::UTF8.GetBytes($textContent)
    $textRelative = '资料 目录/子文件夹/中文 文件.txt'
    $uploadText = Upload-Bytes -Path $textRelative -Bytes $textBytes
    Check '上传中文路径文件' ($uploadText.Status -eq 201) "status=$($uploadText.Status)"
    $uploadJson = Get-Json $uploadText
    Check '上传返回文件大小' ([int64]$uploadJson.file.size -eq $textBytes.Length) "size=$($uploadJson.file.size)"

    $emptyUpload = Upload-Bytes -Path 'empty.bin' -Bytes ([byte[]]@())
    Check '上传空文件' ($emptyUpload.Status -eq 201) "status=$($emptyUpload.Status)"

    $largeBytes = New-Object byte[] (5 * 1024 * 1024)
    (New-Object System.Random 20261119).NextBytes($largeBytes)
    $largeRelative = 'large-5mb.bin'
    $uploadLarge = Upload-Bytes -Path $largeRelative -Bytes $largeBytes
    Check '上传 5MB 文件' ($uploadLarge.Status -eq 201) "status=$($uploadLarge.Status)"

    $specialRelative = '特殊#%& 名称.txt'
    $specialContent = 'special characters # % &'
    $uploadSpecial = Upload-Bytes -Path $specialRelative -Bytes ([System.Text.Encoding]::UTF8.GetBytes($specialContent))
    Check '上传含特殊字符文件名' ($uploadSpecial.Status -eq 201) "status=$($uploadSpecial.Status)"
    $specialDownload = Invoke-Api -Method 'GET' -Path ('api/files/content?path=' + [Uri]::EscapeDataString($specialRelative))
    Check '下载含特殊字符文件名' ($specialDownload.Status -eq 200 -and $specialDownload.Text -eq $specialContent) "status=$($specialDownload.Status)"

    $nestedUpload = Upload-Bytes -Path '自动创建/深层/目录/deep.txt' -Bytes ([System.Text.Encoding]::UTF8.GetBytes('deep'))
    Check '上传时自动创建多级目录' ($nestedUpload.Status -eq 201) "status=$($nestedUpload.Status)"

    Write-Host ''
    Write-Host '==> 列表与下载' -ForegroundColor Cyan
    $rootList = Get-Json (Invoke-Api -Method 'GET' -Path 'api/files')
    $rootNames = @($rootList.entries | ForEach-Object { $_.name })
    Check '根目录列出文件' ($rootNames -contains 'large-5mb.bin')
    Check '根目录列出文件夹' ($rootNames -contains $folderName)
    $dirEntry = $rootList.entries | Where-Object { $_.name -eq $folderName } | Select-Object -First 1
    Check '文件夹带子项数量' ($null -ne $dirEntry -and [int]$dirEntry.childCount -ge 1) "childCount=$($dirEntry.childCount)"

    $list = Get-Json (Invoke-Api -Method 'GET' -Path ('api/files?path=' + [Uri]::EscapeDataString('资料 目录/子文件夹')))
    $fileEntry = $list.entries | Where-Object { $_.name -eq '中文 文件.txt' } | Select-Object -First 1
    Check '子目录列出中文文件' ($null -ne $fileEntry)
    Check '列表文件大小正确' ($null -ne $fileEntry -and [int64]$fileEntry.size -eq $textBytes.Length)

    $download = Invoke-Api -Method 'GET' -Path ('api/files/content?path=' + [Uri]::EscapeDataString($textRelative))
    Check '下载返回 200' ($download.Status -eq 200) "status=$($download.Status)"
    Check '下载内容一致' ($download.Text -eq $textContent)
    Check '下载包含中文文件名响应头' ($download.ContentHeaders.ContentDisposition.ToString().Contains("filename*=")) ($download.ContentHeaders.ContentDisposition.ToString())

    $largeDownload = Invoke-Api -Method 'GET' -Path ('api/files/content?path=' + [Uri]::EscapeDataString($largeRelative))
    $largeHashSrc = [System.Security.Cryptography.SHA256]::Create().ComputeHash($largeBytes)
    $largeHashDst = [System.Security.Cryptography.SHA256]::Create().ComputeHash($largeDownload.Bytes)
    Check '5MB 文件下载后 SHA256 一致' (([BitConverter]::ToString($largeHashSrc)) -eq ([BitConverter]::ToString($largeHashDst)))

    $range = Invoke-Api -Method 'GET' -Path ('api/files/content?path=' + [Uri]::EscapeDataString($largeRelative)) -Headers @{ Range = 'bytes=0-99' }
    Check 'Range 请求返回 206' ($range.Status -eq 206) "status=$($range.Status)"
    Check 'Range 返回 100 字节' ($range.Bytes.Length -eq 100) "length=$($range.Bytes.Length)"
    $expectedRange = New-Object byte[] 100
    [Array]::Copy($largeBytes, $expectedRange, 100)
    Check 'Range 内容正确' ([Convert]::ToBase64String([byte[]]$range.Bytes) -eq [Convert]::ToBase64String([byte[]]$expectedRange))

    Write-Host ''
    Write-Host '==> 在线预览' -ForegroundColor Cyan
    $textPreview = Invoke-Api -Method 'GET' -Path ('api/files/text?path=' + [Uri]::EscapeDataString($textRelative))
    Check '文本预览返回 200' ($textPreview.Status -eq 200) "status=$($textPreview.Status)"
    Check '文本预览内容一致' ($textPreview.Text -eq $textContent)

    $pngBytes = [byte[]](0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 1, 2, 3, 4)
    [void](Upload-Bytes -Path 'pic.png' -Bytes $pngBytes)
    $inline = Invoke-Api -Method 'GET' -Path ('api/files/content?path=pic.png&inline=1')
    Check '图片内联返回 image/png' ($inline.ContentHeaders.ContentType.MediaType -eq 'image/png') ($inline.ContentHeaders.ContentType.MediaType)

    [void](Upload-Bytes -Path 'page.html' -Bytes ([System.Text.Encoding]::UTF8.GetBytes('<script>alert(1)</script>')))
    $htmlInline = Invoke-Api -Method 'GET' -Path 'api/files/content?path=page.html&inline=1'
    Check 'HTML 不允许内联执行' ($htmlInline.ContentHeaders.ContentType.MediaType -eq 'application/octet-stream') ($htmlInline.ContentHeaders.ContentType.MediaType)
    Check 'HTML 作为附件下载' ($null -ne $htmlInline.ContentHeaders.ContentDisposition) ($htmlInline.ContentHeaders.ContentDisposition)

    Write-Host ''
    Write-Host '==> 同名冲突与覆盖' -ForegroundColor Cyan
    $conflictBody = @{ paths = @($textRelative, 'not-exists.bin') } | ConvertTo-Json -Compress
    $conflictResponse = Invoke-Api -Method 'POST' -Path 'api/files/conflicts' -Body $conflictBody -ContentType 'application/json'
    $conflict = Get-Json $conflictResponse
    Check '冲突检测接口返回 200' ($conflictResponse.Status -eq 200) "status=$($conflictResponse.Status)"
    Check '冲突检测命中已存在文件' (@($conflict.conflicts) -contains $textRelative)
    Check '冲突检测忽略不存在文件' (-not (@($conflict.conflicts) -contains 'not-exists.bin'))

    $duplicate = Upload-Bytes -Path $textRelative -Bytes $textBytes
    Check '重复上传返回 409' ($duplicate.Status -eq 409) "status=$($duplicate.Status)"
    $newBytes = [System.Text.Encoding]::UTF8.GetBytes('overwritten content')
    $overwrite = Upload-Bytes -Path $textRelative -Bytes $newBytes -Overwrite
    Check '覆盖上传返回 201' ($overwrite.Status -eq 201) "status=$($overwrite.Status)"
    $afterOverwrite = Invoke-Api -Method 'GET' -Path ('api/files/content?path=' + [Uri]::EscapeDataString($textRelative))
    Check '覆盖后内容已更新' ($afterOverwrite.Text -eq 'overwritten content')

    Write-Host ''
    Write-Host '==> 重命名与打包下载' -ForegroundColor Cyan
    $renamedRelative = '资料 目录/子文件夹/重命名 文件.txt'
    $rename = Invoke-Api -Method 'POST' -Path ('api/files/rename?from=' + [Uri]::EscapeDataString($textRelative) + '&to=' + [Uri]::EscapeDataString($renamedRelative))
    Check '重命名返回 200' ($rename.Status -eq 200) "status=$($rename.Status)"
    $oldStat = Get-Json (Invoke-Api -Method 'GET' -Path ('api/files/stat?path=' + [Uri]::EscapeDataString($textRelative)))
    Check '旧路径已不存在' (-not [bool]$oldStat.exists)
    $newStat = Get-Json (Invoke-Api -Method 'GET' -Path ('api/files/stat?path=' + [Uri]::EscapeDataString($renamedRelative)))
    Check '新路径存在' ([bool]$newStat.exists)

    $renameConflict = Invoke-Api -Method 'POST' -Path ('api/files/rename?from=' + [Uri]::EscapeDataString($renamedRelative) + '&to=' + [Uri]::EscapeDataString('large-5mb.bin'))
    Check '重命名到已存在路径返回 409' ($renameConflict.Status -eq 409) "status=$($renameConflict.Status)"

    $archive = Invoke-Api -Method 'GET' -Path ('api/archive?path=' + [Uri]::EscapeDataString('资料 目录'))
    Check '打包下载返回 200' ($archive.Status -eq 200) "status=$($archive.Status)"
    Check '打包内容为 ZIP' ($archive.ContentHeaders.ContentType.MediaType -eq 'application/zip') ($archive.ContentHeaders.ContentType.MediaType)
    $zipNames = @()
    if ($archive.Bytes.Length -gt 0) {
        $memory = New-Object System.IO.MemoryStream (, $archive.Bytes)
        $zip = New-Object System.IO.Compression.ZipArchive ($memory, [System.IO.Compression.ZipArchiveMode]::Read)
        $zipNames = @($zip.Entries | ForEach-Object { $_.FullName })
        $zip.Dispose()
        $memory.Dispose()
    }
    Check 'ZIP 中包含重命名后的文件' ($zipNames -contains '子文件夹/重命名 文件.txt') ($zipNames -join ', ')

    Write-Host ''
    Write-Host '==> 用户点对点投递' -ForegroundColor Cyan
    $clientA = 'smoke-host-' + [Guid]::NewGuid().ToString('N')
    $clientB = 'smoke-user-' + [Guid]::NewGuid().ToString('N')
    $presenceA = Invoke-Api -Method 'POST' -Path 'api/presence' -Body (@{ clientId = $clientA; name = 'Smoke host' } | ConvertTo-Json -Compress) -ContentType 'application/json'
    $presenceB = Invoke-Api -Method 'POST' -Path 'api/presence' -Body (@{ clientId = $clientB; name = 'Smoke user' } | ConvertTo-Json -Compress) -ContentType 'application/json'
    $presenceSnapshot = Get-Json $presenceB
    Check '在线用户注册成功' ($presenceA.Status -eq 200) "status=$($presenceA.Status)"
    Check '第二位用户已在线' ($presenceB.Status -eq 200 -and @($presenceSnapshot.users).Count -ge 2) "status=$($presenceB.Status) users=$(@($presenceSnapshot.users).Count)"

    $prepare = Invoke-Api -Method 'POST' -Path 'api/deliver/prepare' -Body (@{ senderClientId = $clientA; recipientClientId = $clientB } | ConvertTo-Json -Compress) -ContentType 'application/json'
    $deliveryInfo = Get-Json $prepare
    Check '创建点对点投递目录' ($prepare.Status -eq 200 -and -not [string]::IsNullOrWhiteSpace($deliveryInfo.deliveryPath)) "status=$($prepare.Status)"
    $deliveredName = '投递给第二位用户.txt'
    $deliveredRelative = $deliveryInfo.deliveryPath + '/' + $deliveredName
    $deliveryBytes = [System.Text.Encoding]::UTF8.GetBytes('point to point delivery')
    $deliveryUpload = Upload-Bytes -Path $deliveredRelative -Bytes $deliveryBytes
    Check '发送方上传投递文件' ($deliveryUpload.Status -eq 201) "status=$($deliveryUpload.Status)"

    $inboxB = Get-Json (Invoke-Api -Method 'GET' -Path ('api/inbox?clientId=' + $clientB))
    Check '接收方收件箱出现投递' (@($inboxB.deliveries).Count -ge 1) "count=$(@($inboxB.deliveries).Count)"
    $firstDelivery = @($inboxB.deliveries)[0]
    Check '收件箱显示发送人' ($firstDelivery.sender -eq 'Smoke host') "sender=$($firstDelivery.sender)"
    Check '收件箱显示投递文件' (@($firstDelivery.files | Where-Object { $_.name -eq $deliveredName }).Count -eq 1)

    $inboxA = Get-Json (Invoke-Api -Method 'GET' -Path ('api/inbox?clientId=' + $clientA))
    Check '发送方收件箱为空' (@($inboxA.deliveries).Count -eq 0) "count=$(@($inboxA.deliveries).Count)"

    $rootAfterDelivery = Get-Json (Invoke-Api -Method 'GET' -Path 'api/files')
    $rootNamesAfterDelivery = @($rootAfterDelivery.entries | ForEach-Object { $_.name })
    Check '普通列表隐藏投递目录' (-not ($rootNamesAfterDelivery -contains '用户投递'))

    $rootArchive = Invoke-Api -Method 'GET' -Path 'api/archive?path='
    $rootZipNames = @()
    if ($rootArchive.Bytes.Length -gt 0) {
        $memory = New-Object System.IO.MemoryStream (, $rootArchive.Bytes)
        $zip = New-Object System.IO.Compression.ZipArchive ($memory, [System.IO.Compression.ZipArchiveMode]::Read)
        $rootZipNames = @($zip.Entries | ForEach-Object { $_.FullName })
        $zip.Dispose()
        $memory.Dispose()
    }
    Check '打包下载不包含投递目录' (-not ($rootZipNames | Where-Object { $_ -like '用户投递/*' })) ($rootZipNames -join ', ')

    Write-Host ''
    Write-Host '==> 安全防护' -ForegroundColor Cyan
    $traversal = Invoke-Api -Method 'GET' -Path 'api/files?path=..%2F..%2Fsecret'
    Check '拒绝目录穿越' ($traversal.Status -eq 400) "status=$($traversal.Status)"
    $traversalUpload = Upload-Bytes -Path '../evil.txt' -Bytes ([byte[]](1, 2, 3))
    Check '拒绝穿越路径上传' ($traversalUpload.Status -eq 400) "status=$($traversalUpload.Status)"
    $rootDelete = Invoke-Api -Method 'DELETE' -Path 'api/files/content?path='
    Check '拒绝删除根目录' ($rootDelete.Status -eq 400) "status=$($rootDelete.Status)"
    $reservedUpload = Upload-Bytes -Path '.filetrans-tmp/evil.txt' -Bytes ([byte[]](1, 2, 3))
    Check '拒绝写入系统保留目录' ($reservedUpload.Status -eq 400) "status=$($reservedUpload.Status)"
    $unknown = Invoke-Api -Method 'GET' -Path 'api/not-a-real-endpoint'
    Check '未知接口返回 404 JSON' ($unknown.Status -eq 404 -and $unknown.Text.Contains('接口不存在')) "status=$($unknown.Status)"

    Write-Host ''
    Write-Host '==> 统计与删除' -ForegroundColor Cyan
    $infoAfter = Get-Json (Invoke-Api -Method 'GET' -Path 'api/info')
    Check '统计文件数量大于 0' ([int64]$infoAfter.storage.fileCount -gt 0) "count=$($infoAfter.storage.fileCount)"

    $delete = Invoke-Api -Method 'DELETE' -Path ('api/files/content?path=' + [Uri]::EscapeDataString('资料 目录'))
    Check '删除文件夹返回 200' ($delete.Status -eq 200) "status=$($delete.Status)"
    $afterDelete = Get-Json (Invoke-Api -Method 'GET' -Path 'api/files')
    $afterNames = @($afterDelete.entries | ForEach-Object { $_.name })
    Check '删除后列表不再包含文件夹' (-not ($afterNames -contains $folderName))

    $deleteLarge = Invoke-Api -Method 'DELETE' -Path ('api/files/content?path=' + [Uri]::EscapeDataString($largeRelative))
    Check '删除大文件返回 200' ($deleteLarge.Status -eq 200) "status=$($deleteLarge.Status)"
}
catch {
    Write-Host ''
    Write-Host "测试执行出错：$($_.Exception.Message)" -ForegroundColor Red
    Write-Host $_.ScriptStackTrace -ForegroundColor DarkGray
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
