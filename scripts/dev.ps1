param([ValidateSet('backend','frontend')][string]$Service = 'frontend')
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot
if ($Service -eq 'backend') {
    if (-not (Test-Path '.venv/Scripts/python.exe')) { throw 'Create .venv and install backend/requirements-lock.txt first; see README.md.' }
    & '.\.venv\Scripts\python.exe' -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000
} else {
    $portableNode = Join-Path $repoRoot 'tmp/node-v22.23.3-win-x64'
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
        if (-not (Test-Path "$portableNode/node.exe")) { throw 'Install Node.js 22+, or follow the portable Node instructions in README.md.' }
        $env:PATH = "$portableNode;$env:PATH"
    }
    Set-Location (Join-Path $repoRoot 'frontend')
    & npm.cmd run dev
}
