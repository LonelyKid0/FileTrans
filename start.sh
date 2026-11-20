#!/usr/bin/env bash
# 启动局域网文件快传（Linux / macOS）。
# 用法：./start.sh [--port 9000] [--data /path/to/share] [--no-browser]
set -euo pipefail
cd "$(dirname "$0")"

if ! command -v dotnet >/dev/null 2>&1; then
  echo "未找到 dotnet，请先安装 .NET 8 SDK：https://dotnet.microsoft.com/download/dotnet/8.0" >&2
  exit 1
fi

echo "正在准备程序（首次运行需要编译，请稍候）..."
dotnet build src/FileTrans/FileTrans.csproj -c Release --nologo -v quiet

exec dotnet src/FileTrans/bin/Release/net8.0/FileTrans.dll "$@"
