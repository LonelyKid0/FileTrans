@echo off
setlocal EnableExtensions
cd /d "%~dp0"
chcp 65001 >nul
title FileTrans Firewall

net session >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Administrator privileges are required.
    echo Right-click this file and choose "Run as administrator".
    echo.
    pause
    exit /b 1
)

echo Adding Windows Firewall inbound rules for FileTrans...
netsh advfirewall firewall delete rule name="FileTrans (dotnet host)" >nul 2>&1
netsh advfirewall firewall delete rule name="FileTrans (published exe)" >nul 2>&1
netsh advfirewall firewall delete rule name="FileTrans (debug exe)" >nul 2>&1

set "DOTNET=%ProgramFiles%\dotnet\dotnet.exe"
if exist "%DOTNET%" (
    netsh advfirewall firewall add rule name="FileTrans (dotnet host)" dir=in action=allow program="%DOTNET%" enable=yes profile=private,public
) else (
    echo [WARN] dotnet.exe not found, skipped source-run rule.
)

if exist "%~dp0dist\FileTrans\FileTrans.exe" (
    netsh advfirewall firewall add rule name="FileTrans (published exe)" dir=in action=allow program="%~dp0dist\FileTrans\FileTrans.exe" enable=yes profile=private,public
)

if exist "%~dp0src\FileTrans\bin\Release\net8.0\FileTrans.exe" (
    netsh advfirewall firewall add rule name="FileTrans (debug exe)" dir=in action=allow program="%~dp0src\FileTrans\bin\Release\net8.0\FileTrans.exe" enable=yes profile=private,public
)

echo.
echo Done. Inbound rules are enabled for the Private and Public profiles.
echo To remove them later, run as administrator:
echo   netsh advfirewall firewall delete rule name="FileTrans (dotnet host)"
echo   netsh advfirewall firewall delete rule name="FileTrans (published exe)"
echo.
pause
