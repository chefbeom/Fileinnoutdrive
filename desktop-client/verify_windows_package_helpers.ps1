$ErrorActionPreference = "Stop"

function Resolve-FileInNOutDesktopPackagePath {
  param(
    [string]$PackagePath,
    [string]$ScriptDir
  )

  if ($PackagePath) {
    if (-not (Test-Path $PackagePath)) {
      throw "Package does not exist: $PackagePath"
    }
    return $PackagePath
  }

  $candidate = Get-ChildItem -Path (Join-Path $ScriptDir "dist") -Filter "FileInNOutDesktop-*.zip" -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1

  if (-not $candidate) {
    throw "No package zip found. Run package-windows.ps1 first or pass -PackagePath."
  }

  return $candidate.FullName
}

function Get-FileInNOutDesktopRequiredPackageFiles {
  @(
    "fileinnout_desktop.py",
    "fileinnout_desktop_constants.py",
    "fileinnout_desktop_models.py",
    "fileinnout_desktop_paths.py",
    "fileinnout_desktop_api.py",
    "fileinnout_desktop_security.py",
    "fileinnout_desktop_windows.py",
    "fileinnout_desktop_state.py",
    "fileinnout_desktop_config.py",
    "fileinnout_desktop_files.py",
    "fileinnout_desktop_remote.py",
    "fileinnout_desktop_web.py",
    "fileinnout_desktop_drive.py",
    "fileinnout_desktop_drive_hub.py",
    "fileinnout_desktop_profiles.py",
    "fileinnout_desktop_diagnostics.py",
    "fileinnout_desktop_sharing.py",
    "fileinnout_desktop_sync.py",
    "fileinnout_desktop_parser.py",
    "fileinnout_desktop_account_commands.py",
    "fileinnout_desktop_status_commands.py",
    "fileinnout_desktop_share_commands.py",
    "fileinnout_desktop_sync_local.py",
    "fileinnout_desktop_sync_shared.py",
    "fileinnout_desktop_sync_moves.py",
    "fileinnout_desktop_drive_adoption.py",
    "FileInNOutDesktop.exe",
    "FileInNOutDesktop.ico",
    "DesktopProgram.cs",
    "FileInNOutDesktopTray.cs",
    "DesktopTrayControllerActions.cs",
    "SettingsForm.cs",
    "SettingsFormActions.cs",
    "DesktopUiControls.cs",
    "DesktopTrayMenu.cs",
    "DesktopTrayVisuals.cs",
    "DesktopSettingsText.cs",
    "DesktopSettingsDialogText.cs",
    "DesktopModels.cs",
    "DesktopSyncText.cs",
    "DesktopUpdateService.cs",
    "DesktopExplorerText.cs",
    "DesktopExplorerBranding.cs",
    "DesktopExplorerNamespace.cs",
    "DesktopDriveHubLinks.cs",
    "DesktopDriveHubMaintenance.cs",
    "DesktopDriveMapping.cs",
    "DesktopProcessRunner.cs",
    "DesktopPathRules.cs",
    "DesktopDataReader.cs",
    "DesktopTrayConfigStore.cs",
    "DesktopTrayPreferences.cs",
    "DesktopFolderProfileRules.cs",
    "DesktopFileSearch.cs",
    "DesktopSearchService.cs",
    "DesktopSyncState.cs",
    "DesktopChangeTracker.cs",
    "DesktopSyncCommandRunner.cs",
    "ExplorerDriveLauncher.cs",
    "CloudFilesIntegration.cs",
    "install-windows.ps1",
    "install-windows-shell.ps1",
    "install-windows-drive-hub.ps1",
    "install-windows-payload.ps1",
    "uninstall-windows.ps1",
    "verify_windows_install.ps1",
    "README.md",
    "manifest.json"
  )
}

function Assert-FileInNOutDesktopRequiredPackageFiles {
  param(
    [string]$PackageRoot,
    [string[]]$RequiredFiles
  )

  foreach ($name in $RequiredFiles) {
    $path = Join-Path $PackageRoot $name
    if (-not (Test-Path $path)) {
      throw "Package is missing required file: $name"
    }
  }
}

function Assert-FileInNOutDesktopManifestChecksums {
  param(
    [string]$PackageRoot,
    [string[]]$RequiredFiles
  )

  $manifest = Get-Content -Raw -Path (Join-Path $PackageRoot "manifest.json") | ConvertFrom-Json
  if ($manifest.name -ne "FileInNOut Desktop") {
    throw "Unexpected manifest name: $($manifest.name)"
  }

  $manifestFiles = @($manifest.files)
  if (-not $manifestFiles.Count) {
    throw "Manifest does not contain file checksums."
  }

  $manifestPaths = @{}
  foreach ($entry in $manifestFiles) {
    $relativePath = [string]$entry.path
    if ([string]::IsNullOrWhiteSpace($relativePath)) {
      throw "Manifest contains an empty file path."
    }
    if ([System.IO.Path]::IsPathRooted($relativePath) -or $relativePath.Contains("..")) {
      throw "Manifest contains an unsafe file path: $relativePath"
    }

    $entryPath = Join-Path $PackageRoot $relativePath
    if (-not (Test-Path -LiteralPath $entryPath)) {
      throw "Manifest file is missing from package: $relativePath"
    }

    $expectedHash = ([string]$entry.sha256).ToLowerInvariant()
    if ([string]::IsNullOrWhiteSpace($expectedHash)) {
      throw "Manifest file has no sha256: $relativePath"
    }
    $actualHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $entryPath).Hash.ToLowerInvariant()
    if ($actualHash -ne $expectedHash) {
      throw "Manifest sha256 mismatch for ${relativePath}: expected $expectedHash, got $actualHash"
    }

    if ($entry.PSObject.Properties.Name -contains "bytes") {
      $expectedBytes = [int64]$entry.bytes
      $actualBytes = (Get-Item -LiteralPath $entryPath).Length
      if ($actualBytes -ne $expectedBytes) {
        throw "Manifest byte size mismatch for ${relativePath}: expected $expectedBytes, got $actualBytes"
      }
    }

    $manifestPaths[$relativePath] = $true
  }

  foreach ($name in $RequiredFiles | Where-Object { $_ -ne "manifest.json" }) {
    if (-not $manifestPaths.ContainsKey($name)) {
      throw "Required file is not listed in manifest checksums: $name"
    }
  }
}

function Read-FileInNOutDesktopUtf8Text {
  param(
    [string]$Path
  )

  [System.Text.Encoding]::UTF8.GetString([System.IO.File]::ReadAllBytes($Path))
}
