param(
  [Parameter(Mandatory = $false)]
  [string]$TagName = $env:GITHUB_REF_NAME
)

$ErrorActionPreference = 'Stop'

$workspace = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$packagePath = Join-Path $workspace 'package.json'
$package = Get-Content -LiteralPath $packagePath -Raw | ConvertFrom-Json
$version = [string]$package.version
$expectedTag = "v$version"

if ([string]::IsNullOrWhiteSpace($TagName)) {
  throw 'A release tag is required. Pass -TagName vX.Y.Z or set GITHUB_REF_NAME.'
}
if ($TagName -ne $expectedTag) {
  throw "Release tag $TagName does not match package.json version $version (expected $expectedTag)."
}

function Invoke-Checked([string]$Command, [string[]]$Arguments) {
  & $Command @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "$Command failed with exit code $LASTEXITCODE."
  }
}

function Get-FileSha256([string]$Path) {
  $stream = [System.IO.File]::OpenRead($Path)
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try {
    return [BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-', '')
  } finally {
    $sha.Dispose()
    $stream.Dispose()
  }
}

Push-Location $workspace
try {
  Invoke-Checked 'npm.cmd' @('run', 'typecheck')
  Invoke-Checked 'npm.cmd' @('run', 'release:win')

  $artifactDir = Join-Path $workspace 'artifacts'
  # 必须与 release-win.ps1 的 $installerName 以及 package.json 的
  # build.artifactName（AgentSessionCenter-Setup-${version}.${ext}）保持一致。
  $installerName = "AgentSessionCenter-Setup-$version.exe"
  $installerPath = Join-Path $artifactDir $installerName
  $blockmapPath = "$installerPath.blockmap"
  $metadataPath = Join-Path $artifactDir 'latest.yml'
  foreach ($required in @($installerPath, $blockmapPath, $metadataPath)) {
    if (-not (Test-Path -LiteralPath $required -PathType Leaf)) {
      throw "Release output is missing: $required"
    }
  }

  $digest = (Get-FileSha256 $installerPath).ToLowerInvariant()
  $checksumPath = "$installerPath.sha256"
  # Windows PowerShell 5.1's default Set-Content appends CRLF, which makes
  # `sha256sum -c` fail on Linux/macOS/WSL with a misleading
  # "'<installer>'$'\r': No such file or directory" error even though the digest
  # itself is correct. Write the sidecar verbatim with a single LF terminator:
  # `-NoNewline` stops the implicit CRLF, the backtick-n is a bare LF, and
  # `-Encoding ascii` keeps the file BOM-free.
  Set-Content -LiteralPath $checksumPath -Value "$digest  $installerName`n" -Encoding ascii -NoNewline

  # Regression guard: read the raw bytes back and reject any CR. Get-Content would
  # normalize line endings and always pass, so it must not be used here.
  $checksumBytes = [System.IO.File]::ReadAllBytes($checksumPath)
  if ($checksumBytes -contains 0x0D) {
    throw "Checksum sidecar $checksumPath contains a carriage return (0x0D); it must use LF endings only. A CR breaks 'sha256sum -c' on Linux/macOS/WSL, where the CR is parsed as part of the file name."
  }

  [pscustomobject]@{
    Tag = $TagName
    Installer = $installerPath
    Blockmap = $blockmapPath
    UpdateMetadata = $metadataPath
    Checksum = $checksumPath
    SHA256 = $digest
  } | Format-List
} finally {
  Pop-Location
}
