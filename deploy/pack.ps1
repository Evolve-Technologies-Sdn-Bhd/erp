# Builds the ERP on this computer and packs what a server needs into one file, deploy\out\zora-erp-<commit>.tar.gz.
# The server only unpacks it and runs update.sh: no build there. Run from anywhere:
#   powershell -ExecutionPolicy Bypass -File deploy\pack.ps1
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$commit = (git rev-parse --short HEAD).Trim()
$branch = (git rev-parse --abbrev-ref HEAD).Trim()
if (git status --porcelain --untracked-files=no) { Write-Host "Note: there are changes not committed yet; they are packed too." -ForegroundColor Yellow }
Write-Host "Packing $branch at $commit"

Write-Host "`n== Backend: build" -ForegroundColor Green
Set-Location "$root\backend"
if (Test-Path dist) { Remove-Item -Recurse -Force dist }
npm run build
if ($LASTEXITCODE) { throw 'The backend build failed.' }

Write-Host "`n== Screens: build (the API is on the same address, under /api/v1)" -ForegroundColor Green
Set-Location "$root\frontend"
$env:VITE_API_URL = '/api/v1'
npm run build-only
if ($LASTEXITCODE) { throw 'The screens build failed.' }
Remove-Item Env:VITE_API_URL

Write-Host "`n== Packing" -ForegroundColor Green
$stage = Join-Path $env:TEMP "zora-erp-pack"
if (Test-Path $stage) { Remove-Item -Recurse -Force $stage }
New-Item -ItemType Directory -Force "$stage\backend", "$stage\frontend" | Out-Null
Copy-Item -Recurse "$root\backend\dist", "$root\backend\prisma" "$stage\backend\"
Copy-Item "$root\backend\package.json", "$root\backend\package-lock.json" "$stage\backend\"
Copy-Item -Recurse "$root\frontend\dist" "$stage\frontend\"
# The server script, with Linux line endings whatever git did to it here
$sh = [IO.File]::ReadAllText("$root\deploy\update.sh") -replace "`r`n", "`n"
[IO.File]::WriteAllText("$stage\update.sh", $sh)
Set-Content -Encoding ascii "$stage\VERSION" "$branch $commit $(Get-Date -Format 'yyyy-MM-dd HH:mm')"

$out = "$root\deploy\out"
New-Item -ItemType Directory -Force $out | Out-Null
$file = "$out\zora-erp-$commit.tar.gz"
& "$env:SystemRoot\System32\tar.exe" -czf $file -C $stage .
if ($LASTEXITCODE) { throw 'Packing failed.' }
Remove-Item -Recurse -Force $stage
$size = [math]::Round((Get-Item $file).Length / 1MB, 1)
Write-Host "`nReady: $file ($size MB)" -ForegroundColor Green
Write-Host "Upload it to the server and run update.sh (deploy\README.md)."
