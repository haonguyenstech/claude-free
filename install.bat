@echo off
setlocal enabledelayedexpansion
rem claude-free installer for Windows Command Prompt (cmd.exe) - no PowerShell required.
rem One-liner (paste into cmd):
rem   curl -fsSLo "%TEMP%\cf-install.bat" https://raw.githubusercontent.com/haonguyenstech/claude-free/main/install.bat && "%TEMP%\cf-install.bat"

if "%CLAUDE_FREE_BASE%"=="" (set "BASE=https://raw.githubusercontent.com/haonguyenstech/claude-free/main") else (set "BASE=%CLAUDE_FREE_BASE%")
set "DIR=%USERPROFILE%\.claude-free"
set "BIN=%DIR%\bin"
echo Installing claude-free to %DIR%

rem 1) curl is required (ships with Windows 10 1803+ / Windows 11)
where curl >nul 2>nul || (echo ERROR: curl.exe not found. Needs Windows 10 1803+ or Windows 11. & exit /b 1)

rem 2) Node.js
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js not found - trying winget...
  winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
  echo If Node still isn't found, install it from https://nodejs.org and re-run this installer.
)

rem 3) folders
if not exist "%DIR%" mkdir "%DIR%"
if not exist "%BIN%" mkdir "%BIN%"

rem 4) client file (the proxy is hosted separately; the client only needs claude-free.js)
echo   downloading claude-free.js
curl -fsSL "%BASE%/claude-free.js" -o "%DIR%\claude-free.js" || (echo download failed & exit /b 1)

rem 5) launcher shim:  claude-free.cmd  (so `claude-free` works in cmd)
> "%BIN%\claude-free.cmd" echo @echo off
>> "%BIN%\claude-free.cmd" echo node "%DIR%\claude-free.js" %%*

rem 6) add BIN to the USER Path if it's not already there. Read the user-only Path from the
rem registry (not the merged %PATH%) so setx doesn't truncate the combined system+user value.
echo ;%PATH%; | find /I ";%BIN%;" >nul
if errorlevel 1 (
  set "OLDUSERPATH="
  for /f "skip=2 tokens=1,2*" %%A in ('reg query "HKCU\Environment" /v Path 2^>nul') do set "OLDUSERPATH=%%C"
  if defined OLDUSERPATH (
    setx Path "!OLDUSERPATH!;%BIN%" >nul
  ) else (
    setx Path "%BIN%" >nul
  )
  echo Added %BIN% to your PATH.
)

rem 7) Claude Code CLI
where claude >nul 2>nul
if errorlevel 1 (
  echo Claude Code CLI not found - installing globally via npm...
  call npm install -g @anthropic-ai/claude-code
)

echo.
echo Done. Open a NEW Command Prompt and run:  claude-free
endlocal
