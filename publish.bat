@echo off
setlocal EnableExtensions
cd /d "%~dp0"
chcp 65001 >nul
title FileTrans Publish

where dotnet >nul 2>nul
if errorlevel 1 (
    echo [ERROR] .NET SDK was not found.
    pause
    exit /b 1
)

echo Publishing to dist\FileTrans ...
dotnet publish "src\FileTrans\FileTrans.csproj" -c Release -r win-x64 --self-contained false --nologo -o "dist\FileTrans"
if errorlevel 1 (
    echo.
    echo [ERROR] Publish failed.
    pause
    exit /b 1
)

echo.
echo Done: dist\FileTrans
echo Double-click dist\FileTrans\FileTrans.exe to start (the browser opens automatically).
echo The target machine needs the .NET 8 runtime. For a runtime-free build, change
echo   --self-contained false
echo to
echo   --self-contained true
echo.
pause
