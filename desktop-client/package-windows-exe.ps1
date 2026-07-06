param(
  [string]$OutputPath = "$PSScriptRoot\dist\FileInNOutDesktopSetup.exe",
  [string]$PublicOutputPath = "",
  [string]$ZipOutputPath = "$PSScriptRoot\dist\FileInNOutDesktop.zip",
  [string]$PublicZipOutputPath = "$PSScriptRoot\..\frontend\public\downloads\FileInNOutDesktop.zip",
  [string]$Version = "",
  [string]$PythonRuntimePath = "",
  [switch]$NoBundlePythonRuntime,
  [string]$CscPath = "",
  [int]$PublicZipVersionsToKeep = 4
)

$ErrorActionPreference = "Stop"

$sourceDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$packageScript = Join-Path $sourceDir "package-windows.ps1"
$setupTemplateSource = Join-Path $sourceDir "FileInNOutDesktopSetup.cs"
$setupFormTemplateSource = Join-Path $sourceDir "FileInNOutDesktopSetupForm.cs"
if (-not (Test-Path -LiteralPath $packageScript)) {
  throw "package-windows.ps1 was not found: $packageScript"
}
if (-not (Test-Path -LiteralPath $setupTemplateSource)) {
  throw "FileInNOutDesktopSetup.cs was not found: $setupTemplateSource"
}
if (-not (Test-Path -LiteralPath $setupFormTemplateSource)) {
  throw "FileInNOutDesktopSetupForm.cs was not found: $setupFormTemplateSource"
}

if (-not $Version) {
  $Version = Get-Date -Format "yyyyMMdd-HHmmss"
}

function Resolve-CSharpCompiler {
  param([string]$RequestedPath)

  if ($RequestedPath) {
    if (-not (Test-Path -LiteralPath $RequestedPath)) {
      throw "CscPath does not exist: $RequestedPath"
    }
    return (Resolve-Path -LiteralPath $RequestedPath).Path
  }

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

  throw "C# compiler was not found. Install .NET Framework build tools or pass -CscPath."
}

