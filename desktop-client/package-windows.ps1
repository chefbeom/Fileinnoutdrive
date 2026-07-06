param(
  [string]$OutputDir = "$PSScriptRoot\dist",
  [string]$Version = "",
  [string]$PythonRuntimeDir = ""
)

$ErrorActionPreference = "Stop"

$sourceDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$client = Join-Path $sourceDir "fileinnout_desktop.py"
$clientConstants = Join-Path $sourceDir "fileinnout_desktop_constants.py"
$clientModels = Join-Path $sourceDir "fileinnout_desktop_models.py"
$clientPaths = Join-Path $sourceDir "fileinnout_desktop_paths.py"
$clientApi = Join-Path $sourceDir "fileinnout_desktop_api.py"
$clientSecurity = Join-Path $sourceDir "fileinnout_desktop_security.py"
$clientWindows = Join-Path $sourceDir "fileinnout_desktop_windows.py"
$clientState = Join-Path $sourceDir "fileinnout_desktop_state.py"
$clientConfig = Join-Path $sourceDir "fileinnout_desktop_config.py"
$clientFiles = Join-Path $sourceDir "fileinnout_desktop_files.py"
$clientRemote = Join-Path $sourceDir "fileinnout_desktop_remote.py"
$clientWeb = Join-Path $sourceDir "fileinnout_desktop_web.py"
$clientDrive = Join-Path $sourceDir "fileinnout_desktop_drive.py"
$clientDriveHub = Join-Path $sourceDir "fileinnout_desktop_drive_hub.py"
$clientProfiles = Join-Path $sourceDir "fileinnout_desktop_profiles.py"
$clientDiagnostics = Join-Path $sourceDir "fileinnout_desktop_diagnostics.py"
$clientSharing = Join-Path $sourceDir "fileinnout_desktop_sharing.py"
$clientSync = Join-Path $sourceDir "fileinnout_desktop_sync.py"
$clientParser = Join-Path $sourceDir "fileinnout_desktop_parser.py"
$clientAccountCommands = Join-Path $sourceDir "fileinnout_desktop_account_commands.py"
$clientStatusCommands = Join-Path $sourceDir "fileinnout_desktop_status_commands.py"
$clientShareCommands = Join-Path $sourceDir "fileinnout_desktop_share_commands.py"
$clientSyncLocal = Join-Path $sourceDir "fileinnout_desktop_sync_local.py"
$clientSyncShared = Join-Path $sourceDir "fileinnout_desktop_sync_shared.py"
$clientSyncMoves = Join-Path $sourceDir "fileinnout_desktop_sync_moves.py"
$clientDriveAdoption = Join-Path $sourceDir "fileinnout_desktop_drive_adoption.py"
$desktopProgramSource = Join-Path $sourceDir "DesktopProgram.cs"
$traySource = Join-Path $sourceDir "FileInNOutDesktopTray.cs"
$desktopTrayControllerActionsSource = Join-Path $sourceDir "DesktopTrayControllerActions.cs"
$settingsFormSource = Join-Path $sourceDir "SettingsForm.cs"
$settingsFormActionsSource = Join-Path $sourceDir "SettingsFormActions.cs"
$desktopUiControlsSource = Join-Path $sourceDir "DesktopUiControls.cs"
$desktopTrayMenuSource = Join-Path $sourceDir "DesktopTrayMenu.cs"
$desktopTrayVisualsSource = Join-Path $sourceDir "DesktopTrayVisuals.cs"
$desktopSettingsTextSource = Join-Path $sourceDir "DesktopSettingsText.cs"
$desktopSettingsDialogTextSource = Join-Path $sourceDir "DesktopSettingsDialogText.cs"
$desktopModelsSource = Join-Path $sourceDir "DesktopModels.cs"
$desktopSyncTextSource = Join-Path $sourceDir "DesktopSyncText.cs"
$desktopUpdateServiceSource = Join-Path $sourceDir "DesktopUpdateService.cs"
$desktopExplorerTextSource = Join-Path $sourceDir "DesktopExplorerText.cs"
$desktopExplorerBrandingSource = Join-Path $sourceDir "DesktopExplorerBranding.cs"
$desktopExplorerNamespaceSource = Join-Path $sourceDir "DesktopExplorerNamespace.cs"
$desktopDriveHubLinksSource = Join-Path $sourceDir "DesktopDriveHubLinks.cs"
$desktopDriveHubMaintenanceSource = Join-Path $sourceDir "DesktopDriveHubMaintenance.cs"
$desktopDriveMappingSource = Join-Path $sourceDir "DesktopDriveMapping.cs"
$desktopProcessRunnerSource = Join-Path $sourceDir "DesktopProcessRunner.cs"
$desktopPathRulesSource = Join-Path $sourceDir "DesktopPathRules.cs"
$desktopDataReaderSource = Join-Path $sourceDir "DesktopDataReader.cs"
$desktopTrayConfigStoreSource = Join-Path $sourceDir "DesktopTrayConfigStore.cs"
$desktopTrayPreferencesSource = Join-Path $sourceDir "DesktopTrayPreferences.cs"
$desktopFolderProfileRulesSource = Join-Path $sourceDir "DesktopFolderProfileRules.cs"
$desktopFileSearchSource = Join-Path $sourceDir "DesktopFileSearch.cs"
$desktopSearchServiceSource = Join-Path $sourceDir "DesktopSearchService.cs"
$desktopSyncStateSource = Join-Path $sourceDir "DesktopSyncState.cs"
$desktopChangeTrackerSource = Join-Path $sourceDir "DesktopChangeTracker.cs"
$desktopSyncCommandRunnerSource = Join-Path $sourceDir "DesktopSyncCommandRunner.cs"
$explorerDriveLauncherSource = Join-Path $sourceDir "ExplorerDriveLauncher.cs"
$cloudFilesIntegrationSource = Join-Path $sourceDir "CloudFilesIntegration.cs"
$installer = Join-Path $sourceDir "install-windows.ps1"
$shellInstallerHelper = Join-Path $sourceDir "install-windows-shell.ps1"
$driveHubInstallerHelper = Join-Path $sourceDir "install-windows-drive-hub.ps1"
$payloadInstallerHelper = Join-Path $sourceDir "install-windows-payload.ps1"
$uninstaller = Join-Path $sourceDir "uninstall-windows.ps1"
$installVerifier = Join-Path $sourceDir "verify_windows_install.ps1"
$readme = Join-Path $sourceDir "README.md"

