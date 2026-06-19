param(
  [string]$SourceDir = "$PSScriptRoot",
  [string]$PythonPath = "",
  [switch]$KeepTemp
)

$ErrorActionPreference = "Stop"

$resolvedSource = (Resolve-Path -LiteralPath $SourceDir).Path
$installer = Join-Path $resolvedSource "install-windows.ps1"
$uninstaller = Join-Path $resolvedSource "uninstall-windows.ps1"
if (-not (Test-Path -LiteralPath $installer)) {
  throw "install-windows.ps1 was not found in SourceDir: $resolvedSource"
}
if (-not (Test-Path -LiteralPath $uninstaller)) {
  throw "uninstall-windows.ps1 was not found in SourceDir: $resolvedSource"
}

if ($PythonPath) {
  if (-not (Test-Path -LiteralPath $PythonPath)) {
    throw "PythonPath does not exist: $PythonPath"
  }
  $resolvedPython = (Resolve-Path -LiteralPath $PythonPath).Path
} else {
  $resolvedPython = ""
}

$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("FileInNOutDesktopInstallVerify-" + [System.Guid]::NewGuid().ToString("N"))
$installDir = Join-Path $tempRoot "install"
$syncDir = Join-Path $tempRoot "sync"
$extraSyncDir = Join-Path $tempRoot "projects-sync"
$sharedSyncDir = Join-Path $tempRoot "team-share-sync"
$localAppData = Join-Path $tempRoot "localappdata"
$driveRootDir = Join-Path $localAppData "FileInNOutDesktop\drive-root"
$configPath = Join-Path $localAppData "FileInNOutDesktop\config.json"
$appData = Join-Path $tempRoot "appdata"
$startMenuDir = Join-Path $appData "Microsoft\Windows\Start Menu\Programs\FileInNOut Desktop"
$desktopDir = Join-Path $appData "Desktop"
$desktopShortcut = Join-Path $desktopDir "FileInNOut Desktop.lnk"
$registryKeyName = "FileInNOutDesktopVerify-" + [System.Guid]::NewGuid().ToString("N")
$registryPath = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\$registryKeyName"
$taskName = "FileInNOutDesktopSyncVerify-" + [System.Guid]::NewGuid().ToString("N")
$startupShortcut = Join-Path $appData "Microsoft\Windows\Start Menu\Programs\Startup\$taskName.lnk"
$explorerNamespaceGuid = "{" + [System.Guid]::NewGuid().ToString().ToUpperInvariant() + "}"
$explorerClsidPath = "HKCU:\Software\Classes\CLSID\$explorerNamespaceGuid"
$explorerPropertyBagPath = Join-Path $explorerClsidPath "Instance\InitPropertyBag"
$explorerDesktopNamespacePath = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Desktop\NameSpace\$explorerNamespaceGuid"
$explorerMyComputerNamespacePath = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\MyComputer\NameSpace\$explorerNamespaceGuid"
$hideDesktopIconPath = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\HideDesktopIcons\NewStartPanel"
$urlProtocolPath = "HKCU:\Software\Classes\fileinnout"
$urlProtocolCommandPath = Join-Path $urlProtocolPath "shell\open\command"
$contextMenuPaths = @(
  "HKCU:\Software\Classes\Directory\shell\FileInNOut",
  "HKCU:\Software\Classes\Directory\Background\shell\FileInNOut",
  "HKCU:\Software\Classes\Drive\shell\FileInNOut",
  "HKCU:\Software\Classes\*\shell\FileInNOut"
)

function Test-FreeVerifyDriveLetter {
  param([string]$Letter)

  if (Test-Path -LiteralPath "${Letter}:\") {
    return $false
  }
  if (Get-PSDrive -Name $Letter -PSProvider FileSystem -ErrorAction SilentlyContinue) {
    return $false
  }

  $probeDir = Join-Path $tempRoot "drive-probe-$Letter"
  New-Item -ItemType Directory -Force -Path $probeDir | Out-Null
  $output = & subst "${Letter}:" $probeDir 2>&1
  if ($LASTEXITCODE -ne 0) {
    return $false
  }
  & subst "${Letter}:" /D 2>$null
  return $true
}

function Get-FreeVerifyDriveLetter {
  param([string[]]$Exclude = @())

  foreach ($letter in @("Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z")) {
    if ($Exclude -contains $letter) {
      continue
    }
    if (Test-FreeVerifyDriveLetter $letter) {
      return $letter
    }
  }
  throw "No free drive letter was available for install verification."
}

function Get-FreeVerifyDriveLetterPair {
  foreach ($letter in @("Q", "R", "S", "T", "U", "V", "W", "X", "Y")) {
    $next = [string][char](([int][char]$letter) + 1)
    if (Test-FreeVerifyDriveLetter $letter -and Test-FreeVerifyDriveLetter $next) {
      return @($letter, $next)
    }
  }
  throw "No adjacent free drive letters were available for fallback verification."
}

function Get-SubstTarget {
  param([string]$Letter)

  $output = & subst 2>$null
  foreach ($line in $output) {
    if ($line -match ("^" + [regex]::Escape($Letter) + ":\\: => (.+)$")) {
      return $Matches[1].Trim()
    }
  }
  return ""
}

