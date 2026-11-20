<#
.SYNOPSIS
    启动局域网文件快传（Windows PowerShell 版本）。

.EXAMPLE
    .\start.ps1
    .\start.ps1 -Port 9000
    .\start.ps1 -Data D:\Share -NoBrowser

.NOTES
    如果 PowerShell 阻止运行脚本，可先执行：
    Set-ExecutionPolicy -Scope Process Bypass
#>
[CmdletBinding()]
param(
    [int]$Port = 0,
    [string]$Data = '',
    [switch]$NoBrowser
)

$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

if (-not (Get-Command dotnet -ErrorAction SilentlyContinue)) {
    Write-Host '[错误] 没有找到 .NET 运行时，请先安装 .NET 8 SDK。' -ForegroundColor Red
    Write-Host '下载地址：https://dotnet.microsoft.com/download/dotnet/8.0'
    exit 1
}

Write-Host '正在准备程序（首次运行需要编译，请稍候）...' -ForegroundColor Cyan
& dotnet build 'src\FileTrans\FileTrans.csproj' -c Release --nologo -v quiet | Out-Host
if ($LASTEXITCODE -ne 0) {
    Write-Host '[错误] 编译失败。' -ForegroundColor Red
    exit 1
}

$arguments = @('src\FileTrans\bin\Release\net8.0\FileTrans.dll')
if ($Port -gt 0) { $arguments += @('--port', $Port) }
if ($Data) { $arguments += @('--data', $Data) }
if ($NoBrowser) { $arguments += '--no-browser' }

& dotnet @arguments
exit $LASTEXITCODE
