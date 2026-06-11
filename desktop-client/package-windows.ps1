param(
  [string]$OutputDir = "$PSScriptRoot\dist",
  [string]$Version = "",
  [string]$PythonRuntimeDir = ""
)

$ErrorActionPreference = "Stop"

$sourceDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$client = Join-Path $sourceDir "fileinnout_desktop.py"
$traySource = Join-Path $sourceDir "FileInNOutDesktopTray.cs"
$installer = Join-Path $sourceDir "install-windows.ps1"
$uninstaller = Join-Path $sourceDir "uninstall-windows.ps1"
$installVerifier = Join-Path $sourceDir "verify_windows_install.ps1"
$readme = Join-Path $sourceDir "README.md"

foreach ($path in @($client, $traySource, $installer, $uninstaller, $installVerifier, $readme)) {
  if (-not (Test-Path $path)) {
    throw "Required package file is missing: $path"
  }
}

if (-not $Version) {
  $Version = Get-Date -Format "yyyyMMdd-HHmmss"
}

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

function Resolve-CSharpCompiler {
  $command = Get-Command csc.exe -ErrorAction SilentlyContinue
  if ($command) {
    return $command.Source
  }

  $candidates = @(
    "$env:WINDIR\Microsoft.NET\Framework64\v4.0.30319\csc.exe",
    "$env:WINDIR\Microsoft.NET\Framework\v4.0.30319\csc.exe"
  )
  foreach ($candidate in $candidates) {
    if (Test-Path -LiteralPath $candidate) {
      return $candidate
    }
  }

  throw "C# compiler was not found. Install .NET Framework build tools."
}

function New-FileInNOutIcon {
  param([string]$Path)

  Add-Type -AssemblyName System.Drawing
  $bitmap = New-Object System.Drawing.Bitmap 32, 32
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  try {
    $graphics.Clear([System.Drawing.Color]::Transparent)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $tab = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(29, 111, 219))
    $body = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(37, 132, 245))
    $shine = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(92, 174, 255))
    $border = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(18, 78, 166)), 1
    try {
      $graphics.FillRectangle($tab, 5, 7, 11, 6)
      $graphics.FillRectangle($body, 3, 11, 26, 17)
      $graphics.DrawRectangle($border, 3, 11, 26, 17)
      $graphics.FillRectangle($shine, 6, 14, 20, 3)
    } finally {
      $tab.Dispose()
      $body.Dispose()
      $shine.Dispose()
      $border.Dispose()
    }

    $pngStream = New-Object System.IO.MemoryStream
    try {
      $bitmap.Save($pngStream, [System.Drawing.Imaging.ImageFormat]::Png)
      $png = $pngStream.ToArray()
    } finally {
      $pngStream.Dispose()
    }
  } finally {
    $graphics.Dispose()
    $bitmap.Dispose()
  }

  $output = New-Object System.IO.FileStream $Path, ([System.IO.FileMode]::Create), ([System.IO.FileAccess]::Write)
  try {
    $writer = New-Object System.IO.BinaryWriter $output
    try {
      $writer.Write([UInt16]0)
      $writer.Write([UInt16]1)
      $writer.Write([UInt16]1)
      $writer.Write([byte]32)
      $writer.Write([byte]32)
      $writer.Write([byte]0)
      $writer.Write([byte]0)
      $writer.Write([UInt16]1)
      $writer.Write([UInt16]32)
      $writer.Write([UInt32]$png.Length)
      $writer.Write([UInt32]22)
      $writer.Write($png)
    } finally {
      $writer.Dispose()
    }
  } finally {
    $output.Dispose()
  }
}

function Build-TrayApplication {
  param(
    [string]$Source,
    [string]$Output,
    [string]$Icon
  )

  $csc = Resolve-CSharpCompiler
  & $csc `
    /nologo `
    /codepage:65001 `
    /target:winexe `
    "/out:$Output" `
    "/win32icon:$Icon" `
    /reference:System.Windows.Forms.dll `
    /reference:System.Drawing.dll `
    /reference:System.Web.Extensions.dll `
    $Source
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to build FileInNOutDesktop.exe"
  }
}

$packageName = "FileInNOutDesktop-$Version"
$stagingRoot = Join-Path ([System.IO.Path]::GetTempPath()) $packageName
if (Test-Path $stagingRoot) {
  Remove-Item -LiteralPath $stagingRoot -Recurse -Force
}

New-Item -ItemType Directory -Force -Path $stagingRoot | Out-Null
Copy-Item -Force -Path $client -Destination (Join-Path $stagingRoot "fileinnout_desktop.py")
Copy-Item -Force -Path $installer -Destination (Join-Path $stagingRoot "install-windows.ps1")
Copy-Item -Force -Path $uninstaller -Destination (Join-Path $stagingRoot "uninstall-windows.ps1")
Copy-Item -Force -Path $installVerifier -Destination (Join-Path $stagingRoot "verify_windows_install.ps1")
Copy-Item -Force -Path $readme -Destination (Join-Path $stagingRoot "README.md")
Copy-Item -Force -Path $traySource -Destination (Join-Path $stagingRoot "FileInNOutDesktopTray.cs")

$iconPath = Join-Path $stagingRoot "FileInNOutDesktop.ico"
$trayExePath = Join-Path $stagingRoot "FileInNOutDesktop.exe"
New-FileInNOutIcon -Path $iconPath
Build-TrayApplication -Source $traySource -Output $trayExePath -Icon $iconPath

if ($PythonRuntimeDir) {
  if (-not (Test-Path -LiteralPath $PythonRuntimeDir)) {
    throw "PythonRuntimeDir does not exist: $PythonRuntimeDir"
  }
  Copy-Item -Recurse -Force -Path (Resolve-Path -LiteralPath $PythonRuntimeDir).Path -Destination (Join-Path $stagingRoot "python-runtime")
}

$packageFiles = @(
  "fileinnout_desktop.py",
  "FileInNOutDesktop.exe",
  "FileInNOutDesktop.ico",
  "FileInNOutDesktopTray.cs",
  "install-windows.ps1",
  "uninstall-windows.ps1",
  "verify_windows_install.ps1",
  "README.md"
)

$manifestFiles = foreach ($item in Get-ChildItem -LiteralPath $stagingRoot -Recurse -File) {
  $relativePath = $item.FullName.Substring($stagingRoot.Length).TrimStart("\", "/")
  [ordered]@{
    path = $relativePath
    bytes = $item.Length
    sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $item.FullName).Hash.ToLowerInvariant()
  }
}

$manifest = [ordered]@{
  name = "FileInNOut Desktop"
  version = $Version
  createdAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
  installCommand = "powershell -ExecutionPolicy Bypass -File .\install-windows.ps1"
  files = @($manifestFiles)
}

$manifest | ConvertTo-Json -Depth 4 | Set-Content -Encoding ASCII -Path (Join-Path $stagingRoot "manifest.json")

$zipPath = Join-Path $OutputDir "$packageName.zip"
if (Test-Path $zipPath) {
  Remove-Item -LiteralPath $zipPath -Force
}

Compress-Archive -Path (Join-Path $stagingRoot "*") -DestinationPath $zipPath -Force
Remove-Item -LiteralPath $stagingRoot -Recurse -Force

Write-Host "Created package: $zipPath"