foreach ($path in @($client, $clientConstants, $clientModels, $clientPaths, $clientApi, $clientSecurity, $clientWindows, $clientState, $clientConfig, $clientFiles, $clientRemote, $clientWeb, $clientDrive, $clientDriveHub, $clientProfiles, $clientDiagnostics, $clientSharing, $clientSync, $clientParser, $clientAccountCommands, $clientStatusCommands, $clientShareCommands, $clientSyncLocal, $clientSyncShared, $clientSyncMoves, $clientDriveAdoption, $desktopProgramSource, $traySource, $desktopTrayControllerActionsSource, $settingsFormSource, $settingsFormActionsSource, $desktopUiControlsSource, $desktopTrayMenuSource, $desktopTrayVisualsSource, $desktopSettingsTextSource, $desktopSettingsDialogTextSource, $desktopModelsSource, $desktopSyncTextSource, $desktopUpdateServiceSource, $desktopExplorerTextSource, $desktopExplorerBrandingSource, $desktopExplorerNamespaceSource, $desktopDriveHubLinksSource, $desktopDriveHubMaintenanceSource, $desktopDriveMappingSource, $desktopProcessRunnerSource, $desktopPathRulesSource, $desktopDataReaderSource, $desktopTrayConfigStoreSource, $desktopTrayPreferencesSource, $desktopFolderProfileRulesSource, $desktopFileSearchSource, $desktopSearchServiceSource, $desktopSyncStateSource, $desktopChangeTrackerSource, $explorerDriveLauncherSource, $desktopSyncCommandRunnerSource, $cloudFilesIntegrationSource, $installer, $shellInstallerHelper, $driveHubInstallerHelper, $payloadInstallerHelper, $uninstaller, $installVerifier, $readme)) {
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
    $tab = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(21, 128, 61))
    $body = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(22, 163, 74))
    $shine = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(110, 231, 183))
    $border = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(22, 101, 52)), 1
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
    [string[]]$Sources,
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
    /reference:System.Security.dll `
    /reference:System.Web.Extensions.dll `
    $Sources
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
Copy-Item -Force -Path $clientConstants -Destination (Join-Path $stagingRoot "fileinnout_desktop_constants.py")
Copy-Item -Force -Path $clientModels -Destination (Join-Path $stagingRoot "fileinnout_desktop_models.py")
Copy-Item -Force -Path $clientPaths -Destination (Join-Path $stagingRoot "fileinnout_desktop_paths.py")
Copy-Item -Force -Path $clientApi -Destination (Join-Path $stagingRoot "fileinnout_desktop_api.py")
Copy-Item -Force -Path $clientSecurity -Destination (Join-Path $stagingRoot "fileinnout_desktop_security.py")
Copy-Item -Force -Path $clientWindows -Destination (Join-Path $stagingRoot "fileinnout_desktop_windows.py")
Copy-Item -Force -Path $clientState -Destination (Join-Path $stagingRoot "fileinnout_desktop_state.py")
Copy-Item -Force -Path $clientConfig -Destination (Join-Path $stagingRoot "fileinnout_desktop_config.py")
Copy-Item -Force -Path $clientFiles -Destination (Join-Path $stagingRoot "fileinnout_desktop_files.py")
Copy-Item -Force -Path $clientRemote -Destination (Join-Path $stagingRoot "fileinnout_desktop_remote.py")
Copy-Item -Force -Path $clientWeb -Destination (Join-Path $stagingRoot "fileinnout_desktop_web.py")
Copy-Item -Force -Path $clientDrive -Destination (Join-Path $stagingRoot "fileinnout_desktop_drive.py")
Copy-Item -Force -Path $clientDriveHub -Destination (Join-Path $stagingRoot "fileinnout_desktop_drive_hub.py")
Copy-Item -Force -Path $clientProfiles -Destination (Join-Path $stagingRoot "fileinnout_desktop_profiles.py")
Copy-Item -Force -Path $clientDiagnostics -Destination (Join-Path $stagingRoot "fileinnout_desktop_diagnostics.py")
Copy-Item -Force -Path $clientSharing -Destination (Join-Path $stagingRoot "fileinnout_desktop_sharing.py")
Copy-Item -Force -Path $clientSync -Destination (Join-Path $stagingRoot "fileinnout_desktop_sync.py")
Copy-Item -Force -Path $clientParser -Destination (Join-Path $stagingRoot "fileinnout_desktop_parser.py")
Copy-Item -Force -Path $clientAccountCommands -Destination (Join-Path $stagingRoot "fileinnout_desktop_account_commands.py")
Copy-Item -Force -Path $clientStatusCommands -Destination (Join-Path $stagingRoot "fileinnout_desktop_status_commands.py")
Copy-Item -Force -Path $clientShareCommands -Destination (Join-Path $stagingRoot "fileinnout_desktop_share_commands.py")
Copy-Item -Force -Path $clientSyncLocal -Destination (Join-Path $stagingRoot "fileinnout_desktop_sync_local.py")
Copy-Item -Force -Path $clientSyncShared -Destination (Join-Path $stagingRoot "fileinnout_desktop_sync_shared.py")
Copy-Item -Force -Path $clientSyncMoves -Destination (Join-Path $stagingRoot "fileinnout_desktop_sync_moves.py")
Copy-Item -Force -Path $clientDriveAdoption -Destination (Join-Path $stagingRoot "fileinnout_desktop_drive_adoption.py")
Copy-Item -Force -Path $installer -Destination (Join-Path $stagingRoot "install-windows.ps1")
Copy-Item -Force -Path $shellInstallerHelper -Destination (Join-Path $stagingRoot "install-windows-shell.ps1")
Copy-Item -Force -Path $driveHubInstallerHelper -Destination (Join-Path $stagingRoot "install-windows-drive-hub.ps1")
Copy-Item -Force -Path $payloadInstallerHelper -Destination (Join-Path $stagingRoot "install-windows-payload.ps1")
Copy-Item -Force -Path $uninstaller -Destination (Join-Path $stagingRoot "uninstall-windows.ps1")
Copy-Item -Force -Path $installVerifier -Destination (Join-Path $stagingRoot "verify_windows_install.ps1")
Copy-Item -Force -Path $readme -Destination (Join-Path $stagingRoot "README.md")
$stagedDesktopProgramSource = Join-Path $stagingRoot "DesktopProgram.cs"
$stagedTraySource = Join-Path $stagingRoot "FileInNOutDesktopTray.cs"
$stagedDesktopTrayControllerActionsSource = Join-Path $stagingRoot "DesktopTrayControllerActions.cs"
$stagedSettingsFormSource = Join-Path $stagingRoot "SettingsForm.cs"
$stagedSettingsFormActionsSource = Join-Path $stagingRoot "SettingsFormActions.cs"
$stagedDesktopUiControlsSource = Join-Path $stagingRoot "DesktopUiControls.cs"
$stagedDesktopTrayMenuSource = Join-Path $stagingRoot "DesktopTrayMenu.cs"
$stagedDesktopTrayVisualsSource = Join-Path $stagingRoot "DesktopTrayVisuals.cs"
$stagedDesktopSettingsTextSource = Join-Path $stagingRoot "DesktopSettingsText.cs"
$stagedDesktopSettingsDialogTextSource = Join-Path $stagingRoot "DesktopSettingsDialogText.cs"
$stagedDesktopModelsSource = Join-Path $stagingRoot "DesktopModels.cs"
$stagedDesktopSyncTextSource = Join-Path $stagingRoot "DesktopSyncText.cs"
$stagedDesktopUpdateServiceSource = Join-Path $stagingRoot "DesktopUpdateService.cs"
$stagedDesktopExplorerTextSource = Join-Path $stagingRoot "DesktopExplorerText.cs"
$stagedDesktopExplorerBrandingSource = Join-Path $stagingRoot "DesktopExplorerBranding.cs"
$stagedDesktopExplorerNamespaceSource = Join-Path $stagingRoot "DesktopExplorerNamespace.cs"
$stagedDesktopDriveHubLinksSource = Join-Path $stagingRoot "DesktopDriveHubLinks.cs"
$stagedDesktopDriveHubMaintenanceSource = Join-Path $stagingRoot "DesktopDriveHubMaintenance.cs"
$stagedDesktopDriveMappingSource = Join-Path $stagingRoot "DesktopDriveMapping.cs"
$stagedDesktopProcessRunnerSource = Join-Path $stagingRoot "DesktopProcessRunner.cs"
$stagedDesktopPathRulesSource = Join-Path $stagingRoot "DesktopPathRules.cs"
$stagedDesktopDataReaderSource = Join-Path $stagingRoot "DesktopDataReader.cs"
$stagedDesktopTrayConfigStoreSource = Join-Path $stagingRoot "DesktopTrayConfigStore.cs"
$stagedDesktopTrayPreferencesSource = Join-Path $stagingRoot "DesktopTrayPreferences.cs"
$stagedDesktopFolderProfileRulesSource = Join-Path $stagingRoot "DesktopFolderProfileRules.cs"
$stagedDesktopFileSearchSource = Join-Path $stagingRoot "DesktopFileSearch.cs"
$stagedDesktopSearchServiceSource = Join-Path $stagingRoot "DesktopSearchService.cs"
$stagedDesktopSyncStateSource = Join-Path $stagingRoot "DesktopSyncState.cs"
$stagedDesktopChangeTrackerSource = Join-Path $stagingRoot "DesktopChangeTracker.cs"
$stagedDesktopSyncCommandRunnerSource = Join-Path $stagingRoot "DesktopSyncCommandRunner.cs"
$stagedExplorerDriveLauncherSource = Join-Path $stagingRoot "ExplorerDriveLauncher.cs"
$stagedCloudFilesIntegrationSource = Join-Path $stagingRoot "CloudFilesIntegration.cs"
Copy-Item -Force -Path $desktopProgramSource -Destination $stagedDesktopProgramSource
Copy-Item -Force -Path $traySource -Destination $stagedTraySource
Copy-Item -Force -Path $desktopTrayControllerActionsSource -Destination $stagedDesktopTrayControllerActionsSource
Copy-Item -Force -Path $settingsFormSource -Destination $stagedSettingsFormSource
Copy-Item -Force -Path $settingsFormActionsSource -Destination $stagedSettingsFormActionsSource
Copy-Item -Force -Path $desktopUiControlsSource -Destination $stagedDesktopUiControlsSource
Copy-Item -Force -Path $desktopTrayMenuSource -Destination $stagedDesktopTrayMenuSource
Copy-Item -Force -Path $desktopTrayVisualsSource -Destination $stagedDesktopTrayVisualsSource
Copy-Item -Force -Path $desktopSettingsTextSource -Destination $stagedDesktopSettingsTextSource
Copy-Item -Force -Path $desktopSettingsDialogTextSource -Destination $stagedDesktopSettingsDialogTextSource
Copy-Item -Force -Path $desktopModelsSource -Destination $stagedDesktopModelsSource
Copy-Item -Force -Path $desktopSyncTextSource -Destination $stagedDesktopSyncTextSource
Copy-Item -Force -Path $desktopUpdateServiceSource -Destination $stagedDesktopUpdateServiceSource
Copy-Item -Force -Path $desktopExplorerTextSource -Destination $stagedDesktopExplorerTextSource
Copy-Item -Force -Path $desktopExplorerBrandingSource -Destination $stagedDesktopExplorerBrandingSource
Copy-Item -Force -Path $desktopExplorerNamespaceSource -Destination $stagedDesktopExplorerNamespaceSource
Copy-Item -Force -Path $desktopDriveHubLinksSource -Destination $stagedDesktopDriveHubLinksSource
Copy-Item -Force -Path $desktopDriveHubMaintenanceSource -Destination $stagedDesktopDriveHubMaintenanceSource
Copy-Item -Force -Path $desktopDriveMappingSource -Destination $stagedDesktopDriveMappingSource
Copy-Item -Force -Path $desktopProcessRunnerSource -Destination $stagedDesktopProcessRunnerSource
Copy-Item -Force -Path $desktopPathRulesSource -Destination $stagedDesktopPathRulesSource
Copy-Item -Force -Path $desktopDataReaderSource -Destination $stagedDesktopDataReaderSource
Copy-Item -Force -Path $desktopTrayConfigStoreSource -Destination $stagedDesktopTrayConfigStoreSource
Copy-Item -Force -Path $desktopTrayPreferencesSource -Destination $stagedDesktopTrayPreferencesSource
Copy-Item -Force -Path $desktopFolderProfileRulesSource -Destination $stagedDesktopFolderProfileRulesSource
Copy-Item -Force -Path $desktopFileSearchSource -Destination $stagedDesktopFileSearchSource
Copy-Item -Force -Path $desktopSearchServiceSource -Destination $stagedDesktopSearchServiceSource
Copy-Item -Force -Path $desktopSyncStateSource -Destination $stagedDesktopSyncStateSource
Copy-Item -Force -Path $desktopChangeTrackerSource -Destination $stagedDesktopChangeTrackerSource
Copy-Item -Force -Path $desktopSyncCommandRunnerSource -Destination $stagedDesktopSyncCommandRunnerSource
Copy-Item -Force -Path $explorerDriveLauncherSource -Destination $stagedExplorerDriveLauncherSource
Copy-Item -Force -Path $cloudFilesIntegrationSource -Destination $stagedCloudFilesIntegrationSource
$stagedTrayText = [System.IO.File]::ReadAllText($stagedTraySource, [System.Text.Encoding]::UTF8)
$stagedTrayText = $stagedTrayText.Replace("__FILEINNOUT_DESKTOP_VERSION__", $Version)
[System.IO.File]::WriteAllText($stagedTraySource, $stagedTrayText, [System.Text.UTF8Encoding]::new($false))