function Convert-ToCSharpStringLiteral {
  param([string]$Value)
  return '"' + $Value.Replace('\', '\\').Replace('"', '\"') + '"'
}

function Resolve-PythonRuntimePath {
  param([string]$RequestedPath)

  if ($NoBundlePythonRuntime) {
    return ""
  }
  if (-not $RequestedPath) {
    $RequestedPath = $env:FILEINNOUT_PYTHON_RUNTIME
  }
  if (-not $RequestedPath) {
    return ""
  }
  if (-not (Test-Path -LiteralPath $RequestedPath)) {
    throw "PythonRuntimePath does not exist: $RequestedPath"
  }

  $resolved = (Resolve-Path -LiteralPath $RequestedPath).Path
  if ((Get-Item -LiteralPath $resolved).PSIsContainer) {
    $pythonExe = Join-Path $resolved "python.exe"
    if (-not (Test-Path -LiteralPath $pythonExe)) {
      throw "PythonRuntimePath directory is missing python.exe: $resolved"
    }
    return $resolved
  }

  if ([System.IO.Path]::GetFileName($resolved).Equals("python.exe", [System.StringComparison]::OrdinalIgnoreCase)) {
    return Split-Path -Parent $resolved
  }

  throw "PythonRuntimePath must point to python.exe or a directory containing python.exe."
}

function New-PortablePythonRuntime {
  param(
    [string]$SourceDir,
    [string]$TargetDir
  )

  New-Item -ItemType Directory -Force -Path $TargetDir | Out-Null

  $rootFiles = @(
    "python.exe",
    "pythonw.exe",
    "python3.dll",
    "python312.dll",
    "vcruntime140.dll",
    "vcruntime140_1.dll",
    "LICENSE.txt"
  )
  foreach ($name in $rootFiles) {
    $path = Join-Path $SourceDir $name
    if (Test-Path -LiteralPath $path) {
      Copy-Item -Force -LiteralPath $path -Destination (Join-Path $TargetDir $name)
    }
  }

  foreach ($name in @("DLLs", "libs")) {
    $path = Join-Path $SourceDir $name
    if (Test-Path -LiteralPath $path) {
      Copy-Item -Recurse -Force -LiteralPath $path -Destination (Join-Path $TargetDir $name)
    }
  }

  $sourceLib = Join-Path $SourceDir "Lib"
  if (-not (Test-Path -LiteralPath $sourceLib)) {
    throw "Python runtime is missing Lib directory: $SourceDir"
  }
  $targetLib = Join-Path $TargetDir "Lib"
  Copy-Item -Recurse -Force -LiteralPath $sourceLib -Destination $targetLib

  foreach ($name in @("site-packages", "test", "tkinter", "idlelib", "ensurepip", "venv", "turtledemo", "pydoc_data", "__pycache__")) {
    Get-ChildItem -Path $targetLib -Recurse -Force -Directory -Filter $name -ErrorAction SilentlyContinue |
      ForEach-Object { Remove-Item -LiteralPath $_.FullName -Recurse -Force }
  }
  Get-ChildItem -Path $targetLib -Recurse -Force -Directory -Filter "__pycache__" -ErrorAction SilentlyContinue |
    ForEach-Object { Remove-Item -LiteralPath $_.FullName -Recurse -Force }
  Get-ChildItem -Path $targetLib -Recurse -Force -File -Filter "*.pyc" -ErrorAction SilentlyContinue |
    ForEach-Object { Remove-Item -LiteralPath $_.FullName -Force }

  $targetPython = Join-Path $TargetDir "python.exe"
  if (-not (Test-Path -LiteralPath $targetPython)) {
    throw "Portable Python runtime was not created correctly: $targetPython"
  }
}

$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("FileInNOutDesktopExe-" + [System.Guid]::NewGuid().ToString("N"))
$zipOutputDir = Join-Path $tempRoot "zip"
$runtimeDir = Join-Path $tempRoot "python-runtime"
New-Item -ItemType Directory -Force -Path $zipOutputDir | Out-Null

try {
  $runtimeSource = Resolve-PythonRuntimePath $PythonRuntimePath
  $packageArgs = @(
    "-ExecutionPolicy", "Bypass",
    "-File", $packageScript,
    "-OutputDir", $zipOutputDir,
    "-Version", $Version
  )
  if ($runtimeSource) {
    New-PortablePythonRuntime -SourceDir $runtimeSource -TargetDir $runtimeDir
    $packageArgs += @("-PythonRuntimeDir", $runtimeDir)
  }

  & powershell @packageArgs
  if ($LASTEXITCODE -ne 0) {
    throw "package-windows.ps1 failed with exit code $LASTEXITCODE"
  }

  $zipPath = Join-Path $zipOutputDir "FileInNOutDesktop-$Version.zip"
  if (-not (Test-Path -LiteralPath $zipPath)) {
    throw "Package zip was not created: $zipPath"
  }

  if ($ZipOutputPath) {
    $targetZipDir = Split-Path -Parent $ZipOutputPath
    if ($targetZipDir) {
      New-Item -ItemType Directory -Force -Path $targetZipDir | Out-Null
    }
    Copy-Item -Force -LiteralPath $zipPath -Destination $ZipOutputPath
    Write-Host "Copied zip package: $ZipOutputPath"
  }

  $versionLiteral = Convert-ToCSharpStringLiteral $Version

  $sourcePath = Join-Path $tempRoot "FileInNOutDesktopSetup.cs"
  $formSourcePath = Join-Path $tempRoot "FileInNOutDesktopSetupForm.cs"
  $source = [System.IO.File]::ReadAllText($setupTemplateSource, [System.Text.Encoding]::UTF8)
  $source = $source.Replace('"__FILEINNOUT_SETUP_VERSION__"', $versionLiteral)

  [System.IO.File]::WriteAllText($sourcePath, $source, [System.Text.UTF8Encoding]::new($false))
  $formSource = [System.IO.File]::ReadAllText($setupFormTemplateSource, [System.Text.Encoding]::UTF8)
  [System.IO.File]::WriteAllText($formSourcePath, $formSource, [System.Text.UTF8Encoding]::new($false))

  $resolvedOutputPath = [System.IO.Path]::GetFullPath($OutputPath)
  $outputDir = Split-Path -Parent $resolvedOutputPath
  New-Item -ItemType Directory -Force -Path $outputDir | Out-Null
  if (Test-Path -LiteralPath $resolvedOutputPath) {
    Remove-Item -LiteralPath $resolvedOutputPath -Force
  }

  $csc = Resolve-CSharpCompiler $CscPath
  $frameworkDir = Split-Path -Parent $csc
  $compression = Join-Path $frameworkDir "System.IO.Compression.dll"
  $compressionFs = Join-Path $frameworkDir "System.IO.Compression.FileSystem.dll"
  $references = @()
  if (Test-Path -LiteralPath $compression) {
    $references += "/reference:$compression"
  }
  if (Test-Path -LiteralPath $compressionFs) {
    $references += "/reference:$compressionFs"
  }
  $references += "/reference:System.Windows.Forms.dll"
  $references += "/reference:System.Drawing.dll"
  $references += "/reference:System.Security.dll"

  & $csc /nologo /target:exe /out:$resolvedOutputPath $references "/resource:$zipPath,FileInNOutDesktopPayload" $sourcePath $formSourcePath
  if ($LASTEXITCODE -ne 0) {
    throw "csc.exe failed with exit code $LASTEXITCODE"
  }

  if ($PublicOutputPath) {
    $resolvedPublicPath = [System.IO.Path]::GetFullPath($PublicOutputPath)
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $resolvedPublicPath) | Out-Null
    Copy-Item -Force -LiteralPath $resolvedOutputPath -Destination $resolvedPublicPath
    Write-Host "Copied public installer: $resolvedPublicPath"
  } elseif ($PublicZipOutputPath) {
    $resolvedPublicZipPath = [System.IO.Path]::GetFullPath($PublicZipOutputPath)
    $publicZipDir = Split-Path -Parent $resolvedPublicZipPath
    New-Item -ItemType Directory -Force -Path $publicZipDir | Out-Null

    $legacyPublicExe = Join-Path $publicZipDir "FileInNOutDesktopSetup.exe"
    if (Test-Path -LiteralPath $legacyPublicExe) {
      Remove-Item -LiteralPath $legacyPublicExe -Force
      Write-Host "Removed legacy public installer: $legacyPublicExe"
    }

    $publicZipStage = Join-Path $tempRoot "public-zip"
    New-Item -ItemType Directory -Force -Path $publicZipStage | Out-Null
    Copy-Item -Force -LiteralPath $resolvedOutputPath -Destination (Join-Path $publicZipStage "FileInNOutDesktopSetup.exe")
    @(
      "FileInNOut Desktop",
      "",
      "1. Extract this ZIP file.",
      "2. Run FileInNOutDesktopSetup.exe.",
      "3. After installation, open FileInNOut Desktop from the tray or Start Menu."
    ) | Set-Content -Encoding ASCII -Path (Join-Path $publicZipStage "README.txt")

    if (Test-Path -LiteralPath $resolvedPublicZipPath) {
      Remove-Item -LiteralPath $resolvedPublicZipPath -Force
    }
    Compress-Archive -Path (Join-Path $publicZipStage "*") -DestinationPath $resolvedPublicZipPath -Force
    Write-Host "Created public installer zip: $resolvedPublicZipPath"

    $safeVersion = $Version -replace '[^A-Za-z0-9._-]', '-'
    $latestDownloadName = [System.IO.Path]::GetFileName($resolvedPublicZipPath)
    if ($safeVersion) {
      $versionedPublicZipPath = Join-Path $publicZipDir ("FileInNOutDesktop-{0}.zip" -f $safeVersion)
      if (-not $versionedPublicZipPath.Equals($resolvedPublicZipPath, [System.StringComparison]::OrdinalIgnoreCase)) {
        if (Test-Path -LiteralPath $versionedPublicZipPath) {
          Remove-Item -LiteralPath $versionedPublicZipPath -Force
        }
        Copy-Item -Force -LiteralPath $resolvedPublicZipPath -Destination $versionedPublicZipPath
        Write-Host "Created versioned public installer zip: $versionedPublicZipPath"
      }
      $latestDownloadName = [System.IO.Path]::GetFileName($versionedPublicZipPath)
    }

    $latestManifest = [ordered]@{
      name = "FileInNOut Desktop"
      version = $Version
      createdAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
      downloadUrl = "/downloads/$latestDownloadName"
      sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $resolvedPublicZipPath).Hash.ToLowerInvariant()
      mandatory = $false
      releaseNotes = "FileInNOut Desktop $Version"
    }
    $latestManifestPath = Join-Path $publicZipDir "FileInNOutDesktop.latest.json"
    $latestManifest | ConvertTo-Json -Depth 4 | Set-Content -Encoding UTF8 -Path $latestManifestPath
    Write-Host "Created desktop update manifest: $latestManifestPath"

    if ($PublicZipVersionsToKeep -gt 0) {
      $versionedPackages = Get-ChildItem -Path $publicZipDir -Filter "FileInNOutDesktop-*.zip" -File -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending
      $currentVersionedPath = if ($safeVersion) { [System.IO.Path]::GetFullPath((Join-Path $publicZipDir ("FileInNOutDesktop-{0}.zip" -f $safeVersion))) } else { "" }
      $kept = 0
      foreach ($package in $versionedPackages) {
        $packagePath = [System.IO.Path]::GetFullPath($package.FullName)
        if ($currentVersionedPath -and $packagePath.Equals($currentVersionedPath, [System.StringComparison]::OrdinalIgnoreCase)) {
          $kept++
          continue
        }
        if ($kept -lt $PublicZipVersionsToKeep) {
          $kept++
          continue
        }
        Remove-Item -LiteralPath $package.FullName -Force
        Write-Host "Removed old public installer zip: $($package.FullName)"
      }
    }
  }

  Write-Host "Created setup exe: $resolvedOutputPath"
} finally {
  if (Test-Path -LiteralPath $tempRoot) {
    Remove-Item -LiteralPath $tempRoot -Recurse -Force
  }
}