function ConvertFrom-FileInNOutUtf8Base64 {
  param([string]$Value)
  return [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($Value))
}

function Assert-FileInNOutExplorerBranding {
  param(
    [string]$Folder,
    [string]$DisplayName
  )

  $desktopIniPath = Join-Path $Folder "desktop.ini"
  if (-not (Test-Path -LiteralPath $desktopIniPath)) {
    throw "Explorer folder branding was not created: $desktopIniPath"
  }

  $bytes = [System.IO.File]::ReadAllBytes($desktopIniPath)
  if ($bytes.Length -lt 2 -or $bytes[0] -ne 0xff -or $bytes[1] -ne 0xfe) {
    throw "Explorer folder branding should be written as Unicode desktop.ini: $desktopIniPath"
  }

  $desktopIni = Get-Content -Raw -Encoding Unicode -Path $desktopIniPath
  if (-not $desktopIni.Contains("LocalizedResourceName=$DisplayName")) {
    throw "Explorer folder branding does not set the expected folder name for ${Folder}: $DisplayName"
  }
  if (-not $desktopIni.Contains("InfoTip=")) {
    throw "Explorer folder branding does not set an Explorer info tip: $desktopIniPath"
  }
  if (-not $desktopIni.Contains("FileInNOutDesktop.ico")) {
    throw "Explorer folder branding does not point at the FileInNOut icon"
  }
  if (-not $desktopIni.Contains("IconFile=") -or -not $desktopIni.Contains("IconIndex=0")) {
    throw "Explorer folder branding does not include fallback icon metadata"
  }
}

$driveLetterPair = Get-FreeVerifyDriveLetterPair
$requestedDriveLetter = $driveLetterPair[0]
$driveLetter = $driveLetterPair[1]
$runtimeFallbackDriveLetter = Get-FreeVerifyDriveLetter -Exclude @($requestedDriveLetter, $driveLetter)
$driveRoot = "${driveLetter}:\"
$driveIconPath = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\DriveIcons\$driveLetter"
$runtimeDriveIconPath = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\DriveIcons\$runtimeFallbackDriveLetter"
$occupiedDriveDir = Join-Path $tempRoot "occupied-drive"

$oldLocalAppData = $env:LOCALAPPDATA
$oldAppData = $env:APPDATA
$oldDesktopDir = $env:FILEINNOUT_DESKTOP_DIR

