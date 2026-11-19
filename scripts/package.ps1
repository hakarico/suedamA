$ErrorActionPreference = 'Stop'
$project = Split-Path -Parent $PSScriptRoot
$dist = Join-Path $project 'dist'
$package = Get-Content -LiteralPath (Join-Path $project 'package.json') -Raw | ConvertFrom-Json
$manifest = Get-Content -LiteralPath (Join-Path $dist 'manifest.json') -Raw | ConvertFrom-Json
if ($package.version -ne $manifest.version) { throw 'Build version differs from package.json. Run pnpm run build first.' }
foreach ($name in @('content.js', 'background.js', 'history.js', 'manifest.json', 'README.md', 'LICENSE', 'THIRD_PARTY_NOTICES.md', 'INSTALL.txt', 'licenses')) {
  if (-not (Test-Path -LiteralPath (Join-Path $dist $name))) { throw "Missing release file: $name" }
}
& node (Join-Path $PSScriptRoot 'audit-release.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Release audit failed. No package created.' }
$release = Join-Path $project '.scratch/release'
New-Item -ItemType Directory -Path $release -Force | Out-Null
$archive = Join-Path $release "suedama-deepseek-$($manifest.version).zip"
Compress-Archive -LiteralPath (Get-ChildItem -LiteralPath $dist).FullName -DestinationPath $archive -Force
$checksum = Get-FileHash -LiteralPath $archive -Algorithm SHA256
"$($checksum.Hash.ToLowerInvariant())  $([IO.Path]::GetFileName($archive))" | Set-Content -LiteralPath "$archive.sha256" -Encoding utf8
Write-Output $archive
Write-Output "SHA256: $($checksum.Hash)"
