param(
  [string]$PackagePath = "",
  [string]$PythonPath = ""
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $scriptDir "verify_windows_package_helpers.ps1")

$PackagePath = Resolve-FileInNOutDesktopPackagePath -PackagePath $PackagePath -ScriptDir $scriptDir

$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("FileInNOutDesktopPackageVerify-" + [System.Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Force -Path $tempRoot | Out-Null

try {
  Expand-Archive -Path $PackagePath -DestinationPath $tempRoot -Force

  $required = Get-FileInNOutDesktopRequiredPackageFiles
  Assert-FileInNOutDesktopRequiredPackageFiles -PackageRoot $tempRoot -RequiredFiles $required
  Assert-FileInNOutDesktopManifestChecksums -PackageRoot $tempRoot -RequiredFiles $required

  $desktopProgramPath = Join-Path $tempRoot "DesktopProgram.cs"
  $traySourcePath = Join-Path $tempRoot "FileInNOutDesktopTray.cs"
  $desktopTrayControllerActionsPath = Join-Path $tempRoot "DesktopTrayControllerActions.cs"
  $settingsFormPath = Join-Path $tempRoot "SettingsForm.cs"
  $settingsFormActionsPath = Join-Path $tempRoot "SettingsFormActions.cs"
  $desktopUiControlsPath = Join-Path $tempRoot "DesktopUiControls.cs"
  $desktopTrayMenuPath = Join-Path $tempRoot "DesktopTrayMenu.cs"
$desktopTrayVisualsPath = Join-Path $tempRoot "DesktopTrayVisuals.cs"
$desktopSettingsTextPath = Join-Path $tempRoot "DesktopSettingsText.cs"
$desktopSettingsDialogTextPath = Join-Path $tempRoot "DesktopSettingsDialogText.cs"
  $desktopProgramText = [System.Text.Encoding]::UTF8.GetString([System.IO.File]::ReadAllBytes($desktopProgramPath))
  $traySourceText = [System.Text.Encoding]::UTF8.GetString([System.IO.File]::ReadAllBytes($traySourcePath))
  $desktopTrayControllerActionsText = [System.Text.Encoding]::UTF8.GetString([System.IO.File]::ReadAllBytes($desktopTrayControllerActionsPath))
  $settingsFormText = [System.Text.Encoding]::UTF8.GetString([System.IO.File]::ReadAllBytes($settingsFormPath))
  $settingsFormActionsText = [System.Text.Encoding]::UTF8.GetString([System.IO.File]::ReadAllBytes($settingsFormActionsPath))
  $desktopUiControlsText = [System.Text.Encoding]::UTF8.GetString([System.IO.File]::ReadAllBytes($desktopUiControlsPath))
  $desktopTrayMenuText = [System.Text.Encoding]::UTF8.GetString([System.IO.File]::ReadAllBytes($desktopTrayMenuPath))
$desktopTrayVisualsText = [System.Text.Encoding]::UTF8.GetString([System.IO.File]::ReadAllBytes($desktopTrayVisualsPath))
$desktopSettingsText = [System.Text.Encoding]::UTF8.GetString([System.IO.File]::ReadAllBytes($desktopSettingsTextPath))
$desktopSettingsDialogText = [System.Text.Encoding]::UTF8.GetString([System.IO.File]::ReadAllBytes($desktopSettingsDialogTextPath))
  $desktopSyncTextPath = Join-Path $tempRoot "DesktopSyncText.cs"
  $desktopUpdateServicePath = Join-Path $tempRoot "DesktopUpdateService.cs"
  $desktopExplorerTextPath = Join-Path $tempRoot "DesktopExplorerText.cs"
  $desktopExplorerBrandingPath = Join-Path $tempRoot "DesktopExplorerBranding.cs"
  $desktopExplorerNamespacePath = Join-Path $tempRoot "DesktopExplorerNamespace.cs"
  $desktopDriveHubLinksPath = Join-Path $tempRoot "DesktopDriveHubLinks.cs"
  $desktopDriveHubMaintenancePath = Join-Path $tempRoot "DesktopDriveHubMaintenance.cs"
  $desktopDriveMappingPath = Join-Path $tempRoot "DesktopDriveMapping.cs"
  $desktopProcessRunnerPath = Join-Path $tempRoot "DesktopProcessRunner.cs"
  $desktopPathRulesPath = Join-Path $tempRoot "DesktopPathRules.cs"
  $desktopDataReaderPath = Join-Path $tempRoot "DesktopDataReader.cs"
  $desktopTrayConfigStorePath = Join-Path $tempRoot "DesktopTrayConfigStore.cs"
  $desktopTrayPreferencesPath = Join-Path $tempRoot "DesktopTrayPreferences.cs"
  $desktopFolderProfileRulesPath = Join-Path $tempRoot "DesktopFolderProfileRules.cs"
  $desktopFileSearchPath = Join-Path $tempRoot "DesktopFileSearch.cs"
  $desktopSearchServicePath = Join-Path $tempRoot "DesktopSearchService.cs"
  $desktopSyncStatePath = Join-Path $tempRoot "DesktopSyncState.cs"
  $desktopChangeTrackerPath = Join-Path $tempRoot "DesktopChangeTracker.cs"
$desktopSyncCommandRunnerPath = Join-Path $tempRoot "DesktopSyncCommandRunner.cs"
  $explorerDriveLauncherPath = Join-Path $tempRoot "ExplorerDriveLauncher.cs"
  $cloudFilesIntegrationPath = Join-Path $tempRoot "CloudFilesIntegration.cs"
  $desktopSyncText = [System.Text.Encoding]::UTF8.GetString([System.IO.File]::ReadAllBytes($desktopSyncTextPath))
  $desktopUpdateServiceText = [System.Text.Encoding]::UTF8.GetString([System.IO.File]::ReadAllBytes($desktopUpdateServicePath))
  $desktopExplorerText = [System.Text.Encoding]::UTF8.GetString([System.IO.File]::ReadAllBytes($desktopExplorerTextPath))
  $desktopExplorerBrandingText = [System.Text.Encoding]::UTF8.GetString([System.IO.File]::ReadAllBytes($desktopExplorerBrandingPath))
  $desktopExplorerNamespaceText = [System.Text.Encoding]::UTF8.GetString([System.IO.File]::ReadAllBytes($desktopExplorerNamespacePath))
  $desktopDriveHubLinksText = [System.Text.Encoding]::UTF8.GetString([System.IO.File]::ReadAllBytes($desktopDriveHubLinksPath))
  $desktopDriveHubMaintenanceText = [System.Text.Encoding]::UTF8.GetString([System.IO.File]::ReadAllBytes($desktopDriveHubMaintenancePath))
  $desktopDriveMappingText = [System.Text.Encoding]::UTF8.GetString([System.IO.File]::ReadAllBytes($desktopDriveMappingPath))
  $desktopProcessRunnerText = [System.Text.Encoding]::UTF8.GetString([System.IO.File]::ReadAllBytes($desktopProcessRunnerPath))
  $desktopPathRulesText = [System.Text.Encoding]::UTF8.GetString([System.IO.File]::ReadAllBytes($desktopPathRulesPath))
  $desktopDataReaderText = [System.Text.Encoding]::UTF8.GetString([System.IO.File]::ReadAllBytes($desktopDataReaderPath))
  $desktopTrayConfigStoreText = [System.Text.Encoding]::UTF8.GetString([System.IO.File]::ReadAllBytes($desktopTrayConfigStorePath))
  $desktopTrayPreferencesText = [System.Text.Encoding]::UTF8.GetString([System.IO.File]::ReadAllBytes($desktopTrayPreferencesPath))
  $desktopFolderProfileRulesText = [System.Text.Encoding]::UTF8.GetString([System.IO.File]::ReadAllBytes($desktopFolderProfileRulesPath))
  $desktopFileSearchText = [System.Text.Encoding]::UTF8.GetString([System.IO.File]::ReadAllBytes($desktopFileSearchPath))
  $desktopSearchServiceText = [System.Text.Encoding]::UTF8.GetString([System.IO.File]::ReadAllBytes($desktopSearchServicePath))
  $desktopSyncStateText = [System.Text.Encoding]::UTF8.GetString([System.IO.File]::ReadAllBytes($desktopSyncStatePath))
  $desktopChangeTrackerText = [System.Text.Encoding]::UTF8.GetString([System.IO.File]::ReadAllBytes($desktopChangeTrackerPath))
$desktopSyncCommandRunnerText = [System.Text.Encoding]::UTF8.GetString([System.IO.File]::ReadAllBytes($desktopSyncCommandRunnerPath))
  $explorerDriveLauncherText = [System.Text.Encoding]::UTF8.GetString([System.IO.File]::ReadAllBytes($explorerDriveLauncherPath))
  $cloudFilesIntegrationText = [System.Text.Encoding]::UTF8.GetString([System.IO.File]::ReadAllBytes($cloudFilesIntegrationPath))
  $expectedKoreanTerms = @(
    (-join ([char[]](0xC900, 0xBE44, 0xB428))),
    (-join ([char[]](0xB85C, 0xADF8, 0xC778))),
    (-join ([char[]](0xB3D9, 0xAE30, 0xD654))),
    (-join ([char[]](0xD3F4, 0xB354))),
    (-join ([char[]](0xACF5, 0xC720))),
    (-join ([char[]](0xB4DC, 0xB77C, 0xC774, 0xBE0C))),
    (-join ([char[]](0xC9C0, 0xAE08, 0x0020, 0xB3D9, 0xAE30, 0xD654))),
    (-join ([char[]](0xD30C, 0xC77C, 0x0020, 0xBCC0, 0xACBD, 0x0020, 0xC2DC, 0x0020, 0xC54C, 0xB9BC))),
    (-join ([char[]](0xC885, 0xB8CC)))
  )
  if (-not $desktopSyncText.Contains("DesktopSyncText")) {
    throw "DesktopSyncText.cs does not contain the extracted desktop sync text helper"
  }
  if (-not $desktopUpdateServiceText.Contains("DesktopUpdateService")) {
    throw "DesktopUpdateService.cs does not contain the extracted desktop update helper"
  }
  if (-not $desktopExplorerText.Contains("DesktopExplorerText")) {
    throw "DesktopExplorerText.cs does not contain the extracted Explorer text helper"
  }
  if (-not $desktopExplorerBrandingText.Contains("DesktopExplorerBranding") -or -not $desktopExplorerBrandingText.Contains("desktop.ini")) {
    throw "DesktopExplorerBranding.cs does not contain the extracted Explorer branding helper"
  }
  if (-not $desktopExplorerNamespaceText.Contains("DesktopExplorerNamespace")) {
    throw "DesktopExplorerNamespace.cs does not contain the extracted Explorer namespace helper"
  }
  if (-not $desktopDriveHubLinksText.Contains("DesktopDriveHubLinks")) {
    throw "DesktopDriveHubLinks.cs does not contain the extracted desktop drive hub link helper"
  }
  if (-not $desktopDriveHubMaintenanceText.Contains("DesktopDriveHubMaintenance") -or -not $desktopDriveHubMaintenanceText.Contains("SyncDriveHubLinks") -or -not $desktopDriveHubMaintenanceText.Contains("EnsureDriveHubJunction")) {
    throw "DesktopDriveHubMaintenance.cs does not contain the extracted desktop drive hub maintenance helper"
  }
  if (-not $desktopDriveMappingText.Contains("DesktopDriveMapping") -or -not $desktopDriveMappingText.Contains("CurrentSubstTarget") -or -not $desktopDriveMappingText.Contains("RegisterAppearance")) {
    throw "DesktopDriveMapping.cs does not contain the extracted desktop drive mapping helper"
  }
  if (-not $desktopProcessRunnerText.Contains("DesktopProcessRunner")) {
    throw "DesktopProcessRunner.cs does not contain the extracted desktop process runner helper"
  }
  if (-not $desktopPathRulesText.Contains("DesktopPathRules")) {
    throw "DesktopPathRules.cs does not contain the extracted desktop path rules helper"
  }
  if (-not $desktopDataReaderText.Contains("DesktopDataReader")) {
    throw "DesktopDataReader.cs does not contain the extracted desktop data reader helper"
  }
  if (-not $desktopTrayConfigStoreText.Contains("DesktopTrayConfigStore")) {
    throw "DesktopTrayConfigStore.cs does not contain the extracted desktop tray config store"
  }
  if (-not $desktopFolderProfileRulesText.Contains("DesktopFolderProfileRules") -or -not $desktopFolderProfileRulesText.Contains("RemoveFolder") -or -not $desktopFolderProfileRulesText.Contains("Signature")) {
    throw "DesktopFolderProfileRules.cs does not contain the extracted desktop folder profile rules helper"
  }
  if (-not $desktopFileSearchText.Contains("DesktopFileSearch")) {
    throw "DesktopFileSearch.cs does not contain the extracted desktop file search helper"
  }
  if (-not $desktopSearchServiceText.Contains("DesktopSearchService")) {
    throw "DesktopSearchService.cs does not contain the extracted desktop search service"
  }
  if (-not $desktopSyncStateText.Contains("DesktopSyncState")) {
    throw "DesktopSyncState.cs does not contain the extracted desktop sync state helper"
  }
  if (-not $desktopChangeTrackerText.Contains("DesktopChangeTracker")) {
    throw "DesktopChangeTracker.cs does not contain the extracted desktop change tracker helper"
  }
  if (-not $desktopSyncCommandRunnerText.Contains("DesktopSyncCommandRunner")) {
    throw "DesktopSyncCommandRunner.cs does not contain the extracted desktop sync command runner helper"
  }
  if (-not $explorerDriveLauncherText.Contains("ExplorerDriveLauncher")) {
    throw "ExplorerDriveLauncher.cs does not contain the extracted drive launcher helper"
  }
  if (-not $cloudFilesIntegrationText.Contains("CloudFilesIntegration")) {
    throw "CloudFilesIntegration.cs does not contain the extracted Windows Cloud Files integration helper"
  }
  if (-not $desktopProgramText.Contains("internal static class Program")) {
    throw "DesktopProgram.cs does not contain the extracted desktop entry point"
  }
  if (-not $settingsFormText.Contains("SettingsForm")) {
    throw "SettingsForm.cs does not contain the extracted desktop settings form"
  }
  if (-not $desktopTrayMenuText.Contains("DesktopTrayMenu") -or -not $desktopTrayMenuText.Contains("BuildMenuKorean")) {
    throw "DesktopTrayMenu.cs does not contain the extracted desktop tray menu helper"
  }
  if (-not $desktopTrayVisualsText.Contains("DesktopTrayVisuals") -or -not $desktopTrayVisualsText.Contains("CreateGreenFolderIcon")) {
    throw "DesktopTrayVisuals.cs does not contain the extracted desktop tray visuals helper"
  }
  if (-not $desktopSettingsText.Contains("DesktopSettingsText") -or -not $desktopSettingsText.Contains("BuildStorageSummary") -or -not $desktopSettingsText.Contains("BuildStatusText")) {
    throw "DesktopSettingsText.cs does not contain the extracted desktop settings text helper"
  }
  if (-not $desktopSettingsDialogText.Contains("DesktopSettingsDialogText") -or -not $desktopSettingsDialogText.Contains("LoginFailedTitle") -or -not $desktopSettingsDialogText.Contains("BrowseFolderDescription")) {
    throw "DesktopSettingsDialogText.cs does not contain the extracted desktop settings dialog text helper"
  }
  if (-not $desktopTrayPreferencesText.Contains("DesktopTrayPreferences") -or -not $desktopTrayPreferencesText.Contains("AutoSyncEnabled") -or -not $desktopTrayPreferencesText.Contains("LastUpdateCheckUtc")) {
    throw "DesktopTrayPreferences.cs does not contain the extracted desktop tray preferences helper"
  }
  foreach ($requiredDesktopUiToken in @("AppColors", "BufferedPanel", "RoundedPanel", "RoundedButton", "SmoothProgress", "CreateButton", "CreateCheckBox", "CreateDropDown", "CreateDetailsListView", "CreateReadOnlyLogTextBox")) {
    if (-not $desktopUiControlsText.Contains($requiredDesktopUiToken)) {
      throw "DesktopUiControls.cs does not contain the extracted desktop UI helper: $requiredDesktopUiToken"
    }
  }
  $desktopTrayIntegrationText = $desktopProgramText + "`n" + $traySourceText + "`n" + $desktopTrayControllerActionsText + "`n" + $settingsFormText + "`n" + $settingsFormActionsText + "`n" + $desktopUiControlsText + "`n" + $desktopTrayMenuText + "`n" + $desktopTrayVisualsText + "`n" + $desktopSettingsText + "`n" + $desktopSettingsDialogText + "`n" + $desktopSyncText + "`n" + $desktopUpdateServiceText + "`n" + $desktopExplorerText + "`n" + $desktopExplorerNamespaceText + "`n" + $desktopDriveHubLinksText + "`n" + $desktopDriveHubMaintenanceText + "`n" + $desktopDriveMappingText + "`n" + $desktopProcessRunnerText + "`n" + $desktopPathRulesText + "`n" + $desktopDataReaderText + "`n" + $desktopTrayPreferencesText + "`n" + $desktopFolderProfileRulesText + "`n" + $desktopFileSearchText + "`n" + $desktopSearchServiceText + "`n" + $desktopSyncStateText + "`n" + $desktopChangeTrackerText + "`n" + $desktopSyncCommandRunnerText + "`n" + $explorerDriveLauncherText + "`n" + $cloudFilesIntegrationText
  foreach ($term in $expectedKoreanTerms) {
    if (-not $desktopTrayIntegrationText.Contains($term)) {
      throw "FileInNOutDesktopTray.cs lost expected UTF-8 Korean UI text: $term"
    }
  }
  if (-not $desktopTrayIntegrationText.Contains("AddWatcher(Path.Combine(driveRootPath, myDriveHubName), false)")) {
    throw "FileInNOutDesktopTray.cs does not watch the My Drive hub for folder adoption"
  }
  if (-not $desktopTrayIntegrationText.Contains("AddWatcher(Path.Combine(driveRootPath, sharedDriveHubName), false)")) {
    throw "FileInNOutDesktopTray.cs does not watch the shared hub for drive-root changes"
  }
  if (-not $desktopTrayIntegrationText.Contains("AddSharedOwnerDriveHubWatchers(config, driveRootPath, sharedDriveHubName)")) {
    throw "FileInNOutDesktopTray.cs does not watch shared owner hub folders for Google Drive style shared-folder changes"
  }
  foreach ($requiredStartupSyncToken in @("initialSyncTimer", "initialSyncTimer.Interval = 3000", "initialSyncTimer.Start()", "initialSyncTimer.Stop()", "SyncNow(false)")) {
    if (-not $desktopTrayIntegrationText.Contains($requiredStartupSyncToken)) {
      throw "FileInNOutDesktopTray.cs does not run a quiet startup sync scan: $requiredStartupSyncToken"
    }
  }
  foreach ($requiredExplorerBrandingToken in @("ExplorerDisplayNameForFolder", "ExplorerInfoTipForFolder", "ExplorerStatusInfoTipForFolder", "RefreshExplorerStatusHints", "DesktopExplorerBranding.Apply", "DesktopExplorerBranding.Clear", "DriveRootExplorerInfoTip", "SharedDriveExplorerInfoTip")) {
    if (-not $desktopTrayIntegrationText.Contains($requiredExplorerBrandingToken)) {
      throw "FileInNOutDesktopTray.cs does not write role-specific Explorer desktop.ini metadata: $requiredExplorerBrandingToken"
    }
  }
  foreach ($requiredExplorerBrandingHelperToken in @("SafeDesktopIniValue", "Encoding.Unicode", "IconFile=", "FileAttributes.System", "FileAttributes.ReadOnly")) {
    if (-not $desktopExplorerBrandingText.Contains($requiredExplorerBrandingHelperToken)) {
      throw "DesktopExplorerBranding.cs does not write role-specific Explorer desktop.ini metadata: $requiredExplorerBrandingHelperToken"
    }
  }
  $expectedPauseControlTerms = @(
    "IsSyncPaused",
    (-join ([char[]](0xB3D9, 0xAE30, 0xD654, 0x0020, 0xC77C, 0xC2DC, 0xC815, 0xC9C0))),
    (-join ([char[]](0xB3D9, 0xAE30, 0xD654, 0x0020, 0xC7AC, 0xAC1C))),
    (-join ([char[]](0xB3D9, 0xAE30, 0xD654, 0x0020, 0xC77C, 0xC2DC, 0xC815, 0xC9C0, 0xB428))),
    (-join ([char[]](0xD30C, 0xC77C, 0x0020, 0xBCC0, 0xACBD, 0x0020, 0xBC0F, 0x0020, 0x0032, 0x0030, 0xCD08, 0xB9C8, 0xB2E4, 0x0020, 0xC790, 0xB3D9, 0x0020, 0xB3D9, 0xAE30, 0xD654)))
  )
  foreach ($requiredPauseControlToken in $expectedPauseControlTerms) {
    if (-not $desktopTrayIntegrationText.Contains($requiredPauseControlToken)) {
      throw "FileInNOutDesktopTray.cs does not expose Google Drive style pause/resume sync controls: $requiredPauseControlToken"
    }
  }
  $expectedActivityUiTerms = @(
    "ListRecentSyncActivity",
    "SyncActivityItem",
    "syncActivity",
    "\uBB38\uC81C \uBC0F \uB3D9\uAE30\uD654 \uD65C\uB3D9",
    "BuildSyncActivityDetail"
  )
  foreach ($requiredActivityUiToken in $expectedActivityUiTerms) {
    if (-not $desktopTrayIntegrationText.Contains($requiredActivityUiToken)) {
      throw "FileInNOutDesktopTray.cs does not show real recent sync activity: $requiredActivityUiToken"
    }
  }
  foreach ($requiredFolderStatusToken in @("FolderStatusLabel", "FolderPermissionLabel", "NormalizePermission", "PermissionLabel", "permission", "CountPendingLocalChanges", "LocalSignatureMatches", "FileMtimeMilliseconds", "mtimeMs", "RefreshFolderStatuses")) {
    if (-not $desktopTrayIntegrationText.Contains($requiredFolderStatusToken)) {
      throw "FileInNOutDesktopTray.cs does not expose per-folder sync status/permissions in the sync folder list: $requiredFolderStatusToken"
    }
  }
  foreach ($requiredSyncIssueToken in @("ListSyncIssues", "IsConflictCopyPath", "SkippedDirtyCount", "conflict ")) {
    if (-not $desktopTrayIntegrationText.Contains($requiredSyncIssueToken)) {
      throw "FileInNOutDesktopTray.cs does not surface sync issues and conflict copies in the activity list: $requiredSyncIssueToken"
    }
  }
  foreach ($requiredSearchUiToken in @("SearchLocalFiles", "SearchFiles", "SearchCloudFiles", "SearchResultItem", "OpenSelectedSearchResult", "EnumerateSearchablePaths", "/select,", "search --query", "WebUrl")) {
    if (-not $desktopTrayIntegrationText.Contains($requiredSearchUiToken)) {
      throw "FileInNOutDesktopTray.cs does not expose desktop file search results: $requiredSearchUiToken"
    }
  }

  $desktopClientText = [System.Text.Encoding]::UTF8.GetString(
    [System.IO.File]::ReadAllBytes((Join-Path $tempRoot "fileinnout_desktop.py"))
  )
  $desktopPathsText = [System.Text.Encoding]::UTF8.GetString(
    [System.IO.File]::ReadAllBytes((Join-Path $tempRoot "fileinnout_desktop_paths.py"))
  )
  $desktopApiText = [System.Text.Encoding]::UTF8.GetString(
    [System.IO.File]::ReadAllBytes((Join-Path $tempRoot "fileinnout_desktop_api.py"))
  )
  $desktopSecurityText = [System.Text.Encoding]::UTF8.GetString(
    [System.IO.File]::ReadAllBytes((Join-Path $tempRoot "fileinnout_desktop_security.py"))
  )
  $desktopWindowsText = [System.Text.Encoding]::UTF8.GetString(
    [System.IO.File]::ReadAllBytes((Join-Path $tempRoot "fileinnout_desktop_windows.py"))
  )
  $desktopStateText = [System.Text.Encoding]::UTF8.GetString(
    [System.IO.File]::ReadAllBytes((Join-Path $tempRoot "fileinnout_desktop_state.py"))
  )
  $desktopConfigText = [System.Text.Encoding]::UTF8.GetString(
    [System.IO.File]::ReadAllBytes((Join-Path $tempRoot "fileinnout_desktop_config.py"))
  )
  $desktopFilesText = [System.Text.Encoding]::UTF8.GetString(
    [System.IO.File]::ReadAllBytes((Join-Path $tempRoot "fileinnout_desktop_files.py"))
  )
  $desktopRemoteText = [System.Text.Encoding]::UTF8.GetString(
    [System.IO.File]::ReadAllBytes((Join-Path $tempRoot "fileinnout_desktop_remote.py"))
  )
  $desktopWebText = [System.Text.Encoding]::UTF8.GetString(
    [System.IO.File]::ReadAllBytes((Join-Path $tempRoot "fileinnout_desktop_web.py"))
  )
  $desktopDriveText = [System.Text.Encoding]::UTF8.GetString(
    [System.IO.File]::ReadAllBytes((Join-Path $tempRoot "fileinnout_desktop_drive.py"))
  )
  $desktopDriveHubText = [System.Text.Encoding]::UTF8.GetString(
    [System.IO.File]::ReadAllBytes((Join-Path $tempRoot "fileinnout_desktop_drive_hub.py"))
  )
  $desktopProfilesText = [System.Text.Encoding]::UTF8.GetString(
    [System.IO.File]::ReadAllBytes((Join-Path $tempRoot "fileinnout_desktop_profiles.py"))
  )
  $desktopDiagnosticsText = [System.Text.Encoding]::UTF8.GetString(
    [System.IO.File]::ReadAllBytes((Join-Path $tempRoot "fileinnout_desktop_diagnostics.py"))
  )
  $desktopSharingText = [System.Text.Encoding]::UTF8.GetString(
    [System.IO.File]::ReadAllBytes((Join-Path $tempRoot "fileinnout_desktop_sharing.py"))
  )
  $desktopSyncText = [System.Text.Encoding]::UTF8.GetString(
    [System.IO.File]::ReadAllBytes((Join-Path $tempRoot "fileinnout_desktop_sync.py"))
  )
  $desktopParserText = [System.Text.Encoding]::UTF8.GetString(
    [System.IO.File]::ReadAllBytes((Join-Path $tempRoot "fileinnout_desktop_parser.py"))
  )
  $desktopAccountCommandsText = [System.Text.Encoding]::UTF8.GetString(
    [System.IO.File]::ReadAllBytes((Join-Path $tempRoot "fileinnout_desktop_account_commands.py"))
  )
  $desktopStatusCommandsText = [System.Text.Encoding]::UTF8.GetString(
    [System.IO.File]::ReadAllBytes((Join-Path $tempRoot "fileinnout_desktop_status_commands.py"))
  )
  $desktopShareCommandsText = [System.Text.Encoding]::UTF8.GetString(
    [System.IO.File]::ReadAllBytes((Join-Path $tempRoot "fileinnout_desktop_share_commands.py"))
  )
  $desktopSyncLocalText = [System.Text.Encoding]::UTF8.GetString(
    [System.IO.File]::ReadAllBytes((Join-Path $tempRoot "fileinnout_desktop_sync_local.py"))
  )
  $desktopSyncSharedText = [System.Text.Encoding]::UTF8.GetString(
    [System.IO.File]::ReadAllBytes((Join-Path $tempRoot "fileinnout_desktop_sync_shared.py"))
  )
  $desktopSyncMovesText = [System.Text.Encoding]::UTF8.GetString(
    [System.IO.File]::ReadAllBytes((Join-Path $tempRoot "fileinnout_desktop_sync_moves.py"))
  )
  $desktopDriveAdoptionText = [System.Text.Encoding]::UTF8.GetString(
    [System.IO.File]::ReadAllBytes((Join-Path $tempRoot "fileinnout_desktop_drive_adoption.py"))
  )
  $desktopPythonText = @(
    $desktopClientText
    $desktopPathsText
    $desktopApiText
    $desktopSecurityText
    $desktopWindowsText
    $desktopStateText
    $desktopConfigText
    $desktopFilesText
    $desktopRemoteText
    $desktopWebText
    $desktopDriveText
    $desktopDriveHubText
    $desktopProfilesText
    $desktopDiagnosticsText
    $desktopSharingText
    $desktopSyncText
    $desktopParserText
    $desktopStatusCommandsText
    $desktopShareCommandsText
    $desktopSyncLocalText
    $desktopSyncSharedText
    $desktopSyncMovesText
    $desktopDriveAdoptionText
  ) -join [Environment]::NewLine
  foreach ($requiredSharingToken in @("normalize_recipient_emails", "build_pending_share_tree", "resolve_pending_share", "resolve_pending_share_id")) {
    if (-not $desktopSharingText.Contains($requiredSharingToken)) {
      throw "fileinnout_desktop_sharing.py does not contain the extracted desktop sharing helper: $requiredSharingToken"
    }
  }
  foreach ($requiredDesktopToken in @("MY_DRIVE_HUB_NAME", "SHARED_DRIVE_HUB_NAME", "ROOT_FILE_SYNC_FOLDER_NAME", "ensure_drive_root_hubs", "iter_drive_root_owned_candidates", "ensure_drive_root_file_profile", "ensure_configured_drive_mapping", "sync_drive_hub_links", "drive_hub_link_targets", "create_directory_junction", "remove_stale_drive_hub_links", "remove_empty_hub_conflict_directory", "hub_link_conflicts", "legacy_sync_folder_profile", "prepare_local_drive_config", "drive_letter_candidates", "drive_mapping_supported")) {
    if (-not $desktopPythonText.Contains($requiredDesktopToken)) {
      throw "desktop Python modules are missing drive hub adoption code: $requiredDesktopToken"
    }
  }
  foreach ($requiredNetworkRetryToken in @("GET_RETRY_ATTEMPTS", "http.client.IncompleteRead", "http.client.RemoteDisconnected", "method_name == `"GET`"", "time.sleep(0.5 * (attempt + 1))")) {
    if (-not $desktopPythonText.Contains($requiredNetworkRetryToken)) {
      throw "desktop Python modules are missing transient GET/download retry handling: $requiredNetworkRetryToken"
    }
  }
  foreach ($requiredDownloadFailureToken in @("failed_downloads", "except DesktopError:", "failed_downloads.add(local_rel)", "if rel not in failed_downloads", "download_failed", '"downloadFailed"', "stats.download_failed += 1")) {
    if (-not $desktopPythonText.Contains($requiredDownloadFailureToken)) {
      throw "desktop Python modules do not keep sync running after a per-file download failure: $requiredDownloadFailureToken"
    }
  }
  foreach ($requiredDownloadIssueToken in @("DownloadFailedCount", '"downloadFailed"', "download_failed=", "\uB2E4\uC6B4\uB85C\uB4DC \uC2E4\uD328")) {
    if (-not $desktopTrayIntegrationText.Contains($requiredDownloadIssueToken) -and -not $desktopPythonText.Contains($requiredDownloadIssueToken)) {
      throw "desktop client does not surface per-file download failures separately: $requiredDownloadIssueToken"
    }
  }
  foreach ($requiredFolderPriorityToken in @("int downloadFailed = DownloadFailedCount(syncStatus)", "return `"\uB2E4\uC6B4\uB85C\uB4DC \uC2E4\uD328 `" + downloadFailed.ToString()", "int skipped = SkippedDirtyCount(syncStatus)", "return `"\uCDA9\uB3CC \uD655\uC778 `" + skipped.ToString()")) {
    if (-not $desktopTrayIntegrationText.Contains($requiredFolderPriorityToken)) {
      throw "FileInNOutDesktopTray.cs does not prioritize actionable sync issues in folder status labels: $requiredFolderPriorityToken"
    }
  }
  foreach ($requiredSharedProfileToken in @("permission = str((item or {}).get(`"permission`")", "`"permission`": permission")) {
    if (-not $desktopPythonText.Contains($requiredSharedProfileToken)) {
      throw "desktop Python modules do not preserve shared profile permissions: $requiredSharedProfileToken"
    }
  }
  foreach ($requiredTargetSyncToken in @("cmd_sync_target", "cmd_doctor_target", "cmd_share_target", "cmd_add_sync_folder", "add_or_update_sync_folder_profile", "target_sync_profiles", "doctor-target", "share-target", "add-sync-folder", "configured_sync_folders_for_target", "desktop_target_cloud_path", "target_is_drive_root_path", "target_is_shared_drive_hub_path", "target_drive_hub_route", "drive_hub_scope_profiles_for_target", "resolve_adopted_drive_root_target", "first_owned_sync_profile", "prepare_local_drive_config(config)", "owned_profiles", "shared_profiles", "cmd_open_web", "cmd_search", "desktop_web_url", "desktop_web_url_for_cloud_path", "/main/shareFile")) {
    if (-not $desktopPythonText.Contains($requiredTargetSyncToken)) {
      throw "desktop Python modules are missing context target sync code: $requiredTargetSyncToken"
    }
  }
  foreach ($requiredMoveToken in @("move_file", "rename_file", "apply_scoped_file_moves", "protected_files", "replaceFileId")) {
    if (-not $desktopPythonText.Contains($requiredMoveToken)) {
      throw "desktop Python modules are missing remote-preserving local move/rename sync code: $requiredMoveToken"
    }
  }
  foreach ($requiredFolderMoveToken in @("apply_scoped_folder_moves", "folder_tree_shape_matches", "protected_folders", "remap_remote_paths_prefix", "remote_folder_tree_matches_state")) {
    if (-not $desktopPythonText.Contains($requiredFolderMoveToken)) {
      throw "desktop Python modules are missing remote-preserving local folder move/rename sync code: $requiredFolderMoveToken"
    }
  }
  foreach ($requiredRemoteMoveToken in @("apply_remote_path_moves", "remap_state_path_prefix", "local_tree_clean")) {
    if (-not $desktopPythonText.Contains($requiredRemoteMoveToken)) {
      throw "desktop Python modules are missing local-preserving remote move/rename pull code: $requiredRemoteMoveToken"
    }
  }

  $parseErrors = $null
  [System.Management.Automation.PSParser]::Tokenize(
    (Get-Content -Raw -Path (Join-Path $tempRoot "install-windows.ps1")),
    [ref]$parseErrors
  ) | Out-Null
  [System.Management.Automation.PSParser]::Tokenize(
    (Get-Content -Raw -Path (Join-Path $tempRoot "install-windows-shell.ps1")),
    [ref]$parseErrors
  ) | Out-Null
  [System.Management.Automation.PSParser]::Tokenize(
    (Get-Content -Raw -Path (Join-Path $tempRoot "install-windows-drive-hub.ps1")),
    [ref]$parseErrors
  ) | Out-Null
  [System.Management.Automation.PSParser]::Tokenize(
    (Get-Content -Raw -Path (Join-Path $tempRoot "install-windows-payload.ps1")),
    [ref]$parseErrors
  ) | Out-Null
  [System.Management.Automation.PSParser]::Tokenize(
    (Get-Content -Raw -Path (Join-Path $tempRoot "uninstall-windows.ps1")),
    [ref]$parseErrors
  ) | Out-Null
  if ($parseErrors.Count) {
    $parseErrors | Format-Table -AutoSize | Out-String
    throw "install-windows.ps1, install-windows-shell.ps1, install-windows-drive-hub.ps1, install-windows-payload.ps1, or uninstall-windows.ps1 has PowerShell parser errors"
  }
  $installScriptText = (Get-Content -Raw -Path (Join-Path $tempRoot "install-windows.ps1")) + "`n" + (Get-Content -Raw -Path (Join-Path $tempRoot "install-windows-shell.ps1")) + "`n" + (Get-Content -Raw -Path (Join-Path $tempRoot "install-windows-drive-hub.ps1")) + "`n" + (Get-Content -Raw -Path (Join-Path $tempRoot "install-windows-payload.ps1"))
  foreach ($requiredSourceInstallHelper in @("install-windows-payload.ps1", "DesktopTrayControllerActions.cs", "SettingsFormActions.cs", "DesktopTrayMenu.cs", "DesktopTrayVisuals.cs", "DesktopSettingsText.cs", "DesktopSettingsDialogText.cs", "DesktopExplorerBranding.cs", "DesktopDriveHubMaintenance.cs", "DesktopDriveMapping.cs", "DesktopTrayPreferences.cs", "DesktopFolderProfileRules.cs")) {
    if (-not $installScriptText.Contains($requiredSourceInstallHelper)) {
      throw "install-windows.ps1 source tray compile/copy fallback is missing helper: $requiredSourceInstallHelper"
    }
  }
  if (-not $installScriptText.Contains("Remove-FileInNOutLegacyDriveJunction -RootPath `$driveRootDir -LinkName `$driveLinkName")) {
    throw "install-windows.ps1 does not remove legacy root-level drive links during hub migration"
  }
  foreach ($requiredSharedOwnerHubToken in @("Get-FileInNOutSharedOwnerLinkName", "Get-FileInNOutSharedFolderLinkName", "SharedDriveLinkName", "SharedRemoteOwner")) {
    if (-not ($installScriptText.Contains($requiredSharedOwnerHubToken) -or $desktopTrayIntegrationText.Contains($requiredSharedOwnerHubToken))) {
      throw "desktop installer/tray does not group shared hub links by owner: $requiredSharedOwnerHubToken"
    }
  }
  if (-not $installScriptText.Contains("Invoke-FileInNOutSyncRootRegistration -Path `$driveRootDir")) {
    throw "install-windows.ps1 does not register the Cloud Files sync root against the drive root"
  }
  if (-not $installScriptText.Contains("/codepage:65001")) {
    throw "install-windows.ps1 fallback tray build does not force UTF-8 source decoding"
  }
  if (-not $installScriptText.Contains("/win32icon:`$trayIconSource")) {
    throw "install-windows.ps1 fallback tray build does not embed the FileInNOut icon"
  }
  foreach ($requiredGreenDesignToken in @("CreateGreenFolderIcon", "Color.FromArgb(244, 250, 246)", "Color.FromArgb(22, 163, 74)", "Color.FromArgb(52, 211, 153)", "Color.FromArgb(240, 253, 244)")) {
    if (-not $desktopTrayIntegrationText.Contains($requiredGreenDesignToken)) {
      throw "FileInNOutDesktopTray.cs is missing the green desktop design token: $requiredGreenDesignToken"
    }
  }
  $readmeText = Get-Content -Raw -Encoding UTF8 -Path (Join-Path $tempRoot "README.md")
  $expectedGreenReadmeTerms = @(
    (-join ([char[]](0xCD08, 0xB85D, 0xC0C9, 0x0020, 0xD3F4, 0xB354, 0x0020, 0xC544, 0xC774, 0xCF58))),
    (-join ([char[]](0xCD08, 0xB85D, 0xC0C9, 0x0020, 0x0046, 0x0069, 0x006C, 0x0065, 0x0049, 0x006E, 0x004E, 0x004F, 0x0075, 0x0074, 0x0020, 0xB85C, 0xADF8, 0xC778, 0x0020, 0xD654, 0xBA74)))
  )
  foreach ($requiredGreenReadmeToken in $expectedGreenReadmeTerms) {
    if (-not $readmeText.Contains($requiredGreenReadmeToken)) {
      throw "README.md does not describe the green desktop design: $requiredGreenReadmeToken"
    }
  }
  foreach ($requiredInstallHubToken in @("Sync-FileInNOutDriveHubLinks", "Get-FileInNOutSyncFolderProfiles", "Test-FileInNOutSharedRemotePath", "syncFolders")) {
    if (-not $installScriptText.Contains($requiredInstallHubToken)) {
      throw "install-windows.ps1 does not rebuild multi-folder drive hub links during install: $requiredInstallHubToken"
    }
  }
  foreach ($requiredLegacyInstallHubToken in @('$legacyName = ConvertTo-FileInNOutDriveLinkName -PreferredName (Split-Path -Leaf $legacyDir) -TargetPath $legacyDir', 'Name = $legacyName', 'RemotePath = $legacyName')) {
    if (-not $installScriptText.Contains($requiredLegacyInstallHubToken)) {
      throw "install-windows.ps1 does not map legacy syncDir using the actual folder name: $requiredLegacyInstallHubToken"
    }
  }
  if (-not $installScriptText.Contains('$driveLinkName = ConvertTo-FileInNOutDriveLinkName -PreferredName (Split-Path -Leaf $SyncDir) -TargetPath $SyncDir')) {
    throw "install-windows.ps1 creates the initial My Drive link with a fixed name instead of the selected sync folder name"
  }
  foreach ($requiredHubConflictRepairToken in @("RemoveEmptyHubConflictDirectory", "Remove-FileInNOutEmptyHubConflictDirectory", "Test-FileInNOutDirectoryHasUserContent", "else if (!RemoveEmptyHubConflictDirectory(linkPath))", 'elseif (-not (Remove-FileInNOutEmptyHubConflictDirectory -Path $linkPath))')) {
    if (-not ($desktopTrayIntegrationText.Contains($requiredHubConflictRepairToken) -or $installScriptText.Contains($requiredHubConflictRepairToken))) {
      throw "desktop installer/tray does not repair empty folder conflicts at drive hub link paths: $requiredHubConflictRepairToken"
    }
  }
  foreach ($requiredSharedOwnerBrandingToken in @("ApplySharedOwnerFolderBranding", "SharedDriveOwnerExplorerInfoTip", "sharedOwnerInfoTip", "brandedSharedOwnerDirs", "PruneEmptySharedOwnerFolders", "OwnerFolderHasUserContent")) {
    if (-not ($desktopTrayIntegrationText.Contains($requiredSharedOwnerBrandingToken) -or $installScriptText.Contains($requiredSharedOwnerBrandingToken))) {
      throw "desktop installer/tray does not brand shared owner drive hub folders: $requiredSharedOwnerBrandingToken"
    }
  }
  $uninstallScriptText = Get-Content -Raw -Path (Join-Path $tempRoot "uninstall-windows.ps1")
  foreach ($requiredUninstallDriveToken in @("Get-FileInNOutSubstMappings", "Remove-FileInNOutDriveMappingsForTarget", "foreach (`$mapping in Get-FileInNOutSubstMappings)")) {
    if (-not $uninstallScriptText.Contains($requiredUninstallDriveToken)) {
      throw "uninstall-windows.ps1 does not remove all FileInNOut drive mappings that target the drive root: $requiredUninstallDriveToken"
    }
  }
  if (-not $installScriptText.Contains("Get-FileInNOutDriveLetterCandidates")) {
    throw "install-windows.ps1 does not try fallback drive letters when the preferred drive is unavailable"
  }
  if (-not $installScriptText.Contains('$registeredDriveLetter = if ($mountedDriveLetter)')) {
    throw "install-windows.ps1 does not persist the actual mapped FileInNOut drive letter"
  }
  if (-not $desktopTrayIntegrationText.Contains("DriveLetterCandidates")) {
    throw "FileInNOutDesktopTray.cs does not try fallback drive letters when remapping the drive"
  }
  if (-not $desktopTrayIntegrationText.Contains("DesktopDriveMapping.CurrentSubstTarget(driveLetter, installDir)")) {
    throw "FileInNOutDesktopTray.cs does not verify the mapped drive target before opening the drive"
  }
  foreach ($requiredDynamicOpenDriveToken in @("ExplorerDriveLauncher", "--open-drive", "EnsureDriveMapping(driveLetter, driveRoot)", "DriveLetterCandidates(letter)", "SaveDriveLetter(configPath, configValues, driveRoot, mappedLetter)", "EnsureDriveRootLayout", "SyncDriveHubLinks(iconPath, myDriveHub, sharedDriveHub, LoadConfiguredSyncFolders(configValues, defaultSyncDir))", "defaultFolder.RemotePath = NormalizeRemotePathForFolder(`"`", syncDir)", "EnsureDriveHubJunction(item.Key, item.Value)", "ApplyExplorerFolderBranding(driveRoot", "RegisterDriveAppearance(installDir, mappedLetter)", "Open FileInNOut Drive.lnk", "Open FileInNOut Folder.lnk")) {
    if (-not ($desktopTrayIntegrationText.Contains($requiredDynamicOpenDriveToken) -or $installScriptText.Contains($requiredDynamicOpenDriveToken))) {
      throw "desktop installer/tray does not open the current FileInNOut drive dynamically: $requiredDynamicOpenDriveToken"
    }
  }
  if (-not $desktopTrayIntegrationText.Contains("ResolveDriveHubPathForLocalPath")) {
    throw "FileInNOutDesktopTray.cs does not prefer drive-hub paths when opening configured folders"
  }
  foreach ($requiredDriveHubOpenToken in @("PathIsInsideOrSame(item.Value, target)", "MakeRelative(item.Value, target)", "controller.ResolveDriveHubPathForLocalPath(item.LocalPath)")) {
    if (-not $desktopTrayIntegrationText.Contains($requiredDriveHubOpenToken)) {
      throw "FileInNOutDesktopTray.cs does not reveal nested search/open results through the drive hub: $requiredDriveHubOpenToken"
    }
  }
  foreach ($requiredKoreanTrayLabelToken in @('\uACF5\uC720\uBC1B\uC740 FileInNOut \uB3D9\uAE30\uD654 \uD3F4\uB354', '\uD3F4\uB354 -> \uD074\uB77C\uC6B0\uB4DC', '\uD074\uB77C\uC6B0\uB4DC -> \uD3F4\uB354', '\uC591\uBC29\uD5A5', '\uC131\uACF5', '\uC2E4\uD328', '\uBCC0\uACBD \uC5C6\uC74C', 'ToggleAutoSyncKorean', 'LoginKorean', 'LogoutKorean', 'SaveFolderProfileKorean', 'ShareFolderKorean', 'SyncNowKorean', 'BuildMenuKorean', 'BuildStorageSummary', 'BuildStatusText', 'TranslateCommandOutputKorean', 'DesktopSettingsDialogText', 'BrowseFolderDescription')) {
    if (-not $desktopTrayIntegrationText.Contains($requiredKoreanTrayLabelToken)) {
      throw "FileInNOutDesktopTray.cs is missing Korean tray/Explorer labels: $requiredKoreanTrayLabelToken"
    }
  }
  if (-not $desktopTrayIntegrationText.Contains("DesktopDriveHubLinks.Build(config, myDriveHubPath, sharedDriveHubPath)")) {
    throw "FileInNOutDesktopTray.cs does not share drive-hub link resolution between mapping and folder opening"
  }
  foreach ($requiredImmediateHubRefreshToken in @("public void AcceptPendingShare", "UpdateSettingsForm(true)", "public void RemoveFolderProfile", "RefreshWatchers();")) {
    if (-not $desktopTrayIntegrationText.Contains($requiredImmediateHubRefreshToken)) {
      throw "FileInNOutDesktopTray.cs does not immediately refresh hubs/watchers after share or folder changes: $requiredImmediateHubRefreshToken"
    }
  }
  foreach ($requiredTargetedWatcherToken in @("pendingChangePaths", "SyncPendingChanges", "RunSyncCommand", "BuildTargetSyncPaths", "ResolvePendingChangeSyncTarget", "PathIsInsideOrSame", "FirstChildPathUnder", "RunTargetedSyncCommands", "sync-target --target", "fallback sync-configured")) {
    if (-not $desktopTrayIntegrationText.Contains($requiredTargetedWatcherToken)) {
      throw "FileInNOutDesktopTray.cs does not target automatic watcher syncs to changed paths: $requiredTargetedWatcherToken"
    }
  }
  foreach ($requiredWatcherRecoveryToken in @("watcher.InternalBufferSize = 64 * 1024", "watcher.Error += watcherError", "QueueFullSyncAfterWatcherError", "pendingChangePaths.Clear()", "\uBCC0\uACBD \uAC10\uC9C0 \uC7AC\uC2A4\uCE94 \uC608\uC57D")) {
    if (-not $desktopTrayIntegrationText.Contains($requiredWatcherRecoveryToken)) {
      throw "FileInNOutDesktopTray.cs does not recover from FileSystemWatcher overflow/errors with a full sync: $requiredWatcherRecoveryToken"
    }
  }
  if (-not ($desktopTrayIntegrationText.Contains("if (SamePath(linkPath, targetFolder))") -or $desktopTrayIntegrationText.Contains("if (DesktopPathRules.SamePath(linkPath, targetFolder))"))) {
    throw "desktop tray integration does not guard against self-referential drive hub junctions"
  }
  if ($desktopPythonText.Contains("received shared folders cannot be re-shared") -or $desktopPythonText.Contains("Shared/* paths are received shares")) {
    throw "fileinnout_desktop.py still blocks re-sharing received shared folders"
  }
  if (-not $desktopPythonText.Contains("build_remote_tree(api, include_shared=True)")) {
    throw "desktop Python modules do not include received shares when sharing paths"
  }
  foreach ($requiredLocalPermissionToken in @("make_file_readonly", "make_file_writable", "apply_shared_readonly_attributes", "should_apply_local_readonly", "is_non_uploadable_shared_file", "remove_unauthorized_local_shared_file", "stat.S_IWRITE")) {
    if (-not $desktopPythonText.Contains($requiredLocalPermissionToken)) {
      throw "fileinnout_desktop.py does not apply shared permissions to local read-only file attributes: $requiredLocalPermissionToken"
    }
  }
  foreach ($requiredLocalSignatureToken in @("mtimeMs", "st_mtime_ns", "local_signature_matches")) {
    if (-not $desktopPythonText.Contains($requiredLocalSignatureToken)) {
      throw "desktop Python modules do not track local file changes with sub-second precision: $requiredLocalSignatureToken"
    }
  }
  foreach ($requiredSharedOwnerWebToken in @("shared_drive_owner_for_target", 'query["desktopPath"] = f"{SHARED_ROOT_NAME}/{shared_owner}"')) {
    if (-not $desktopPythonText.Contains($requiredSharedOwnerWebToken)) {
      throw "desktop Python modules do not open shared owner hub folders with a Shared/owner desktopPath: $requiredSharedOwnerWebToken"
    }
  }
  if (-not $installScriptText.Contains('$resolvedMapped.Equals($resolvedRoot')) {
    throw "install-windows.ps1 context drive action does not verify the mapped drive target before opening it"
  }
  if (-not $installScriptText.Contains("sync-target --target")) {
    throw "install-windows.ps1 context sync action does not pass the selected target to the desktop CLI"
  }
  foreach ($requiredSyncContextFeedbackToken in @('context-sync-result.txt', 'FILEINNOUT_SYNC_RESULT', 'FILEINNOUT_SYNC_EXIT', 'RmlsZUluTk91dCDrj5nquLDtmZQ=', '64+Z6riw7ZmUIOyZhOujjA==', '64+Z6riw7ZmUIOyLpO2MqA==')) {
    if (-not $installScriptText.Contains($requiredSyncContextFeedbackToken)) {
      throw "install-windows.ps1 context sync action does not show manual sync result feedback: $requiredSyncContextFeedbackToken"
    }
  }
  if (-not $installScriptText.Contains("open-web --target")) {
    throw "install-windows.ps1 context web action does not pass the selected target to the desktop CLI"
  }
  if (-not $installScriptText.Contains("setlocal EnableExtensions EnableDelayedExpansion")) {
    throw "install-windows.ps1 context menu runner does not enable delayed variable expansion"
  }
  foreach ($requiredContextFeedbackToken in @('66eB7YGs6rCAIO2BtOumveuztOuTnOyXkCDrs7XsgqzrkJjsl4jsirXri4jri6Qu', '6rO17JygIOyZhOujjA==', '64+Z6riw7ZmUIO2PtOuNlCDstpTqsIAg7JmE66OM', 'RmlsZUluTk91dCDrj5nquLDtmZQg7IOB7YOc')) {
    if (-not $installScriptText.Contains($requiredContextFeedbackToken)) {
      throw "install-windows.ps1 context menu feedback is not localized or complete: $requiredContextFeedbackToken"
    }
  }
  foreach ($requiredStatusContextToken in @('ActionKey "status"', 'doctor-target --target "%TARGET%" --local-only', 'context-status.txt', 'RmlsZUluTk91dCDrj5nquLDtmZQg7IOB7YOc')) {
    if (-not $installScriptText.Contains($requiredStatusContextToken)) {
      throw "install-windows.ps1 context status action is incomplete: $requiredStatusContextToken"
    }
  }
  foreach ($requiredCopyLinkContextToken in @('ActionKey "copy-link"', 'open-web --target "%TARGET%" --print-only', 'Set-Clipboard -Value $text', 'context-link.txt')) {
    if (-not $installScriptText.Contains($requiredCopyLinkContextToken)) {
      throw "install-windows.ps1 context copy-link action is incomplete: $requiredCopyLinkContextToken"
    }
  }
  foreach ($requiredShareContextToken in @('ActionKey "share"', 'share-target --target', 'context-share.txt', 'context-share-result.txt', 'Set-Clipboard -Value $address', 'share address:')) {
    if (-not $installScriptText.Contains($requiredShareContextToken)) {
      throw "install-windows.ps1 context share action is incomplete: $requiredShareContextToken"
    }
  }
  foreach ($requiredSharedAddressToken in @("SHARE_URL_SCHEME", "build_share_address", "parse_share_address", "connect_shared_folder_from_address", "open-address", "share-address")) {
    if (-not $desktopPythonText.Contains($requiredSharedAddressToken)) {
      throw "desktop Python modules are missing shared-folder address support: $requiredSharedAddressToken"
    }
  }
  foreach ($requiredSharedAddressInstallToken in @("Register-FileInNOutUrlProtocol", "HKCU:\Software\Classes\fileinnout", "open-address --address")) {
    if (-not $installScriptText.Contains($requiredSharedAddressInstallToken)) {
      throw "install-windows.ps1 is missing FileInNOut URL protocol support: $requiredSharedAddressInstallToken"
    }
  }
  foreach ($requiredTraySharedAddressToken in @("OpenSharedAddress", "sharedAddressText", "open-address --address", "\uC8FC\uC18C \uC5F4\uAE30")) {
    if (-not $desktopTrayIntegrationText.Contains($requiredTraySharedAddressToken)) {
      throw "FileInNOutDesktopTray.cs is missing shared address UI support: $requiredTraySharedAddressToken"
    }
  }
  foreach ($requiredAddSyncFolderContextToken in @('ActionKey "add-sync-folder"', 'add-sync-folder --target', 'context-add-sync-folder.txt')) {
    if (-not $installScriptText.Contains($requiredAddSyncFolderContextToken)) {
      throw "install-windows.ps1 context add-sync-folder action is incomplete: $requiredAddSyncFolderContextToken"
    }
  }
  foreach ($requiredDriveTargetToken in @("drive_letter_target_to_drive_root", "logical_desktop_target_path", "drive_hub_profile_for_target", "drive_hub_profile_links", "drive_hub_scope_profiles_for_target", "enabled_sync_folders")) {
    if (-not $desktopPythonText.Contains($requiredDriveTargetToken)) {
      throw "desktop Python modules do not resolve mapped drive hub targets for Explorer context menu actions: $requiredDriveTargetToken"
    }
  }
  foreach ($requiredDriveDoctorToken in @("drive_hub_expected_links", "drive_hub_missing_links", "drive_hub_link_conflicts", "drive_hub_sync_error", "drive_hub_pending_changes", "drive_hub_consistent", "drive_root_needs_attention", "drive_root_pending_adoption", "local_pending_change_count", "syncActivity")) {
    if (-not $desktopPythonText.Contains($requiredDriveDoctorToken)) {
      throw "fileinnout_desktop.py does not expose drive hub sync health in doctor output: $requiredDriveDoctorToken"
    }
  }

  $frontendBaseFileView = Join-Path (Split-Path -Parent $scriptDir) "frontend\src\components\BaseFileView.vue"
  if (Test-Path -LiteralPath $frontendBaseFileView) {
    $baseFileViewText = Get-Content -Raw -Path $frontendBaseFileView
    if (-not $baseFileViewText.Contains("desktopQueryTerm") -or -not $baseFileViewText.Contains("navigateToDesktopPath")) {
      throw "BaseFileView.vue does not consume desktopPath query links from the desktop app"
    }
    if (-not $baseFileViewText.Contains("props.showFolderNavigation && !props.sharedLibrary")) {
      throw "BaseFileView.vue does not allow desktopPath query links to filter the shared library"
    }
    if (-not $baseFileViewText.Contains("selectedIds.value = [String(result.target.id)]")) {
      throw "BaseFileView.vue does not auto-select the file or folder opened from a desktopPath link"
    }
    $fileStoreText = Get-Content -Raw -Path (Join-Path (Split-Path -Parent $scriptDir) "frontend\src\stores\useFileStore.js")
    if (-not $fileStoreText.Contains("navigateToDesktopPath") -or -not $fileStoreText.Contains("resolvePathRecord")) {
      throw "useFileStore.js does not resolve desktopPath query links to drive folders"
    }
    foreach ($requiredSharedPathToken in @("decorateSharedPaths", "sharedPathSegments", "resolveSharedPathRecord", "navigateToSharedDesktopPath")) {
      if (-not $fileStoreText.Contains($requiredSharedPathToken)) {
        throw "useFileStore.js does not resolve shared desktopPath links accurately: $requiredSharedPathToken"
      }
    }
    if (-not $fileStoreText.Contains("target.sharedPath || target.desktopPath")) {
      throw "useFileStore.js resolves shared desktopPath links but does not filter by the exact shared path"
    }
  }
  if (-not $installScriptText.Contains('HKCU:\Software\Classes\*\shell\FileInNOut')) {
    throw "install-windows.ps1 does not register the FileInNOut context menu for file right-clicks"
  }
  if (-not $installScriptText.Contains('Set-FileInNOutRegistryValue')) {
    throw "install-windows.ps1 does not use literal registry writes for wildcard context menu paths"
  }
  foreach ($requiredInstallBrandingToken in @("Set-Content -Encoding Unicode", 'IconFile=$IconPath', 'IconIndex=0', '$safeDisplayName', '$safeInfoTip', 'RmlsZUluTk91dCDrk5zrnbzsnbTruIwgLSDrgrQg65Oc65287J2067iM7JmAIOqzteycoCDrrLjshJztlag=')) {
    if (-not $installScriptText.Contains($requiredInstallBrandingToken)) {
      throw "install-windows.ps1 does not write role-specific Explorer desktop.ini metadata: $requiredInstallBrandingToken"
    }
  }

  $desktopPythonCompileTargets = @(
    (Join-Path $tempRoot "fileinnout_desktop.py")
    (Join-Path $tempRoot "fileinnout_desktop_constants.py")
    (Join-Path $tempRoot "fileinnout_desktop_models.py")
    (Join-Path $tempRoot "fileinnout_desktop_api.py")
    (Join-Path $tempRoot "fileinnout_desktop_paths.py")
    (Join-Path $tempRoot "fileinnout_desktop_security.py")
    (Join-Path $tempRoot "fileinnout_desktop_windows.py")
    (Join-Path $tempRoot "fileinnout_desktop_state.py")
    (Join-Path $tempRoot "fileinnout_desktop_config.py")
    (Join-Path $tempRoot "fileinnout_desktop_files.py")
    (Join-Path $tempRoot "fileinnout_desktop_remote.py")
    (Join-Path $tempRoot "fileinnout_desktop_web.py")
    (Join-Path $tempRoot "fileinnout_desktop_drive.py")
    (Join-Path $tempRoot "fileinnout_desktop_drive_hub.py")
    (Join-Path $tempRoot "fileinnout_desktop_profiles.py")
    (Join-Path $tempRoot "fileinnout_desktop_diagnostics.py")
    (Join-Path $tempRoot "fileinnout_desktop_sharing.py")
    (Join-Path $tempRoot "fileinnout_desktop_sync.py")
    (Join-Path $tempRoot "fileinnout_desktop_parser.py")
    (Join-Path $tempRoot "fileinnout_desktop_account_commands.py")
    (Join-Path $tempRoot "fileinnout_desktop_status_commands.py")
    (Join-Path $tempRoot "fileinnout_desktop_share_commands.py")
    (Join-Path $tempRoot "fileinnout_desktop_sync_local.py")
    (Join-Path $tempRoot "fileinnout_desktop_sync_shared.py")
    (Join-Path $tempRoot "fileinnout_desktop_sync_moves.py")
    (Join-Path $tempRoot "fileinnout_desktop_drive_adoption.py")
  )
  if ($PythonPath) {
    if (-not (Test-Path $PythonPath)) {
      throw "PythonPath does not exist: $PythonPath"
    }
    & $PythonPath -m py_compile $desktopPythonCompileTargets
  } elseif (Get-Command py -ErrorAction SilentlyContinue) {
    & py -3 -m py_compile $desktopPythonCompileTargets
  } else {
    $python = Get-Command python -ErrorAction SilentlyContinue
    if (-not $python) {
      throw "Python 3 was not found for package verification."
    }
    & python -m py_compile $desktopPythonCompileTargets
  }
  if ($LASTEXITCODE -ne 0) {
    throw "desktop Python modules did not compile"
  }

  $installVerifyArgs = @(
    "-ExecutionPolicy", "Bypass",
    "-File", (Join-Path $tempRoot "verify_windows_install.ps1"),
    "-SourceDir", $tempRoot
  )
  if ($PythonPath) {
    $installVerifyArgs += @("-PythonPath", $PythonPath)
  }
  & powershell @installVerifyArgs
  if ($LASTEXITCODE -ne 0) {
    throw "verify_windows_install.ps1 failed"
  }

  Write-Host "Package verification passed: $PackagePath"
} finally {
  if (Test-Path $tempRoot) {
    Remove-Item -LiteralPath $tempRoot -Recurse -Force
  }
}