try {
  New-Item -ItemType Directory -Force -Path $localAppData, $appData, $desktopDir | Out-Null
  $env:LOCALAPPDATA = $localAppData
  $env:APPDATA = $appData
  $env:FILEINNOUT_DESKTOP_DIR = $desktopDir
  New-Item -ItemType Directory -Force -Path $driveRootDir, $syncDir, $extraSyncDir, $sharedSyncDir, $occupiedDriveDir, (Split-Path -Parent $configPath) | Out-Null
  $preexistingConfig = [ordered]@{
    syncDir = (Resolve-Path -LiteralPath $syncDir).Path
    syncFolders = @(
      [ordered]@{
        name = "FileInNOut"
        localPath = (Resolve-Path -LiteralPath $syncDir).Path
        remotePath = "FileInNOut"
        direction = "two-way"
        enabled = $true
      },
      [ordered]@{
        name = "Projects"
        localPath = (Resolve-Path -LiteralPath $extraSyncDir).Path
        remotePath = "Projects"
        direction = "two-way"
        enabled = $true
      },
      [ordered]@{
        name = "Team Share"
        localPath = (Resolve-Path -LiteralPath $sharedSyncDir).Path
        remotePath = "Shared/owner@example.com/Team Share"
        direction = "two-way"
        enabled = $true
      }
    )
  }
  $preexistingConfig | ConvertTo-Json -Depth 8 | Set-Content -Encoding UTF8 -Path $configPath
  & subst "${requestedDriveLetter}:" $occupiedDriveDir
  if ($LASTEXITCODE -ne 0) {
    throw "Could not reserve preferred drive letter for fallback verification: ${requestedDriveLetter}:"
  }
  $legacyDriveRootLink = Join-Path $driveRootDir "FileInNOut"
  try {
    New-Item -ItemType Junction -Path $legacyDriveRootLink -Target $syncDir -Force | Out-Null
  } catch {
    & cmd.exe /d /c mklink /J "$legacyDriveRootLink" "$syncDir" | Out-Null
  }
  if (-not (Test-Path -LiteralPath $legacyDriveRootLink)) {
    throw "Could not create legacy root drive link for install migration verification: $legacyDriveRootLink"
  }

  $installArgs = @(
    "-ExecutionPolicy", "Bypass",
    "-File", $installer,
    "-InstallDir", $installDir,
    "-SyncDir", $syncDir,
    "-RegistryKeyName", $registryKeyName,
    "-TaskName", $taskName,
    "-ExplorerNamespaceGuid", $explorerNamespaceGuid,
    "-DriveLetter", $requestedDriveLetter,
    "-InstallStartupTask",
    "-CreateDesktopShortcut"
  )
  if ($resolvedPython) {
    $installArgs += @("-PythonExe", $resolvedPython)
  }

  & powershell @installArgs
  if ($LASTEXITCODE -ne 0) {
    throw "install-windows.ps1 failed with exit code $LASTEXITCODE"
  }

  $cmdPath = Join-Path $installDir "fileinnout-desktop.cmd"
  $trayExePath = Join-Path $installDir "FileInNOutDesktop.exe"
  $trayIconPath = Join-Path $installDir "FileInNOutDesktop.ico"
  $traySourcePath = Join-Path $installDir "FileInNOutDesktopTray.cs"
  $desktopModelsPath = Join-Path $installDir "DesktopModels.cs"
  $watchPath = Join-Path $installDir "fileinnout-watch.cmd"
  $watchHiddenPath = Join-Path $installDir "fileinnout-watch-hidden.vbs"
  $contextPath = Join-Path $installDir "fileinnout-context.cmd"
  $contextHiddenPath = Join-Path $installDir "fileinnout-context-hidden.vbs"
  $clientPath = Join-Path $installDir "fileinnout_desktop.py"
  $clientConstantsPath = Join-Path $installDir "fileinnout_desktop_constants.py"
  $clientModelsPath = Join-Path $installDir "fileinnout_desktop_models.py"
  $uninstallerPath = Join-Path $installDir "uninstall-windows.ps1"

  foreach ($path in @($cmdPath, $trayExePath, $trayIconPath, $traySourcePath, $desktopModelsPath, $watchPath, $watchHiddenPath, $contextPath, $contextHiddenPath, $clientPath, $clientConstantsPath, $clientModelsPath, $uninstallerPath)) {
    if (-not (Test-Path -LiteralPath $path)) {
      throw "Expected installed file is missing: $path"
    }
  }
  $watchContent = Get-Content -Raw -Path $watchPath
  if (-not $watchContent.Contains("watch-configured")) {
    throw "Startup watch command should sync configured folders, not only the legacy single sync directory"
  }
  $contextContent = Get-Content -Raw -Path $contextPath
  if (-not $contextContent.Contains("sync-target --target")) {
    throw "Explorer context menu sync command should sync the selected file or folder target"
  }

  $shortcuts = @(
    (Join-Path $startMenuDir "FileInNOut Desktop.lnk"),
    (Join-Path $startMenuDir "Open FileInNOut Folder.lnk"),
    (Join-Path $startMenuDir "Open FileInNOut Drive.lnk"),
    (Join-Path $startMenuDir "FileInNOut Sync Now.lnk"),
    (Join-Path $startMenuDir "FileInNOut Doctor.lnk"),
    (Join-Path $startMenuDir "Uninstall FileInNOut Desktop.lnk"),
    $desktopShortcut
  )

  foreach ($path in $shortcuts) {
    if (-not (Test-Path -LiteralPath $path)) {
      throw "Expected Start Menu shortcut is missing: $path"
    }
  }

  if (-not (Test-Path -LiteralPath $registryPath)) {
    throw "Expected installed-app registry key is missing: $registryPath"
  }
  $registration = Get-ItemProperty -LiteralPath $registryPath
  if ($registration.DisplayName -ne "FileInNOut Desktop") {
    throw "Unexpected registry DisplayName: $($registration.DisplayName)"
  }
  if ($registration.InstallLocation -ne (Resolve-Path -LiteralPath $installDir).Path) {
    throw "Unexpected registry InstallLocation: $($registration.InstallLocation)"
  }
  if (-not (Test-Path -LiteralPath $urlProtocolPath)) {
    throw "FileInNOut URL protocol registry key is missing: $urlProtocolPath"
  }
  if ($null -eq (Get-Item -LiteralPath $urlProtocolPath).GetValue("URL Protocol", $null)) {
    throw "FileInNOut URL protocol registry key is missing URL Protocol value"
  }
  if (-not (Test-Path -LiteralPath $urlProtocolCommandPath)) {
    throw "FileInNOut URL protocol command is missing: $urlProtocolCommandPath"
  }
  $urlProtocolCommand = (Get-Item -LiteralPath $urlProtocolCommandPath).GetValue("")
  if (-not ([string]$urlProtocolCommand).Contains("open-address --address")) {
    throw "FileInNOut URL protocol does not open shared addresses: $urlProtocolCommand"
  }
  if (-not ([string]$registration.UninstallString).Contains("uninstall-windows.ps1")) {
    throw "Registry UninstallString does not point at uninstall-windows.ps1"
  }
  if (-not ([string]$registration.UninstallString).Contains($taskName)) {
    throw "Registry UninstallString does not include the scheduled task name"
  }
  if (-not ([string]$registration.UninstallString).Contains($explorerNamespaceGuid)) {
    throw "Registry UninstallString does not include the Explorer namespace GUID"
  }
  if (-not ([string]$registration.UninstallString).Contains($driveLetter)) {
    throw "Registry UninstallString does not include the FileInNOut drive letter"
  }
  if (-not ([string]$registration.UninstallString).Contains("DriveRootDir")) {
    throw "Registry UninstallString does not include the FileInNOut drive root"
  }
  if (-not ([string]$registration.DisplayIcon).Contains("FileInNOutDesktop.ico")) {
    throw "Registry DisplayIcon does not point at the blue folder icon"
  }

  $scheduledTask = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
  if ($scheduledTask) {
    $scheduledAction = $scheduledTask.Actions | Select-Object -First 1
    if (-not $scheduledAction -or $scheduledAction.Execute -ne $trayExePath) {
      throw "Unexpected scheduled task action executable for ${taskName}: $($scheduledAction.Execute)"
    }
  } elseif (-not (Test-Path -LiteralPath $startupShortcut)) {
    throw "Expected scheduled task or Startup shortcut is missing: $taskName"
  } else {
    $shell = New-Object -ComObject WScript.Shell
    $shortcut = $shell.CreateShortcut($startupShortcut)
    if ($shortcut.TargetPath -ne $trayExePath) {
      throw "Startup shortcut should launch the tray app: $($shortcut.TargetPath)"
    }
  }

  $shellForShortcut = New-Object -ComObject WScript.Shell
  $desktopShortcutObject = $shellForShortcut.CreateShortcut($desktopShortcut)
  if ($desktopShortcutObject.TargetPath -ne $trayExePath) {
    throw "Desktop shortcut does not launch the tray app: $($desktopShortcutObject.TargetPath)"
  }
  $openFolderShortcut = $shellForShortcut.CreateShortcut((Join-Path $startMenuDir "Open FileInNOut Folder.lnk"))
  if ($openFolderShortcut.TargetPath -ne $trayExePath) {
    throw "Open FileInNOut Folder shortcut should launch the tray open-drive command: $($openFolderShortcut.TargetPath)"
  }
  if ($openFolderShortcut.Arguments -ne "--open-drive") {
    throw "Open FileInNOut Folder shortcut should resolve the current FileInNOut drive dynamically: $($openFolderShortcut.Arguments)"
  }
  $openDriveShortcut = $shellForShortcut.CreateShortcut((Join-Path $startMenuDir "Open FileInNOut Drive.lnk"))
  if ($openDriveShortcut.TargetPath -ne $trayExePath) {
    throw "Open FileInNOut Drive shortcut should launch the tray open-drive command: $($openDriveShortcut.TargetPath)"
  }
  if ($openDriveShortcut.Arguments -ne "--open-drive") {
    throw "Open FileInNOut Drive shortcut should resolve the current FileInNOut drive dynamically: $($openDriveShortcut.Arguments)"
  }
  $syncNowShortcut = $shellForShortcut.CreateShortcut((Join-Path $startMenuDir "FileInNOut Sync Now.lnk"))
  if (-not ([string]$syncNowShortcut.Arguments).Contains("sync-configured")) {
    throw "Sync Now shortcut should sync all configured folders: $($syncNowShortcut.Arguments)"
  }
  $doctorShortcut = $shellForShortcut.CreateShortcut((Join-Path $startMenuDir "FileInNOut Doctor.lnk"))
  if (-not ([string]$doctorShortcut.Arguments).Contains("doctor --local-only") -or ([string]$doctorShortcut.Arguments).Contains("--dir")) {
    throw "Doctor shortcut should diagnose configured folders without a single --dir target: $($doctorShortcut.Arguments)"
  }

  & cmd /c "`"$cmdPath`" --help"
  if ($LASTEXITCODE -ne 0) {
    throw "installed command --help failed with exit code $LASTEXITCODE"
  }

  & cmd /c "`"$cmdPath`" init --dir `"$syncDir`""
  if ($LASTEXITCODE -ne 0) {
    throw "installed command init failed with exit code $LASTEXITCODE"
  }

  & cmd /c "`"$cmdPath`" status --dir `"$syncDir`" --local-only"
  if ($LASTEXITCODE -ne 0) {
    throw "installed command local status failed with exit code $LASTEXITCODE"
  }

  $doctorOutput = & cmd /c "`"$cmdPath`" doctor --local-only" 2>&1
  if ($LASTEXITCODE -ne 0) {
    $doctorOutput | Out-String | Write-Host
    throw "installed command local doctor failed with exit code $LASTEXITCODE"
  }
  $doctorText = $doctorOutput | Out-String
  foreach ($expectedDoctorText in @(
    "drive_root_hub_categories: 2",
    "drive_my_drive_hub_exists: True",
    "drive_shared_hub_exists: True",
    "drive_shared_hub_manual_items: 0"
  )) {
    if (-not $doctorText.Contains($expectedDoctorText)) {
      throw "installed doctor output is missing expected drive hub readiness text: $expectedDoctorText"
    }
  }

  $statePath = Join-Path $syncDir ".fileinnout\state.json"
  if (-not (Test-Path -LiteralPath $statePath)) {
    throw "Sync state was not created: $statePath"
  }

  Assert-FileInNOutExplorerBranding -Folder $syncDir -DisplayName (Split-Path -Leaf $syncDir)
  $folderAttributes = (Get-Item -LiteralPath $syncDir -Force).Attributes
  if (($folderAttributes -band [System.IO.FileAttributes]::System) -eq 0) {
    throw "Sync folder is missing the System attribute required by Explorer desktop.ini customization"
  }

  foreach ($path in @($explorerClsidPath, $explorerDesktopNamespacePath, $explorerMyComputerNamespacePath)) {
    if (-not (Test-Path -LiteralPath $path)) {
      throw "Explorer namespace registry key is missing: $path"
    }
  }
  $explorerRoot = Get-ItemProperty -LiteralPath $explorerClsidPath
  if ($explorerRoot.'System.IsPinnedToNameSpaceTree' -ne 1) {
    throw "Explorer namespace is not pinned to the navigation tree"
  }
  if ($explorerRoot.ThisPCPolicy -ne "Show") {
    throw "Explorer namespace is not configured to show in This PC"
  }
  $explorerBag = Get-ItemProperty -LiteralPath $explorerPropertyBagPath
  if ($explorerBag.TargetFolderPath -ne (Resolve-Path -LiteralPath $driveRootDir).Path) {
    throw "Explorer namespace target mismatch: $($explorerBag.TargetFolderPath)"
  }
  if (-not (Test-Path -LiteralPath $hideDesktopIconPath)) {
    throw "Explorer namespace desktop-hide registry key is missing: $hideDesktopIconPath"
  }
  $hideDesktopIcon = Get-ItemProperty -LiteralPath $hideDesktopIconPath
  $hideProperty = $hideDesktopIcon.PSObject.Properties[$explorerNamespaceGuid]
  if (-not $hideProperty -or $hideProperty.Value -ne 1) {
    throw "Explorer namespace should be hidden on the desktop while staying pinned in Explorer"
  }

  foreach ($path in $contextMenuPaths) {
    if (-not (Test-Path -LiteralPath $path)) {
      throw "Explorer context menu registry key is missing: $path"
    }
    $menu = Get-ItemProperty -LiteralPath $path
    if ($menu.MUIVerb -ne "FileInNOut") {
      throw "Explorer context menu root has unexpected label at ${path}: $($menu.MUIVerb)"
    }
    $expectedContextActions = @{
      sync = (ConvertFrom-FileInNOutUtf8Base64 "7KeA6riIIOuPmeq4sO2ZlA==")
      drive = (ConvertFrom-FileInNOutUtf8Base64 "RmlsZUluTk91dCDrk5zrnbzsnbTruIwg7Je06riw")
      open = (ConvertFrom-FileInNOutUtf8Base64 "642w7Iqk7YGs7YaxIOyVsSDsl7TquLA=")
      web = (ConvertFrom-FileInNOutUtf8Base64 "7Ju57JeQ7IScIOyXtOq4sA==")
      "copy-link" = (ConvertFrom-FileInNOutUtf8Base64 "66eB7YGsIOuzteyCrA==")
      "add-sync-folder" = (ConvertFrom-FileInNOutUtf8Base64 "64+Z6riw7ZmUIO2PtOuNlCDstpTqsIA=")
      status = (ConvertFrom-FileInNOutUtf8Base64 "64+Z6riw7ZmUIOyDge2DnCDtmZXsnbg=")
    }
    foreach ($actionKey in $expectedContextActions.Keys) {
      $actionPath = Join-Path (Join-Path $path "shell") $actionKey
      $commandPath = Join-Path $actionPath "command"
      if (-not (Test-Path -LiteralPath $actionPath)) {
        throw "Explorer context menu action is missing: $actionPath"
      }
      $action = Get-ItemProperty -LiteralPath $actionPath
      if ($action.MUIVerb -ne $expectedContextActions[$actionKey]) {
        throw "Explorer context menu action has unexpected label at ${actionPath}: $($action.MUIVerb)"
      }
      if (-not (Test-Path -LiteralPath $commandPath)) {
        throw "Explorer context menu command is missing: $commandPath"
      }
      $command = (Get-Item -LiteralPath $commandPath).GetValue("")
      $expectedCommandAction = if ($actionKey -eq "open") { "app" } else { $actionKey }
      if (-not ([string]$command).Contains("fileinnout-context-hidden.vbs") -or -not ([string]$command).Contains($expectedCommandAction)) {
        throw "Explorer context menu command is unexpected for ${actionKey}: $command"
      }
    }
  }

  $contextScript = Get-Content -Raw -Path (Join-Path $installDir "fileinnout-context.cmd")
  if (-not $contextScript.Contains('doctor-target --target "%TARGET%" --local-only')) {
    throw "Explorer status context action does not diagnose the selected target"
  }
  if (-not $contextScript.Contains("context-status.txt")) {
    throw "Explorer status context action does not persist status output for troubleshooting"
  }
  if (-not $contextScript.Contains('open-web --target "%TARGET%" --print-only')) {
    throw "Explorer copy-link context action does not resolve the selected target web URL"
  }
  if (-not $contextScript.Contains("Set-Clipboard -Value `$text")) {
    throw "Explorer copy-link context action does not copy the web URL to the clipboard"
  }
  if (-not $contextScript.Contains("context-link.txt")) {
    throw "Explorer copy-link context action does not persist the generated link for troubleshooting"
  }
  if (-not $contextScript.Contains("add-sync-folder --target")) {
    throw "Explorer add-sync-folder context action does not add the selected target as a sync folder"
  }
  if (-not $contextScript.Contains("context-add-sync-folder.txt")) {
    throw "Explorer add-sync-folder context action does not persist setup output for troubleshooting"
  }
  if (-not $contextScript.Contains("Set-Clipboard -Value `$address")) {
    throw "Explorer share context action does not copy the shared folder address to the clipboard"
  }
  if (-not $contextScript.Contains("share address:")) {
    throw "Explorer share context action does not parse the generated share address"
  }

  if (-not (Test-Path -LiteralPath $configPath)) {
    throw "Global config was not created: $configPath"
  }

  $config = Get-Content -Raw -Path $configPath | ConvertFrom-Json
  if ($config.syncDir -ne (Resolve-Path -LiteralPath $syncDir).Path) {
    throw "Unexpected syncDir in config: $($config.syncDir)"
  }
  if ($config.driveLetter -ne $driveLetter) {
    throw "Unexpected driveLetter in config: $($config.driveLetter)"
  }
  if ($config.driveRoot -ne (Resolve-Path -LiteralPath $driveRootDir).Path) {
    throw "Unexpected driveRoot in config: $($config.driveRoot)"
  }
  if (@($config.syncFolders).Count -lt 3) {
    throw "Existing multi-folder sync configuration was not preserved during install"
  }
  $reservedTarget = Get-SubstTarget $requestedDriveLetter
  if (-not $reservedTarget -or (Resolve-Path -LiteralPath $reservedTarget).Path -ne (Resolve-Path -LiteralPath $occupiedDriveDir).Path) {
    throw "Preferred drive letter should remain reserved by the test fixture: ${requestedDriveLetter}: => $reservedTarget"
  }
  $myDriveHubName = ([string][char]0xB0B4) + " " + ([string][char]0xB4DC) + ([string][char]0xB77C) + ([string][char]0xC774) + ([string][char]0xBE0C)
  $sharedDriveHubName = ([string][char]0xACF5) + ([string][char]0xC720) + " " + ([string][char]0xBB38) + ([string][char]0xC11C) + ([string][char]0xD568)
  $myDriveHubDir = Join-Path $driveRootDir $myDriveHubName
  $sharedDriveHubDir = Join-Path $driveRootDir $sharedDriveHubName
  if (-not (Test-Path -LiteralPath $myDriveHubDir)) {
    throw "FileInNOut My Drive hub was not created: $myDriveHubDir"
  }
  if (-not (Test-Path -LiteralPath $sharedDriveHubDir)) {
    throw "FileInNOut shared hub was not created: $sharedDriveHubDir"
  }
  Assert-FileInNOutExplorerBranding -Folder $driveRootDir -DisplayName "FileInNOut"
  Assert-FileInNOutExplorerBranding -Folder $myDriveHubDir -DisplayName $myDriveHubName
  Assert-FileInNOutExplorerBranding -Folder $sharedDriveHubDir -DisplayName $sharedDriveHubName
  if (Test-Path -LiteralPath $legacyDriveRootLink) {
    throw "Legacy root-level FileInNOut drive link was not removed during install migration: $legacyDriveRootLink"
  }
  $driveHubLink = Join-Path $myDriveHubDir "FileInNOut"
  if (-not (Test-Path -LiteralPath $driveHubLink)) {
    throw "FileInNOut drive hub link was not created: $driveHubLink"
  }
  $driveHubLinkItem = Get-Item -LiteralPath $driveHubLink -Force
  if (($driveHubLinkItem.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -eq 0) {
    throw "FileInNOut drive hub link is not a junction/reparse point: $driveHubLink"
  }
  $extraDriveHubLink = Join-Path $myDriveHubDir "Projects"
  if (-not (Test-Path -LiteralPath $extraDriveHubLink)) {
    throw "Additional My Drive sync folder hub link was not created: $extraDriveHubLink"
  }
  $extraDriveHubLinkItem = Get-Item -LiteralPath $extraDriveHubLink -Force
  if (($extraDriveHubLinkItem.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -eq 0) {
    throw "Additional My Drive sync folder hub link is not a junction/reparse point: $extraDriveHubLink"
  }
  $sharedDriveOwnerDir = Join-Path $sharedDriveHubDir "owner@example.com"
  if (-not (Test-Path -LiteralPath $sharedDriveOwnerDir)) {
    throw "Shared owner folder was not created in the shared hub: $sharedDriveOwnerDir"
  }
  Assert-FileInNOutExplorerBranding -Folder $sharedDriveOwnerDir -DisplayName "owner@example.com"
  $sharedDriveHubLink = Join-Path $sharedDriveOwnerDir "Team Share"
  if (-not (Test-Path -LiteralPath $sharedDriveHubLink)) {
    throw "Shared sync folder hub link was not created: $sharedDriveHubLink"
  }
  $sharedDriveHubLinkItem = Get-Item -LiteralPath $sharedDriveHubLink -Force
  if (($sharedDriveHubLinkItem.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -eq 0) {
    throw "Shared sync folder hub link is not a junction/reparse point: $sharedDriveHubLink"
  }

  $substTarget = Get-SubstTarget $driveLetter
  if (-not $substTarget) {
    throw "FileInNOut drive mapping was not created for ${driveLetter}:"
  }
  if ((Resolve-Path -LiteralPath $substTarget).Path -ne (Resolve-Path -LiteralPath $driveRootDir).Path) {
    throw "FileInNOut drive mapping target mismatch: $substTarget"
  }
  if (-not (Test-Path -LiteralPath $driveRoot)) {
    throw "FileInNOut drive root is not reachable: $driveRoot"
  }
  if (-not (Test-Path -LiteralPath (Join-Path (Join-Path $driveRoot $myDriveHubName) "FileInNOut"))) {
    throw "FileInNOut drive root does not expose the default sync folder link"
  }
  if (-not (Test-Path -LiteralPath (Join-Path (Join-Path $driveRoot $myDriveHubName) "Projects"))) {
    throw "FileInNOut drive root does not expose the additional My Drive sync folder link"
  }
  if (-not (Test-Path -LiteralPath (Join-Path (Join-Path (Join-Path $driveRoot $sharedDriveHubName) "owner@example.com") "Team Share"))) {
    throw "FileInNOut drive root does not expose the shared sync folder link"
  }
  $driveDefaultLabelPath = Join-Path $driveIconPath "DefaultLabel"
  $driveDefaultIconPath = Join-Path $driveIconPath "DefaultIcon"
  if (-not (Test-Path -LiteralPath $driveDefaultLabelPath)) {
    throw "FileInNOut drive label registry key is missing: $driveDefaultLabelPath"
  }
  if (-not (Test-Path -LiteralPath $driveDefaultIconPath)) {
    throw "FileInNOut drive icon registry key is missing: $driveDefaultIconPath"
  }
  $driveLabel = (Get-Item -LiteralPath $driveDefaultLabelPath).GetValue("")
  if ($driveLabel -ne "FileInNOut") {
    throw "FileInNOut drive label is unexpected: $driveLabel"
  }
  $driveIcon = [string]((Get-Item -LiteralPath $driveDefaultIconPath).GetValue(""))
  if (-not $driveIcon.Contains("FileInNOutDesktop.ico")) {
    throw "FileInNOut drive icon does not point at the installed icon: $driveIcon"
  }

  & subst "${driveLetter}:" /D 2>$null
  & subst "${runtimeFallbackDriveLetter}:" $driveRootDir
  if ($LASTEXITCODE -ne 0) {
    throw "Could not create runtime fallback drive mapping for uninstall verification: ${runtimeFallbackDriveLetter}:"
  }
  New-Item -Path (Join-Path $runtimeDriveIconPath "DefaultLabel") -Force | Out-Null
  Set-Item -Path (Join-Path $runtimeDriveIconPath "DefaultLabel") -Value "FileInNOut"
  New-Item -Path (Join-Path $runtimeDriveIconPath "DefaultIcon") -Force | Out-Null
  Set-Item -Path (Join-Path $runtimeDriveIconPath "DefaultIcon") -Value "$trayIconPath,0"
  $runtimeTarget = Get-SubstTarget $runtimeFallbackDriveLetter
  if (-not $runtimeTarget -or (Resolve-Path -LiteralPath $runtimeTarget).Path -ne (Resolve-Path -LiteralPath $driveRootDir).Path) {
    throw "Runtime fallback drive mapping target mismatch before uninstall: ${runtimeFallbackDriveLetter}: => $runtimeTarget"
  }

  & powershell -ExecutionPolicy Bypass -File $uninstallerPath -InstallDir $installDir -SyncDir $syncDir -TaskName $taskName -RegistryKeyName $registryKeyName -ExplorerNamespaceGuid $explorerNamespaceGuid -DriveLetter $driveLetter -DriveRootDir $driveRootDir
  if ($LASTEXITCODE -ne 0) {
    throw "uninstall-windows.ps1 failed with exit code $LASTEXITCODE"
  }

  foreach ($path in @($cmdPath, $trayExePath, $trayIconPath, $traySourcePath, $watchPath, $watchHiddenPath, $contextPath, $contextHiddenPath, $clientPath)) {
    if (Test-Path -LiteralPath $path) {
      throw "Uninstall did not remove installed file: $path"
    }
  }

  $deadline = (Get-Date).AddSeconds(5)
  while ((Test-Path -LiteralPath $uninstallerPath) -and (Get-Date) -lt $deadline) {
    Start-Sleep -Milliseconds 100
  }
  if (Test-Path -LiteralPath $uninstallerPath) {
    throw "Uninstall did not remove installed uninstaller: $uninstallerPath"
  }

  if (Test-Path -LiteralPath $startMenuDir) {
    throw "Uninstall did not remove Start Menu shortcut folder: $startMenuDir"
  }
  if (Test-Path -LiteralPath $desktopShortcut) {
    throw "Uninstall did not remove desktop shortcut: $desktopShortcut"
  }

  if (Test-Path -LiteralPath $registryPath) {
    throw "Uninstall did not remove installed-app registry key: $registryPath"
  }
  foreach ($path in @($explorerClsidPath, $explorerDesktopNamespacePath, $explorerMyComputerNamespacePath)) {
    if (Test-Path -LiteralPath $path) {
      throw "Uninstall did not remove Explorer namespace registry key: $path"
    }
  }
  if (Test-Path -LiteralPath $hideDesktopIconPath) {
    $hideDesktopIcon = Get-ItemProperty -LiteralPath $hideDesktopIconPath
    if ($hideDesktopIcon.PSObject.Properties[$explorerNamespaceGuid]) {
      throw "Uninstall did not remove Explorer namespace desktop-hide registry value"
    }
  }
  foreach ($path in $contextMenuPaths) {
    if (Test-Path -LiteralPath $path) {
      throw "Uninstall did not remove Explorer context menu registry key: $path"
    }
  }
  if (Test-Path -LiteralPath $urlProtocolPath) {
    throw "Uninstall did not remove FileInNOut URL protocol registry key: $urlProtocolPath"
  }

  if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
    throw "Uninstall did not remove scheduled task: $taskName"
  }
  if (Test-Path -LiteralPath $startupShortcut) {
    throw "Uninstall did not remove startup shortcut: $startupShortcut"
  }

  if (-not (Test-Path -LiteralPath $syncDir)) {
    throw "Uninstall should preserve sync directory by default: $syncDir"
  }
  if (Test-Path -LiteralPath (Join-Path $syncDir "desktop.ini")) {
    throw "Uninstall should remove FileInNOut Explorer folder branding when preserving the sync directory"
  }
  if (Get-SubstTarget $driveLetter) {
    throw "Uninstall did not remove FileInNOut drive mapping: ${driveLetter}:"
  }
  if (Get-SubstTarget $runtimeFallbackDriveLetter) {
    throw "Uninstall did not remove runtime fallback FileInNOut drive mapping: ${runtimeFallbackDriveLetter}:"
  }
  if (Test-Path -LiteralPath $driveIconPath) {
    throw "Uninstall did not remove FileInNOut drive label/icon registry key: $driveIconPath"
  }
  if (Test-Path -LiteralPath $runtimeDriveIconPath) {
    throw "Uninstall did not remove runtime fallback FileInNOut drive label/icon registry key: $runtimeDriveIconPath"
  }
  if (Test-Path -LiteralPath $driveRootDir) {
    throw "Uninstall did not remove FileInNOut drive root: $driveRootDir"
  }
  if (-not (Test-Path -LiteralPath $configPath)) {
    throw "Uninstall should preserve config by default: $configPath"
  }

  Write-Host "Windows install smoke verification passed: $installDir"
} finally {
  $env:LOCALAPPDATA = $oldLocalAppData
  $env:APPDATA = $oldAppData
  $env:FILEINNOUT_DESKTOP_DIR = $oldDesktopDir

  if (Test-Path -LiteralPath $registryPath) {
    Remove-Item -LiteralPath $registryPath -Recurse -Force
  }
  foreach ($path in @($explorerDesktopNamespacePath, $explorerMyComputerNamespacePath, $explorerClsidPath)) {
    if (Test-Path -LiteralPath $path) {
      Remove-Item -LiteralPath $path -Recurse -Force
    }
  }
  if (Test-Path -LiteralPath $hideDesktopIconPath) {
    Remove-ItemProperty -Path $hideDesktopIconPath -Name $explorerNamespaceGuid -ErrorAction SilentlyContinue
  }
  foreach ($path in $contextMenuPaths) {
    if (Test-Path -LiteralPath $path) {
      Remove-Item -LiteralPath $path -Recurse -Force
    }
  }
  if (Test-Path -LiteralPath $urlProtocolPath) {
    Remove-Item -LiteralPath $urlProtocolPath -Recurse -Force
  }
  if (Get-SubstTarget $driveLetter) {
    & subst "${driveLetter}:" /D 2>$null
  }
  if (Get-SubstTarget $runtimeFallbackDriveLetter) {
    & subst "${runtimeFallbackDriveLetter}:" /D 2>$null
  }
  if (Get-SubstTarget $requestedDriveLetter) {
    & subst "${requestedDriveLetter}:" /D 2>$null
  }
  if (Test-Path -LiteralPath $driveIconPath) {
    Remove-Item -LiteralPath $driveIconPath -Recurse -Force
  }
  if (Test-Path -LiteralPath $runtimeDriveIconPath) {
    Remove-Item -LiteralPath $runtimeDriveIconPath -Recurse -Force
  }
  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
  if (Test-Path -LiteralPath $startupShortcut) {
    Remove-Item -LiteralPath $startupShortcut -Force
  }

  if (-not $KeepTemp -and (Test-Path -LiteralPath $tempRoot)) {
    Remove-Item -LiteralPath $tempRoot -Recurse -Force
  }
}
