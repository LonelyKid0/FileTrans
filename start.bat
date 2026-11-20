@echo off
setlocal EnableExtensions
cd /d "%~dp0"
chcp 65001 >nul
title FileTrans

where dotnet >nul 2>nul
if errorlevel 1 (
    echo.
    echo [ERROR] .NET runtime was not found.
    echo Please install .NET 8 SDK: https://dotnet.microsoft.com/download/dotnet/8.0
    echo.
    pause
    exit /b 1
)

echo Preparing FileTrans (first run may take a while)...
dotnet build "src\FileTrans\FileTrans.csproj" -c Release --nologo -v quiet
if errorlevel 1 (
    echo.
    echo [ERROR] Build failed. See the messages above.
    pause
    exit /b 1
)

echo.
dotnet "src\FileTrans\bin\Release\net8.0\FileTrans.dll" %*
set EXITCODE=%ERRORLEVEL%

if not "%EXITCODE%"=="0" (
    echo.
    echo FileTrans exited with code %EXITCODE%.
    pause
)
exit /b %EXITCODE%
