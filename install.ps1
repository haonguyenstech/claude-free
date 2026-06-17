# claude-free Windows installer (PowerShell).
# Run from cmd:  powershell -ExecutionPolicy Bypass -Command "irm https://raw.githubusercontent.com/haonguyenstech/claude-free/main/install.ps1 | iex"
$ErrorActionPreference = "Stop"

# Where the raw claude-proxy.js / claude-free.js live. Replace with your host (GitHub raw, domain, etc.).
$Base = $env:CLAUDE_FREE_BASE; if (-not $Base) { $Base = "https://raw.githubusercontent.com/haonguyenstech/claude-free/main" }

$Dir = Join-Path $env:USERPROFILE ".claude-free"
$Bin = Join-Path $Dir "bin"
New-Item -ItemType Directory -Force -Path $Dir, $Bin | Out-Null
Write-Host "Installing claude-free to $Dir" -ForegroundColor Cyan

# 1) Node.js
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "Node.js not found - installing via winget..." -ForegroundColor Yellow
  winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
  Write-Host "Node installed. You may need to open a new terminal for it to be on PATH." -ForegroundColor Yellow
}

# 2) program files
foreach ($f in @("claude-proxy.js", "claude-free.js")) {
  Write-Host "  downloading $f"
  Invoke-WebRequest -UseBasicParsing "$Base/$f" -OutFile (Join-Path $Dir $f)
}

# 3) launcher shim on PATH:  claude-free
$shim = "@echo off`r`nnode `"$Dir\claude-free.js`" %*"
Set-Content -Path (Join-Path $Bin "claude-free.cmd") -Value $shim -Encoding ascii

# 4) add bin dir to the user's PATH (persists across sessions)
$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
if (($userPath -split ';') -notcontains $Bin) {
  [Environment]::SetEnvironmentVariable("Path", ($userPath.TrimEnd(';') + ";" + $Bin), "User")
  Write-Host "Added $Bin to your PATH." -ForegroundColor Green
}

# 5) Claude Code CLI
if (-not (Get-Command claude -ErrorAction SilentlyContinue)) {
  Write-Host "Claude Code CLI not found - installing globally via npm..." -ForegroundColor Yellow
  npm install -g @anthropic-ai/claude-code
}

Write-Host ""
Write-Host "Done. Open a NEW terminal and run:  claude-free" -ForegroundColor Green
