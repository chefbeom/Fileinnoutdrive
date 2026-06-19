param(
  [string]$PackagePath = "",
  [string]$PythonPath = ""
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $PackagePath) {
  $candidate = Get-ChildItem -Path (Join-Path $scriptDir "dist") -Filter "FileInNOutDesktop-*.zip" -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1
  if (-not $candidate) {
    throw "No package zip found. Run package-windows.ps1 first or pass -PackagePath."
  }
  $PackagePath = $candidate.FullName
}

if (-not (Test-Path $PackagePath)) {
  throw "Package does not exist: $PackagePath"
}

$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("FileInNOutDesktopPackageVerify-" + [System.Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Force -Path $tempRoot | Out-Null

try {
  Expand-Archive -Path $PackagePath -DestinationPath $tempRoot -Force

  $required = @(
    "fileinnout_desktop.py",
    "fileinnout_desktop_constants.py",
    "fileinnout_desktop_models.py",
    "FileInNOutDesktop.exe",
    "FileInNOutDesktop.ico",
    "FileInNOutDesktopTray.cs",
    "DesktopModels.cs",
    "install-windows.ps1",
    "uninstall-windows.ps1",
    "verify_windows_install.ps1",
    "README.md",
    "manifest.json"
  )

  foreach ($name in $required) {
    $path = Join-Path $tempRoot $name
    if (-not (Test-Path $path)) {
      throw "Package is missing required file: $name"
    }
  }

  $manifest = Get-Content -Raw -Path (Join-Path $tempRoot "manifest.json") | ConvertFrom-Json
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

    $entryPath = Join-Path $tempRoot $relativePath
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

  foreach ($name in $required | Where-Object { $_ -ne "manifest.json" }) {
    if (-not $manifestPaths.ContainsKey($name)) {
      throw "Required file is not listed in manifest checksums: $name"
    }
  }

  $traySourcePath = Join-Path $tempRoot "FileInNOutDesktopTray.cs"
  $traySourceText = [System.Text.Encoding]::UTF8.GetString([System.IO.File]::ReadAllBytes($traySourcePath))
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
  foreach ($term in $expectedKoreanTerms) {
    if (-not $traySourceText.Contains($term)) {
      throw "FileInNOutDesktopTray.cs lost expected UTF-8 Korean UI text: $term"
    }
  }
  if (-not $traySourceText.Contains("AddWatcher(Path.Combine(driveRootPath, MyDriveHubName), false)")) {
    throw "FileInNOutDesktopTray.cs does not watch the My Drive hub for folder adoption"
  }
  if (-not $traySourceText.Contains("AddWatcher(Path.Combine(driveRootPath, SharedDriveHubName), false)")) {
    throw "FileInNOutDesktopTray.cs does not watch the shared hub for drive-root changes"
  }
  if (-not $traySourceText.Contains("AddSharedOwnerDriveHubWatchers(config)")) {
    throw "FileInNOutDesktopTray.cs does not watch shared owner hub folders for Google Drive style shared-folder changes"
  }
  foreach ($requiredStartupSyncToken in @("initialSyncTimer", "initialSyncTimer.Interval = 3000", "initialSyncTimer.Start()", "initialSyncTimer.Stop()", "SyncNow(false)")) {
    if (-not $traySourceText.Contains($requiredStartupSyncToken)) {
      throw "FileInNOutDesktopTray.cs does not run a quiet startup sync scan: $requiredStartupSyncToken"
    }
  }
  foreach ($requiredExplorerBrandingToken in @("ExplorerDisplayNameForFolder", "ExplorerInfoTipForFolder", "ExplorerStatusInfoTipForFolder", "RefreshExplorerStatusHints", "SafeDesktopIniValue", "Encoding.Unicode", "IconFile=", "DriveRootExplorerInfoTip", "SharedDriveExplorerInfoTip")) {
    if (-not $traySourceText.Contains($requiredExplorerBrandingToken)) {
      throw "FileInNOutDesktopTray.cs does not write role-specific Explorer desktop.ini metadata: $requiredExplorerBrandingToken"
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
    if (-not $traySourceText.Contains($requiredPauseControlToken)) {
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
    if (-not $traySourceText.Contains($requiredActivityUiToken)) {
      throw "FileInNOutDesktopTray.cs does not show real recent sync activity: $requiredActivityUiToken"
    }
  }
  foreach ($requiredFolderStatusToken in @("FolderStatusLabel", "FolderPermissionLabel", "NormalizePermission", "PermissionLabel", "permission", "CountPendingLocalChanges", "LocalSignatureMatches", "FileMtimeMilliseconds", "mtimeMs", "RefreshFolderStatuses")) {
    if (-not $traySourceText.Contains($requiredFolderStatusToken)) {
      throw "FileInNOutDesktopTray.cs does not expose per-folder sync status/permissions in the sync folder list: $requiredFolderStatusToken"
    }
  }
  foreach ($requiredSyncIssueToken in @("ListSyncIssues", "IsConflictCopyPath", "SkippedDirtyCount", "conflict ")) {
    if (-not $traySourceText.Contains($requiredSyncIssueToken)) {
      throw "FileInNOutDesktopTray.cs does not surface sync issues and conflict copies in the activity list: $requiredSyncIssueToken"
    }
  }
  foreach ($requiredSearchUiToken in @("SearchLocalFiles", "SearchFiles", "SearchCloudFiles", "SearchResultItem", "OpenSelectedSearchResult", "EnumerateSearchablePaths", "/select,", "search --query", "WebUrl")) {
    if (-not $traySourceText.Contains($requiredSearchUiToken)) {
      throw "FileInNOutDesktopTray.cs does not expose desktop file search results: $requiredSearchUiToken"
    }
  }

  $desktopClientText = [System.Text.Encoding]::UTF8.GetString(
    [System.IO.File]::ReadAllBytes((Join-Path $tempRoot "fileinnout_desktop.py"))
  )
  foreach ($requiredDesktopToken in @("MY_DRIVE_HUB_NAME", "SHARED_DRIVE_HUB_NAME", "ROOT_FILE_SYNC_FOLDER_NAME", "ensure_drive_root_hubs", "iter_drive_root_owned_candidates", "ensure_drive_root_file_profile", "ensure_configured_drive_mapping", "sync_drive_hub_links", "drive_hub_link_targets", "create_directory_junction", "remove_stale_drive_hub_links", "remove_empty_hub_conflict_directory", "hub_link_conflicts", "legacy_sync_folder_profile", "prepare_local_drive_config", "drive_letter_candidates", "drive_mapping_supported")) {
    if (-not $desktopClientText.Contains($requiredDesktopToken)) {
      throw "fileinnout_desktop.py is missing drive hub adoption code: $requiredDesktopToken"
    }
  }
  foreach ($requiredNetworkRetryToken in @("GET_RETRY_ATTEMPTS", "http.client.IncompleteRead", "http.client.RemoteDisconnected", "method_name == `"GET`"", "time.sleep(0.5 * (attempt + 1))")) {
    if (-not $desktopClientText.Contains($requiredNetworkRetryToken)) {
      throw "fileinnout_desktop.py is missing transient GET/download retry handling: $requiredNetworkRetryToken"
    }
  }
  foreach ($requiredDownloadFailureToken in @("failed_downloads", "except DesktopError:", "failed_downloads.add(local_rel)", "if rel not in failed_downloads", "download_failed", '"downloadFailed"', "stats.download_failed += 1")) {
    if (-not $desktopClientText.Contains($requiredDownloadFailureToken)) {
      throw "fileinnout_desktop.py does not keep sync running after a per-file download failure: $requiredDownloadFailureToken"
    }
  }
  foreach ($requiredDownloadIssueToken in @("DownloadFailedCount", '"downloadFailed"', "download_failed=", "\uB2E4\uC6B4\uB85C\uB4DC \uC2E4\uD328")) {
    if (-not $traySourceText.Contains($requiredDownloadIssueToken) -and -not $desktopClientText.Contains($requiredDownloadIssueToken)) {
      throw "desktop client does not surface per-file download failures separately: $requiredDownloadIssueToken"
    }
  }
  foreach ($requiredFolderPriorityToken in @("int downloadFailed = DownloadFailedCount(syncStatus)", "return `"\uB2E4\uC6B4\uB85C\uB4DC \uC2E4\uD328 `" + downloadFailed.ToString()", "int skipped = SkippedDirtyCount(syncStatus)", "return `"\uCDA9\uB3CC \uD655\uC778 `" + skipped.ToString()")) {
    if (-not $traySourceText.Contains($requiredFolderPriorityToken)) {
      throw "FileInNOutDesktopTray.cs does not prioritize actionable sync issues in folder status labels: $requiredFolderPriorityToken"
    }
  }
  foreach ($requiredSharedProfileToken in @("permission = str((item or {}).get(`"permission`")", "`"permission`": permission")) {
    if (-not $desktopClientText.Contains($requiredSharedProfileToken)) {
      throw "fileinnout_desktop.py does not preserve shared profile permissions: $requiredSharedProfileToken"
    }
  }
  foreach ($requiredTargetSyncToken in @("cmd_sync_target", "cmd_doctor_target", "cmd_share_target", "cmd_add_sync_folder", "add_or_update_sync_folder_profile", "target_sync_profiles", "doctor-target", "share-target", "add-sync-folder", "configured_sync_folders_for_target", "desktop_target_cloud_path", "target_is_drive_root_path", "target_is_shared_drive_hub_path", "target_drive_hub_route", "drive_hub_scope_profiles_for_target", "resolve_adopted_drive_root_target", "first_owned_sync_profile", "prepare_local_drive_config(config)", "owned_profiles", "shared_profiles", "cmd_open_web", "cmd_search", "desktop_web_url", "desktop_web_url_for_cloud_path", "/main/shareFile")) {
    if (-not $desktopClientText.Contains($requiredTargetSyncToken)) {
      throw "fileinnout_desktop.py is missing context target sync code: $requiredTargetSyncToken"
    }
  }
  foreach ($requiredMoveToken in @("move_file", "rename_file", "apply_scoped_file_moves", "protected_files", "replaceFileId")) {
    if (-not $desktopClientText.Contains($requiredMoveToken)) {
      throw "fileinnout_desktop.py is missing remote-preserving local move/rename sync code: $requiredMoveToken"
    }
  }
  foreach ($requiredFolderMoveToken in @("apply_scoped_folder_moves", "folder_tree_shape_matches", "protected_folders", "remap_remote_paths_prefix", "remote_folder_tree_matches_state")) {
    if (-not $desktopClientText.Contains($requiredFolderMoveToken)) {
      throw "fileinnout_desktop.py is missing remote-preserving local folder move/rename sync code: $requiredFolderMoveToken"
    }
  }
  foreach ($requiredRemoteMoveToken in @("apply_remote_path_moves", "remap_state_path_prefix", "local_tree_clean")) {
    if (-not $desktopClientText.Contains($requiredRemoteMoveToken)) {
      throw "fileinnout_desktop.py is missing local-preserving remote move/rename pull code: $requiredRemoteMoveToken"
    }
  }

  $parseErrors = $null
  [System.Management.Automation.PSParser]::Tokenize(
    (Get-Content -Raw -Path (Join-Path $tempRoot "install-windows.ps1")),
    [ref]$parseErrors
  ) | Out-Null
  [System.Management.Automation.PSParser]::Tokenize(
    (Get-Content -Raw -Path (Join-Path $tempRoot "uninstall-windows.ps1")),
    [ref]$parseErrors
  ) | Out-Null
  if ($parseErrors.Count) {
    $parseErrors | Format-Table -AutoSize | Out-String
    throw "install-windows.ps1 or uninstall-windows.ps1 has PowerShell parser errors"
  }
  $installScriptText = Get-Content -Raw -Path (Join-Path $tempRoot "install-windows.ps1")
  if (-not $installScriptText.Contains("Remove-FileInNOutLegacyDriveJunction -RootPath `$driveRootDir -LinkName `$driveLinkName")) {
    throw "install-windows.ps1 does not remove legacy root-level drive links during hub migration"
  }
  foreach ($requiredSharedOwnerHubToken in @("Get-FileInNOutSharedOwnerLinkName", "Get-FileInNOutSharedFolderLinkName", "SharedDriveLinkName", "SharedRemoteOwner")) {
    if (-not ($installScriptText.Contains($requiredSharedOwnerHubToken) -or $traySourceText.Contains($requiredSharedOwnerHubToken))) {
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
    if (-not $traySourceText.Contains($requiredGreenDesignToken)) {
      throw "FileInNOutDesktopTray.cs is missing the green desktop design token: $requiredGreenDesignToken"
    }
  }
  $readmeText = Get-Content -Raw -Path (Join-Path $tempRoot "README.md")
  foreach ($requiredGreenReadmeToken in @("green folder icon", "clean green FileInNOut login screen")) {
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
    if (-not ($traySourceText.Contains($requiredHubConflictRepairToken) -or $installScriptText.Contains($requiredHubConflictRepairToken))) {
      throw "desktop installer/tray does not repair empty folder conflicts at drive hub link paths: $requiredHubConflictRepairToken"
    }
  }
  foreach ($requiredSharedOwnerBrandingToken in @("ApplySharedOwnerFolderBranding", "SharedDriveOwnerExplorerInfoTip", "sharedOwnerInfoTip", "brandedSharedOwnerDirs", "PruneEmptySharedOwnerFolders", "OwnerFolderHasUserContent")) {
    if (-not ($traySourceText.Contains($requiredSharedOwnerBrandingToken) -or $installScriptText.Contains($requiredSharedOwnerBrandingToken))) {
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
  if (-not $traySourceText.Contains("DriveLetterCandidates")) {
    throw "FileInNOutDesktopTray.cs does not try fallback drive letters when remapping the drive"
  }
  if (-not $traySourceText.Contains("string mappedTarget = CurrentSubstTarget(driveLetter)")) {
    throw "FileInNOutDesktopTray.cs does not verify the mapped drive target before opening the drive"
  }
  foreach ($requiredDynamicOpenDriveToken in @("ExplorerDriveLauncher", "--open-drive", "EnsureDriveMapping(driveLetter, driveRoot)", "DriveLetterCandidates(letter)", "SaveDriveLetter(configPath, configValues, driveRoot, mappedLetter)", "EnsureDriveRootLayout", "SyncDriveHubLinks(iconPath, myDriveHub, sharedDriveHub, LoadConfiguredSyncFolders(configValues, defaultSyncDir))", "defaultFolder.RemotePath = NormalizeRemotePathForFolder(`"`", syncDir)", "EnsureDriveHubJunction(item.Key, item.Value)", "ApplyExplorerFolderBranding(driveRoot", "RegisterDriveAppearance(installDir, mappedLetter)", "Open FileInNOut Drive.lnk", "Open FileInNOut Folder.lnk")) {
    if (-not ($traySourceText.Contains($requiredDynamicOpenDriveToken) -or $installScriptText.Contains($requiredDynamicOpenDriveToken))) {
      throw "desktop installer/tray does not open the current FileInNOut drive dynamically: $requiredDynamicOpenDriveToken"
    }
  }
  if (-not $traySourceText.Contains("ResolveDriveHubPathForLocalPath")) {
    throw "FileInNOutDesktopTray.cs does not prefer drive-hub paths when opening configured folders"
  }
  foreach ($requiredDriveHubOpenToken in @("PathIsInsideOrSame(item.Value, target)", "MakeRelative(item.Value, target)", "controller.ResolveDriveHubPathForLocalPath(item.LocalPath)")) {
    if (-not $traySourceText.Contains($requiredDriveHubOpenToken)) {
      throw "FileInNOutDesktopTray.cs does not reveal nested search/open results through the drive hub: $requiredDriveHubOpenToken"
    }
  }
  foreach ($requiredKoreanTrayLabelToken in @('\uACF5\uC720\uBC1B\uC740 FileInNOut \uB3D9\uAE30\uD654 \uD3F4\uB354', '\uD3F4\uB354 -> \uD074\uB77C\uC6B0\uB4DC', '\uD074\uB77C\uC6B0\uB4DC -> \uD3F4\uB354', '\uC591\uBC29\uD5A5', '\uC131\uACF5', '\uC2E4\uD328', '\uBCC0\uACBD \uC5C6\uC74C', 'ToggleAutoSyncKorean', 'LoginKorean', 'LogoutKorean', 'SaveFolderProfileKorean', 'ShareFolderKorean', 'SyncNowKorean', 'BuildMenuKorean', 'ApplyStorageSummaryKorean', 'RefreshStatusKorean', 'TranslateCommandOutputKorean', 'BrowseFolderKorean')) {
    if (-not $traySourceText.Contains($requiredKoreanTrayLabelToken)) {
      throw "FileInNOutDesktopTray.cs is missing Korean tray/Explorer labels: $requiredKoreanTrayLabelToken"
    }
  }
  if (-not $traySourceText.Contains("BuildDriveHubLinks(config, myDriveHubPath, sharedDriveHubPath)")) {
    throw "FileInNOutDesktopTray.cs does not share drive-hub link resolution between mapping and folder opening"
  }
  foreach ($requiredImmediateHubRefreshToken in @("public void AcceptPendingShare", "UpdateSettingsForm(true)", "public void RemoveFolderProfile", "RefreshWatchers();")) {
    if (-not $traySourceText.Contains($requiredImmediateHubRefreshToken)) {
      throw "FileInNOutDesktopTray.cs does not immediately refresh hubs/watchers after share or folder changes: $requiredImmediateHubRefreshToken"
    }
  }
  foreach ($requiredTargetedWatcherToken in @("pendingChangePaths", "SyncPendingChanges", "RunSyncCommand", "BuildTargetSyncPaths", "ResolvePendingChangeSyncTarget", "PathIsInsideOrSame", "FirstChildPathUnder", "RunTargetedSyncCommands", "sync-target --target", "fallback sync-configured")) {
    if (-not $traySourceText.Contains($requiredTargetedWatcherToken)) {
      throw "FileInNOutDesktopTray.cs does not target automatic watcher syncs to changed paths: $requiredTargetedWatcherToken"
    }
  }
  foreach ($requiredWatcherRecoveryToken in @("watcher.InternalBufferSize = 64 * 1024", "watcher.Error += watcherError", "QueueFullSyncAfterWatcherError", "pendingChangePaths.Clear()", "\uBCC0\uACBD \uAC10\uC9C0 \uC7AC\uC2A4\uCE94 \uC608\uC57D")) {
    if (-not $traySourceText.Contains($requiredWatcherRecoveryToken)) {
      throw "FileInNOutDesktopTray.cs does not recover from FileSystemWatcher overflow/errors with a full sync: $requiredWatcherRecoveryToken"
    }
  }
  if (-not $traySourceText.Contains("if (SamePath(linkPath, targetFolder))")) {
    throw "FileInNOutDesktopTray.cs does not guard against self-referential drive hub junctions"
  }
  if ($desktopClientText.Contains("received shared folders cannot be re-shared") -or $desktopClientText.Contains("Shared/* paths are received shares")) {
    throw "fileinnout_desktop.py still blocks re-sharing received shared folders"
  }
  if (-not $desktopClientText.Contains("build_remote_tree(api, include_shared=True)")) {
    throw "fileinnout_desktop.py does not include received shares when sharing paths"
  }
  foreach ($requiredLocalPermissionToken in @("make_file_readonly", "make_file_writable", "apply_shared_readonly_attributes", "should_apply_local_readonly", "is_non_uploadable_shared_file", "remove_unauthorized_local_shared_file", "stat.S_IWRITE")) {
    if (-not $desktopClientText.Contains($requiredLocalPermissionToken)) {
      throw "fileinnout_desktop.py does not apply shared permissions to local read-only file attributes: $requiredLocalPermissionToken"
    }
  }
  foreach ($requiredLocalSignatureToken in @("mtimeMs", "st_mtime_ns", "local_signature_matches")) {
    if (-not $desktopClientText.Contains($requiredLocalSignatureToken)) {
      throw "fileinnout_desktop.py does not track local file changes with sub-second precision: $requiredLocalSignatureToken"
    }
  }
  foreach ($requiredSharedOwnerWebToken in @("shared_drive_owner_for_target", 'query["desktopPath"] = f"{SHARED_ROOT_NAME}/{shared_owner}"')) {
    if (-not $desktopClientText.Contains($requiredSharedOwnerWebToken)) {
      throw "fileinnout_desktop.py does not open shared owner hub folders with a Shared/owner desktopPath: $requiredSharedOwnerWebToken"
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
    if (-not $desktopClientText.Contains($requiredSharedAddressToken)) {
      throw "fileinnout_desktop.py is missing shared-folder address support: $requiredSharedAddressToken"
    }
  }
  foreach ($requiredSharedAddressInstallToken in @("Register-FileInNOutUrlProtocol", "HKCU:\Software\Classes\fileinnout", "open-address --address")) {
    if (-not $installScriptText.Contains($requiredSharedAddressInstallToken)) {
      throw "install-windows.ps1 is missing FileInNOut URL protocol support: $requiredSharedAddressInstallToken"
    }
  }
  foreach ($requiredTraySharedAddressToken in @("OpenSharedAddress", "sharedAddressText", "open-address --address", "\uC8FC\uC18C \uC5F4\uAE30")) {
    if (-not $traySourceText.Contains($requiredTraySharedAddressToken)) {
      throw "FileInNOutDesktopTray.cs is missing shared address UI support: $requiredTraySharedAddressToken"
    }
  }
  foreach ($requiredAddSyncFolderContextToken in @('ActionKey "add-sync-folder"', 'add-sync-folder --target', 'context-add-sync-folder.txt')) {
    if (-not $installScriptText.Contains($requiredAddSyncFolderContextToken)) {
      throw "install-windows.ps1 context add-sync-folder action is incomplete: $requiredAddSyncFolderContextToken"
    }
  }
  foreach ($requiredDriveTargetToken in @("drive_letter_target_to_drive_root", "logical_desktop_target_path", "drive_hub_profile_for_target", "drive_hub_profile_links", "drive_hub_scope_profiles_for_target", "enabled_sync_folders")) {
    if (-not $desktopClientText.Contains($requiredDriveTargetToken)) {
      throw "fileinnout_desktop.py does not resolve mapped drive hub targets for Explorer context menu actions: $requiredDriveTargetToken"
    }
  }
  foreach ($requiredDriveDoctorToken in @("drive_hub_expected_links", "drive_hub_missing_links", "drive_hub_link_conflicts", "drive_hub_sync_error", "drive_hub_pending_changes", "drive_hub_consistent", "drive_root_needs_attention", "drive_root_pending_adoption", "local_pending_change_count", "syncActivity")) {
    if (-not $desktopClientText.Contains($requiredDriveDoctorToken)) {
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

  if ($PythonPath) {
    if (-not (Test-Path $PythonPath)) {
      throw "PythonPath does not exist: $PythonPath"
    }
    & $PythonPath -m py_compile (Join-Path $tempRoot "fileinnout_desktop.py")
  } elseif (Get-Command py -ErrorAction SilentlyContinue) {
    & py -3 -m py_compile (Join-Path $tempRoot "fileinnout_desktop.py")
  } else {
    $python = Get-Command python -ErrorAction SilentlyContinue
    if (-not $python) {
      throw "Python 3 was not found for package verification."
    }
    & python -m py_compile (Join-Path $tempRoot "fileinnout_desktop.py")
  }
  if ($LASTEXITCODE -ne 0) {
    throw "fileinnout_desktop.py did not compile"
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