$iconPath = Join-Path $stagingRoot "FileInNOutDesktop.ico"
$trayExePath = Join-Path $stagingRoot "FileInNOutDesktop.exe"
New-FileInNOutIcon -Path $iconPath
Build-TrayApplication -Sources @($stagedDesktopProgramSource, $stagedTraySource, $stagedDesktopTrayControllerActionsSource, $stagedSettingsFormSource, $stagedSettingsFormActionsSource, $stagedDesktopUiControlsSource, $stagedDesktopTrayMenuSource, $stagedDesktopTrayVisualsSource, $stagedDesktopSettingsTextSource, $stagedDesktopSettingsDialogTextSource, $stagedDesktopModelsSource, $stagedDesktopSyncTextSource, $stagedDesktopUpdateServiceSource, $stagedDesktopExplorerTextSource, $stagedDesktopExplorerBrandingSource, $stagedDesktopExplorerNamespaceSource, $stagedDesktopDriveHubLinksSource, $stagedDesktopDriveHubMaintenanceSource, $stagedDesktopDriveMappingSource, $stagedDesktopProcessRunnerSource, $stagedDesktopPathRulesSource, $stagedDesktopDataReaderSource, $stagedDesktopTrayConfigStoreSource, $stagedDesktopTrayPreferencesSource, $stagedDesktopFolderProfileRulesSource, $stagedDesktopFileSearchSource, $stagedDesktopSearchServiceSource, $stagedDesktopSyncStateSource, $stagedDesktopChangeTrackerSource, $stagedDesktopSyncCommandRunnerSource, $stagedExplorerDriveLauncherSource, $stagedCloudFilesIntegrationSource) -Output $trayExePath -Icon $iconPath

if ($PythonRuntimeDir) {
  if (-not (Test-Path -LiteralPath $PythonRuntimeDir)) {
    throw "PythonRuntimeDir does not exist: $PythonRuntimeDir"
  }
  Copy-Item -Recurse -Force -Path (Resolve-Path -LiteralPath $PythonRuntimeDir).Path -Destination (Join-Path $stagingRoot "python-runtime")
}

$packageFiles = @(
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
