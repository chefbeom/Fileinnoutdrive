param(
  [string]$InstallDir = "$env:LOCALAPPDATA\FileInNOutDesktop",
  [string]$SyncDir = "$env:USERPROFILE\FileInNOut",
  [string]$Server = "",
  [string]$Email = "",
  [string]$Password = "",
  [string]$PythonExe = "",
  [string]$PythonRuntimeDir = "",
  [int]$Interval = 20,
  [string]$TaskName = "FileInNOutDesktopSync",
  [switch]$Configure,
  [switch]$InstallStartupTask,
  [switch]$RemoveStartupTask,
  [switch]$StartNow,
  [switch]$CreateDesktopShortcut,
  [switch]$NoStartMenuShortcuts,
  [string]$RegistryKeyName = "FileInNOutDesktop",
  [string]$ExplorerNamespaceGuid = "{6F4F52E8-8E6F-4B94-A14D-8B22C50C13B9}",
  [string]$DriveLetter = "G",
  [switch]$NoRegisterApp
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$clientSource = Join-Path $scriptDir "fileinnout_desktop.py"
$clientConstantsSource = Join-Path $scriptDir "fileinnout_desktop_constants.py"
$clientModelsSource = Join-Path $scriptDir "fileinnout_desktop_models.py"
$clientPathsSource = Join-Path $scriptDir "fileinnout_desktop_paths.py"
$clientApiSource = Join-Path $scriptDir "fileinnout_desktop_api.py"
$clientSecuritySource = Join-Path $scriptDir "fileinnout_desktop_security.py"
$clientWindowsSource = Join-Path $scriptDir "fileinnout_desktop_windows.py"
$clientStateSource = Join-Path $scriptDir "fileinnout_desktop_state.py"
$clientConfigSource = Join-Path $scriptDir "fileinnout_desktop_config.py"
$clientFilesSource = Join-Path $scriptDir "fileinnout_desktop_files.py"
$clientRemoteSource = Join-Path $scriptDir "fileinnout_desktop_remote.py"
$clientWebSource = Join-Path $scriptDir "fileinnout_desktop_web.py"
$clientDriveSource = Join-Path $scriptDir "fileinnout_desktop_drive.py"
$clientDriveHubSource = Join-Path $scriptDir "fileinnout_desktop_drive_hub.py"
$clientProfilesSource = Join-Path $scriptDir "fileinnout_desktop_profiles.py"
$clientDiagnosticsSource = Join-Path $scriptDir "fileinnout_desktop_diagnostics.py"
$clientSharingSource = Join-Path $scriptDir "fileinnout_desktop_sharing.py"
$clientSyncSource = Join-Path $scriptDir "fileinnout_desktop_sync.py"
$clientParserSource = Join-Path $scriptDir "fileinnout_desktop_parser.py"
$clientAccountCommandsSource = Join-Path $scriptDir "fileinnout_desktop_account_commands.py"
$clientStatusCommandsSource = Join-Path $scriptDir "fileinnout_desktop_status_commands.py"
$clientShareCommandsSource = Join-Path $scriptDir "fileinnout_desktop_share_commands.py"
$clientSyncLocalSource = Join-Path $scriptDir "fileinnout_desktop_sync_local.py"
$clientSyncSharedSource = Join-Path $scriptDir "fileinnout_desktop_sync_shared.py"
$clientSyncMovesSource = Join-Path $scriptDir "fileinnout_desktop_sync_moves.py"
$clientDriveAdoptionSource = Join-Path $scriptDir "fileinnout_desktop_drive_adoption.py"
$trayExeSource = Join-Path $scriptDir "FileInNOutDesktop.exe"
$trayIconSource = Join-Path $scriptDir "FileInNOutDesktop.ico"
$desktopProgramSource = Join-Path $scriptDir "DesktopProgram.cs"
$traySource = Join-Path $scriptDir "FileInNOutDesktopTray.cs"
$desktopTrayControllerActionsSource = Join-Path $scriptDir "DesktopTrayControllerActions.cs"
$settingsFormSource = Join-Path $scriptDir "SettingsForm.cs"
$settingsFormActionsSource = Join-Path $scriptDir "SettingsFormActions.cs"
$desktopUiControlsSource = Join-Path $scriptDir "DesktopUiControls.cs"
$desktopTrayMenuSource = Join-Path $scriptDir "DesktopTrayMenu.cs"
$desktopTrayVisualsSource = Join-Path $scriptDir "DesktopTrayVisuals.cs"
$desktopSettingsTextSource = Join-Path $scriptDir "DesktopSettingsText.cs"
$desktopSettingsDialogTextSource = Join-Path $scriptDir "DesktopSettingsDialogText.cs"
$desktopModelsSource = Join-Path $scriptDir "DesktopModels.cs"
$desktopSyncTextSource = Join-Path $scriptDir "DesktopSyncText.cs"
$desktopUpdateServiceSource = Join-Path $scriptDir "DesktopUpdateService.cs"
$desktopExplorerTextSource = Join-Path $scriptDir "DesktopExplorerText.cs"
$desktopExplorerBrandingSource = Join-Path $scriptDir "DesktopExplorerBranding.cs"
$desktopExplorerNamespaceSource = Join-Path $scriptDir "DesktopExplorerNamespace.cs"
$desktopDriveHubLinksSource = Join-Path $scriptDir "DesktopDriveHubLinks.cs"
$desktopDriveHubMaintenanceSource = Join-Path $scriptDir "DesktopDriveHubMaintenance.cs"
$desktopDriveMappingSource = Join-Path $scriptDir "DesktopDriveMapping.cs"
$desktopProcessRunnerSource = Join-Path $scriptDir "DesktopProcessRunner.cs"
$desktopPathRulesSource = Join-Path $scriptDir "DesktopPathRules.cs"
$desktopDataReaderSource = Join-Path $scriptDir "DesktopDataReader.cs"
$desktopTrayConfigStoreSource = Join-Path $scriptDir "DesktopTrayConfigStore.cs"
$desktopTrayPreferencesSource = Join-Path $scriptDir "DesktopTrayPreferences.cs"
$desktopFolderProfileRulesSource = Join-Path $scriptDir "DesktopFolderProfileRules.cs"
$desktopFileSearchSource = Join-Path $scriptDir "DesktopFileSearch.cs"
$desktopSearchServiceSource = Join-Path $scriptDir "DesktopSearchService.cs"
$desktopSyncStateSource = Join-Path $scriptDir "DesktopSyncState.cs"
$desktopChangeTrackerSource = Join-Path $scriptDir "DesktopChangeTracker.cs"
$desktopSyncCommandRunnerSource = Join-Path $scriptDir "DesktopSyncCommandRunner.cs"
$explorerDriveLauncherSource = Join-Path $scriptDir "ExplorerDriveLauncher.cs"
$cloudFilesIntegrationSource = Join-Path $scriptDir "CloudFilesIntegration.cs"
$uninstallerSource = Join-Path $scriptDir "uninstall-windows.ps1"
$shellInstallerHelper = Join-Path $scriptDir "install-windows-shell.ps1"
$driveHubInstallerHelper = Join-Path $scriptDir "install-windows-drive-hub.ps1"
$payloadInstallerHelper = Join-Path $scriptDir "install-windows-payload.ps1"
$packageManifestSource = Join-Path $scriptDir "manifest.json"
$configBase = if ($env:LOCALAPPDATA) { $env:LOCALAPPDATA } elseif ($env:APPDATA) { $env:APPDATA } else { $env:USERPROFILE }
$configDir = Join-Path $configBase "FileInNOutDesktop"
$configPath = Join-Path (Join-Path $configBase "FileInNOutDesktop") "config.json"
$logPath = Join-Path (Join-Path (Join-Path $configBase "FileInNOutDesktop") "logs") "watch.log"
$driveRootDir = Join-Path $configDir "drive-root"
$startMenuBase = if ($env:APPDATA) { Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs" } else { "" }
$startMenuDir = if ($startMenuBase) { Join-Path $startMenuBase "FileInNOut Desktop" } else { "" }
$startupDir = if ($env:APPDATA) { Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\Startup" } else { "" }
$startupShortcut = if ($startupDir) { Join-Path $startupDir "$TaskName.lnk" } else { "" }
$desktopDir = if ($env:FILEINNOUT_DESKTOP_DIR) { $env:FILEINNOUT_DESKTOP_DIR } else { [Environment]::GetFolderPath("DesktopDirectory") }
$desktopShortcut = if ($desktopDir) { Join-Path $desktopDir "FileInNOut Desktop.lnk" } else { "" }
$registryPath = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\$RegistryKeyName"

if (-not (Test-Path $clientSource)) {
  throw "Cannot find fileinnout_desktop.py next to this installer."
}
if (-not (Test-Path $uninstallerSource)) {
  throw "Cannot find uninstall-windows.ps1 next to this installer."
}
if (-not (Test-Path $shellInstallerHelper)) {
  throw "Cannot find install-windows-shell.ps1 next to this installer."
}
if (-not (Test-Path $driveHubInstallerHelper)) {
  throw "Cannot find install-windows-drive-hub.ps1 next to this installer."
}
if (-not (Test-Path $payloadInstallerHelper)) {
  throw "Cannot find install-windows-payload.ps1 next to this installer."
}

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

  return ""
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
. $payloadInstallerHelper
if ($Interval -lt 5) {
  throw "Interval must be at least 5 seconds."
}
if ($RegistryKeyName -match '[\\/]') {
  throw "RegistryKeyName must not contain path separators."
}
try {
  $ExplorerNamespaceGuid = "{" + ([guid]$ExplorerNamespaceGuid.Trim("{}")).ToString().ToUpperInvariant() + "}"
} catch {
  throw "ExplorerNamespaceGuid must be a valid GUID."
}
if ($TaskName -match '[\\/]') {
  throw "TaskName must not contain path separators."
}

function Normalize-FileInNOutDriveLetter {
  param([string]$Value)

  $text = ([string]$Value).Trim().TrimEnd(":").ToUpperInvariant()
  if ($text -match '^[A-Z]$') {
    return $text
  }
  return ""
}

$DriveLetter = Normalize-FileInNOutDriveLetter $DriveLetter
function Get-FileInNOutPackageVersion {
  param([string]$ManifestPath)

  if (Test-Path -LiteralPath $ManifestPath) {
    try {
      $manifest = Get-Content -Raw -LiteralPath $ManifestPath | ConvertFrom-Json
      if ($manifest.version) {
        return [string]$manifest.version
      }
    } catch {
    }
  }
  return "local"
}
# Get-FileInNOutPackageVersionEarlyMarker

if ($PythonRuntimeDir) {
  if (-not (Test-Path -LiteralPath $PythonRuntimeDir)) {
    throw "PythonRuntimeDir does not exist: $PythonRuntimeDir"
  }
  $resolvedPythonRuntimeDir = (Resolve-Path -LiteralPath $PythonRuntimeDir).Path
  $resolvedPython = ""
} elseif ($PythonExe) {
  if (-not (Test-Path -LiteralPath $PythonExe)) {
    throw "PythonExe does not exist: $PythonExe"
  }
  $resolvedPython = (Resolve-Path -LiteralPath $PythonExe).Path
  $resolvedPythonRuntimeDir = ""
} else {
  $resolvedPython = ""
  $resolvedPythonRuntimeDir = ""
}

if ($RemoveStartupTask) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
  if ($startupShortcut -and (Test-Path -LiteralPath $startupShortcut)) {
    Remove-Item -LiteralPath $startupShortcut -Force
  }
  Write-Host "Removed startup task: $TaskName"
  if (-not $InstallStartupTask -and -not $Configure -and -not $StartNow) {
    return
  }
}

Install-FileInNOutPayloadFiles
if ($resolvedPythonRuntimeDir) {
  $runtimeInstallDir = Join-Path $InstallDir "python-runtime"
  if (Test-Path -LiteralPath $runtimeInstallDir) {
    Remove-Item -LiteralPath $runtimeInstallDir -Recurse -Force
  }
  Copy-Item -Recurse -Force -Path $resolvedPythonRuntimeDir -Destination $runtimeInstallDir
  $runtimePython = Join-Path $runtimeInstallDir "python.exe"
  if (-not (Test-Path -LiteralPath $runtimePython)) {
    throw "Bundled Python runtime is missing python.exe: $runtimePython"
  }
  $resolvedPython = (Resolve-Path -LiteralPath $runtimePython).Path
}

$cmdPath = Join-Path $InstallDir "fileinnout-desktop.cmd"
$cmdContent = @"
@echo off
setlocal
set "FILEINNOUT_PYTHON_EXE=$resolvedPython"
if not "%FILEINNOUT_PYTHON_EXE%"=="" (
  "%FILEINNOUT_PYTHON_EXE%" "%~dp0fileinnout_desktop.py" %*
  exit /b %errorlevel%
)
where py >nul 2>nul
if %errorlevel%==0 (
  py -3 "%~dp0fileinnout_desktop.py" %*
  exit /b %errorlevel%
)
where python >nul 2>nul
if %errorlevel%==0 (
  python "%~dp0fileinnout_desktop.py" %*
  exit /b %errorlevel%
)
echo Python 3 was not found. Install Python 3 or add it to PATH.
exit /b 9009
"@
$cmdContent | Set-Content -Encoding ASCII -Path $cmdPath
$trayExePath = Join-Path $InstallDir "FileInNOutDesktop.exe"
$trayIconPath = Join-Path $InstallDir "FileInNOutDesktop.ico"
$installedManifestPath = Join-Path $InstallDir "manifest.json"
$packageVersion = Get-FileInNOutPackageVersion $installedManifestPath
$shortcutIcon = if (Test-Path -LiteralPath $trayIconPath) { $trayIconPath } elseif (Test-Path -LiteralPath $trayExePath) { $trayExePath } else { $cmdPath }

$watchCmd = Join-Path $InstallDir "fileinnout-watch.cmd"
@'
@echo off
setlocal EnableExtensions EnableDelayedExpansion
set "SYNC_DIR=%~1"
if "%SYNC_DIR%"=="" set "SYNC_DIR=%USERPROFILE%\FileInNOut"
set "INTERVAL=%~2"
if "%INTERVAL%"=="" set "INTERVAL=20"
set "LOG_DIR=%LOCALAPPDATA%\FileInNOutDesktop\logs"
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"
echo ===== %date% %time% FileInNOut configured watch starting: %SYNC_DIR% ===== >> "%LOG_DIR%\watch.log"
call "%~dp0fileinnout-desktop.cmd" watch-configured --interval "%INTERVAL%" >> "%LOG_DIR%\watch.log" 2>&1
'@ | Set-Content -Encoding ASCII -Path $watchCmd

$watchHidden = Join-Path $InstallDir "fileinnout-watch-hidden.vbs"
@'
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
syncDir = ""
interval = "30"
If WScript.Arguments.Count > 0 Then
  syncDir = WScript.Arguments(0)
End If
If WScript.Arguments.Count > 1 Then
  interval = WScript.Arguments(1)
End If
If syncDir = "" Then
  syncDir = shell.ExpandEnvironmentStrings("%USERPROFILE%") & "\FileInNOut"
End If
command = Chr(34) & scriptDir & "\fileinnout-watch.cmd" & Chr(34) & " " & Chr(34) & syncDir & Chr(34) & " " & interval
shell.Run command, 0, False
'@ | Set-Content -Encoding ASCII -Path $watchHidden

$contextCmd = Join-Path $InstallDir "fileinnout-context.cmd"
@'
@echo off
setlocal EnableExtensions EnableDelayedExpansion
set "ACTION=%~1"
set "TARGET=%~2"
set "LOG_DIR=%LOCALAPPDATA%\FileInNOutDesktop\logs"
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"

if /I "%ACTION%"=="sync" (
  set "SYNC_RESULT=%LOG_DIR%\context-sync-result.txt"
  echo ===== %date% %time% FileInNOut context sync: %TARGET% ===== >> "%LOG_DIR%\context.log"
  if "%TARGET%"=="" (
    call "%~dp0fileinnout-desktop.cmd" sync-configured > "!SYNC_RESULT!" 2>&1
  ) else (
    call "%~dp0fileinnout-desktop.cmd" sync-target --target "%TARGET%" > "!SYNC_RESULT!" 2>&1
  )
  set "SYNC_EXIT=!ERRORLEVEL!"
  type "!SYNC_RESULT!" >> "%LOG_DIR%\context.log"
  set "FILEINNOUT_SYNC_RESULT=!SYNC_RESULT!"
  set "FILEINNOUT_SYNC_EXIT=!SYNC_EXIT!"
  powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Add-Type -AssemblyName System.Windows.Forms; $decode={param($value) [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($value))}; $title=& $decode 'RmlsZUluTk91dCDrj5nquLDtmZQ='; $ok=& $decode '64+Z6riw7ZmUIOyZhOujjA=='; $fail=& $decode '64+Z6riw7ZmUIOyLpO2MqA=='; $default=& $decode '64+Z6riw7ZmUIOqysOqzvOqwgCDsl4bsirXri4jri6Qu'; $exitCode=0; [int]::TryParse($env:FILEINNOUT_SYNC_EXIT, [ref]$exitCode) | Out-Null; $path=$env:FILEINNOUT_SYNC_RESULT; $text=if($exitCode -eq 0){$ok}else{$fail}; if($path -and (Test-Path -LiteralPath $path)){ $raw=(Get-Content -Raw -Path $path).Trim(); if($raw){ $text=$text + [Environment]::NewLine + [Environment]::NewLine + $raw } }; if([string]::IsNullOrWhiteSpace($text)){ $text=$default }; if($text.Length -gt 3500){ $text=$text.Substring(0,3500) + [Environment]::NewLine + '...' }; $icon=if($exitCode -eq 0){[System.Windows.Forms.MessageBoxIcon]::Information}else{[System.Windows.Forms.MessageBoxIcon]::Warning}; [System.Windows.Forms.MessageBox]::Show($text, $title, [System.Windows.Forms.MessageBoxButtons]::OK, $icon) | Out-Null"
  exit /b !SYNC_EXIT!
)

if /I "%ACTION%"=="app" (
  if exist "%~dp0FileInNOutDesktop.exe" (
    start "" "%~dp0FileInNOutDesktop.exe"
    exit /b 0
  )
)

if /I "%ACTION%"=="web" (
  if "%TARGET%"=="" (
    call "%~dp0fileinnout-desktop.cmd" open-web >> "%LOG_DIR%\context.log" 2>&1
  ) else (
    call "%~dp0fileinnout-desktop.cmd" open-web --target "%TARGET%" >> "%LOG_DIR%\context.log" 2>&1
  )
  exit /b %errorlevel%
)

if /I "%ACTION%"=="copy-link" (
  set "LINK_FILE=%LOG_DIR%\context-link.txt"
  echo ===== %date% %time% FileInNOut context copy link: %TARGET% ===== >> "%LOG_DIR%\context.log"
  if "%TARGET%"=="" (
    call "%~dp0fileinnout-desktop.cmd" open-web --print-only > "%LINK_FILE%" 2>> "%LOG_DIR%\context.log"
  ) else (
    call "%~dp0fileinnout-desktop.cmd" open-web --target "%TARGET%" --print-only > "%LINK_FILE%" 2>> "%LOG_DIR%\context.log"
  )
  if errorlevel 1 exit /b %errorlevel%
  powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Add-Type -AssemblyName System.Windows.Forms; $decode={param($value) [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($value))}; $title=& $decode 'RmlsZUluTk91dCDrp4Htgaw='; $ok=& $decode '66eB7YGs6rCAIO2BtOumveuztOuTnOyXkCDrs7XsgqzrkJjsl4jsirXri4jri6Qu'; $fail=& $decode '66eB7YGsIOuzteyCrCDsi6TtjKg='; $path=Join-Path $env:LOCALAPPDATA 'FileInNOutDesktop\logs\context-link.txt'; if(Test-Path -LiteralPath $path){ $text=(Get-Content -Raw -Path $path).Trim(); if($text){ Set-Clipboard -Value $text; [System.Windows.Forms.MessageBox]::Show($ok, $title, [System.Windows.Forms.MessageBoxButtons]::OK, [System.Windows.Forms.MessageBoxIcon]::Information) | Out-Null; exit 0 } }; [System.Windows.Forms.MessageBox]::Show($fail, $title, [System.Windows.Forms.MessageBoxButtons]::OK, [System.Windows.Forms.MessageBoxIcon]::Warning) | Out-Null; exit 1"
  exit /b %errorlevel%
)

if /I "%ACTION%"=="share" (
  set "SHARE_FILE=%LOG_DIR%\context-share.txt"
  set "SHARE_RESULT=%LOG_DIR%\context-share-result.txt"
  set "FILEINNOUT_SHARE_FILE=!SHARE_FILE!"
  echo ===== %date% %time% FileInNOut context share: %TARGET% ===== >> "%LOG_DIR%\context.log"
  powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Add-Type -AssemblyName Microsoft.VisualBasic; Add-Type -AssemblyName System.Windows.Forms; $decode={param($value) [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($value))}; $title=& $decode 'RmlsZUluTk91dCDqs7XsnKA='; $emailPrompt=& $decode '6rO17Jyg7ZWgIOydtOuplOydvA=='; $permissionPrompt=& $decode '6raM7ZWcIOyEoO2DnTogUkVBRCwgRE9XTkxPQUQsIFVQTE9BRCwgV1JJVEU='; $permissionError=& $decode '6raM7ZWc7J2AIFJFQUQsIERPV05MT0FELCBVUExPQUQsIFdSSVRFIOykkSDtlZjrgpjsl6zslbwg7ZWp64uI64ukLg=='; $email=[Microsoft.VisualBasic.Interaction]::InputBox($emailPrompt,$title,''); if([string]::IsNullOrWhiteSpace($email)){ exit 2 }; $permission=[Microsoft.VisualBasic.Interaction]::InputBox($permissionPrompt,$title,'WRITE'); if([string]::IsNullOrWhiteSpace($permission)){ $permission='WRITE' }; $permission=$permission.Trim().ToUpperInvariant(); if(@('READ','DOWNLOAD','UPLOAD','WRITE') -notcontains $permission){ [System.Windows.Forms.MessageBox]::Show($permissionError, $title, [System.Windows.Forms.MessageBoxButtons]::OK, [System.Windows.Forms.MessageBoxIcon]::Warning) | Out-Null; exit 3 }; Set-Content -Encoding ASCII -Path $env:FILEINNOUT_SHARE_FILE -Value @($email.Trim(), $permission)"
  if errorlevel 1 exit /b 1
  set "SHARE_EMAIL="
  set "SHARE_PERMISSION="
  for /f "usebackq delims=" %%L in ("!SHARE_FILE!") do (
    if not defined SHARE_EMAIL (
      set "SHARE_EMAIL=%%L"
    ) else if not defined SHARE_PERMISSION (
      set "SHARE_PERMISSION=%%L"
    )
  )
  if "!SHARE_PERMISSION!"=="" set "SHARE_PERMISSION=WRITE"
  if "!TARGET!"=="" exit /b 1
  call "%~dp0fileinnout-desktop.cmd" share-target --target "!TARGET!" --email "!SHARE_EMAIL!" --permission "!SHARE_PERMISSION!" --push-first > "!SHARE_RESULT!" 2>&1
  if errorlevel 1 (
    set "FILEINNOUT_SHARE_RESULT=!SHARE_RESULT!"
    powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Add-Type -AssemblyName System.Windows.Forms; $decode={param($value) [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($value))}; $title=& $decode 'RmlsZUluTk91dCDqs7XsnKA='; $default=& $decode '6rO17JygIOyLpO2MqA=='; $path=$env:FILEINNOUT_SHARE_RESULT; $text=$default; if($path -and (Test-Path -LiteralPath $path)){ $text=Get-Content -Raw -Path $path }; if($text.Length -gt 3500){ $text=$text.Substring(0,3500) + [Environment]::NewLine + '...' }; [System.Windows.Forms.MessageBox]::Show($text, $title, [System.Windows.Forms.MessageBoxButtons]::OK, [System.Windows.Forms.MessageBoxIcon]::Warning) | Out-Null"
    exit /b 1
  )
  set "FILEINNOUT_SHARE_RESULT=!SHARE_RESULT!"
  powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Add-Type -AssemblyName System.Windows.Forms; $decode={param($value) [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($value))}; $title=& $decode 'RmlsZUluTk91dCDqs7XsnKA='; $default=& $decode '6rO17JygIOyZhOujjA=='; $copied=& $decode '6rO17JygIOyjvOyGjOqwgCDtgbTrpr3rs7Trk5zsl5Ag67O17IKs65CY7JeI7Iq164uI64ukLg=='; $path=$env:FILEINNOUT_SHARE_RESULT; $text=$default; $address=''; if($path -and (Test-Path -LiteralPath $path)){ $raw=Get-Content -Raw -Path $path; if($raw){ $text=$raw }; foreach($line in ($raw -split '\r?\n')){ if($line -match '^share address:\s*(.+)$'){ $address=$Matches[1].Trim() } } }; if($address){ Set-Clipboard -Value $address; $text=$text + [Environment]::NewLine + [Environment]::NewLine + $copied + [Environment]::NewLine + $address }; if($text.Length -gt 3500){ $text=$text.Substring(0,3500) + [Environment]::NewLine + '...' }; [System.Windows.Forms.MessageBox]::Show($text, $title, [System.Windows.Forms.MessageBoxButtons]::OK, [System.Windows.Forms.MessageBoxIcon]::Information) | Out-Null"
  exit /b 0
)

if /I "%ACTION%"=="add-sync-folder" (
  set "ADD_RESULT=%LOG_DIR%\context-add-sync-folder.txt"
  echo ===== %date% %time% FileInNOut context add sync folder: %TARGET% ===== >> "%LOG_DIR%\context.log"
  if "!TARGET!"=="" exit /b 1
  call "%~dp0fileinnout-desktop.cmd" add-sync-folder --target "!TARGET!" --sync-now > "!ADD_RESULT!" 2>&1
  set "FILEINNOUT_ADD_RESULT=!ADD_RESULT!"
  if errorlevel 1 (
    powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Add-Type -AssemblyName System.Windows.Forms; $decode={param($value) [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($value))}; $title=& $decode 'RmlsZUluTk91dCDrj5nquLDtmZQg7Y+0642U'; $default=& $decode '64+Z6riw7ZmUIO2PtOuNlCDshKTsoJUg7Iuk7Yyo'; $path=$env:FILEINNOUT_ADD_RESULT; $text=$default; if($path -and (Test-Path -LiteralPath $path)){ $text=Get-Content -Raw -Path $path }; if($text.Length -gt 3500){ $text=$text.Substring(0,3500) + [Environment]::NewLine + '...' }; [System.Windows.Forms.MessageBox]::Show($text, $title, [System.Windows.Forms.MessageBoxButtons]::OK, [System.Windows.Forms.MessageBoxIcon]::Warning) | Out-Null"
    exit /b 1
  )
  powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Add-Type -AssemblyName System.Windows.Forms; $decode={param($value) [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($value))}; $title=& $decode 'RmlsZUluTk91dCDrj5nquLDtmZQg7Y+0642U'; $default=& $decode '64+Z6riw7ZmUIO2PtOuNlCDstpTqsIAg7JmE66OM'; $path=$env:FILEINNOUT_ADD_RESULT; $text=$default; if($path -and (Test-Path -LiteralPath $path)){ $text=Get-Content -Raw -Path $path }; if($text.Length -gt 3500){ $text=$text.Substring(0,3500) + [Environment]::NewLine + '...' }; [System.Windows.Forms.MessageBox]::Show($text, $title, [System.Windows.Forms.MessageBoxButtons]::OK, [System.Windows.Forms.MessageBoxIcon]::Information) | Out-Null"
  if exist "%~dp0FileInNOutDesktop.exe" start "" "%~dp0FileInNOutDesktop.exe"
  exit /b 0
)

if /I "%ACTION%"=="status" (
  set "STATUS_FILE=%LOG_DIR%\context-status.txt"
  echo ===== %date% %time% FileInNOut context status: %TARGET% ===== > "%STATUS_FILE%"
  if "%TARGET%"=="" (
    call "%~dp0fileinnout-desktop.cmd" doctor --local-only >> "%STATUS_FILE%" 2>&1
  ) else (
    call "%~dp0fileinnout-desktop.cmd" doctor-target --target "%TARGET%" --local-only >> "%STATUS_FILE%" 2>&1
  )
  set "FILEINNOUT_STATUS_FILE=%STATUS_FILE%"
  powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Add-Type -AssemblyName System.Windows.Forms; $decode={param($value) [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($value))}; $title=& $decode 'RmlsZUluTk91dCDrj5nquLDtmZQg7IOB7YOc'; $default=& $decode '7IOB7YOcIOy2nOugpeydtCDsl4bsirXri4jri6Qu'; $path=$env:FILEINNOUT_STATUS_FILE; $text=$default; if($path -and (Test-Path -LiteralPath $path)){ $text=Get-Content -Raw -Path $path }; if($text.Length -gt 3500){ $text=$text.Substring(0,3500) + [Environment]::NewLine + '...' }; [System.Windows.Forms.MessageBox]::Show($text, $title, [System.Windows.Forms.MessageBoxButtons]::OK, [System.Windows.Forms.MessageBoxIcon]::Information) | Out-Null"
  exit /b %errorlevel%
)

if /I "%ACTION%"=="drive" (
  powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$configPath=Join-Path $env:LOCALAPPDATA 'FileInNOutDesktop\config.json'; $target=''; if(Test-Path -LiteralPath $configPath){ try{ $config=Get-Content -Raw -Path $configPath | ConvertFrom-Json; $driveRoot=[string]$config.driveRoot; $letter=([string]$config.driveLetter).Trim().TrimEnd(':').ToUpperInvariant(); if($letter -match '^[A-Z]$' -and $driveRoot -and (Test-Path -LiteralPath $driveRoot)){ $prefix=$letter + ':\: => '; $mapped=''; foreach($line in (& subst 2>$null)){ $trim=$line.Trim(); if($trim.StartsWith($prefix, [System.StringComparison]::OrdinalIgnoreCase)){ $mapped=$trim.Substring($prefix.Length).Trim(); break } }; if($mapped){ try{ $resolvedMapped=(Resolve-Path -LiteralPath $mapped).Path; $resolvedRoot=(Resolve-Path -LiteralPath $driveRoot).Path; if($resolvedMapped.Equals($resolvedRoot, [System.StringComparison]::OrdinalIgnoreCase)){ $target=$letter + ':\' } } catch{} }; if(-not $target){ $target=$driveRoot } } elseif($driveRoot -and (Test-Path -LiteralPath $driveRoot)){ $target=$driveRoot } } catch{} }; if(-not $target){ $target=Join-Path $env:LOCALAPPDATA 'FileInNOutDesktop\drive-root' }; Start-Process explorer.exe -ArgumentList @($target)"
  exit /b 0
)

if /I "%ACTION%"=="folder" (
  if "%TARGET%"=="" set "TARGET=%USERPROFILE%\FileInNOut"
  start "" explorer.exe "%TARGET%"
  exit /b 0
)

exit /b 0
'@ | Set-Content -Encoding ASCII -Path $contextCmd

$contextHidden = Join-Path $InstallDir "fileinnout-context-hidden.vbs"
@'
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
action = ""
target = ""
If WScript.Arguments.Count > 0 Then
  action = WScript.Arguments(0)
End If
If WScript.Arguments.Count > 1 Then
  target = WScript.Arguments(1)
End If
command = Chr(34) & scriptDir & "\fileinnout-context.cmd" & Chr(34) & " " & Chr(34) & action & Chr(34) & " " & Chr(34) & target & Chr(34)
shell.Run command, 0, False
'@ | Set-Content -Encoding ASCII -Path $contextHidden

. $shellInstallerHelper
. $driveHubInstallerHelper

function Register-FileInNOutApp {
  param(
    [string]$Path,
    [string]$InstallLocation,
    [string]$UninstallerPath,
    [string]$DisplayIcon,
    [string]$DisplayVersion,
    [string]$KeyName,
    [string]$ScheduledTaskName,
    [string]$NamespaceGuid,
    [string]$MountedDriveLetter,
    [string]$DriveRootPath
  )

  $resolvedInstall = (Resolve-Path -LiteralPath $InstallLocation).Path
  $estimatedSizeKb = 0
  Get-ChildItem -LiteralPath $resolvedInstall -File -ErrorAction SilentlyContinue | ForEach-Object {
    $estimatedSizeKb += [int][Math]::Ceiling($_.Length / 1024)
  }

  New-Item -Path $Path -Force | Out-Null
  $driveArgument = if ($MountedDriveLetter) { " -DriveLetter `"$MountedDriveLetter`"" } else { "" }
  $driveRootArgument = if ($DriveRootPath) { " -DriveRootDir `"$DriveRootPath`"" } else { "" }
  $uninstallCommand = "powershell.exe -ExecutionPolicy Bypass -File `"$UninstallerPath`" -RegistryKeyName `"$KeyName`" -TaskName `"$ScheduledTaskName`" -ExplorerNamespaceGuid `"$NamespaceGuid`"$driveArgument$driveRootArgument"
  Set-ItemProperty -Path $Path -Name "DisplayName" -Value "FileInNOut Desktop"
  Set-ItemProperty -Path $Path -Name "DisplayVersion" -Value $(if ($DisplayVersion) { $DisplayVersion } else { "local" })
  Set-ItemProperty -Path $Path -Name "Publisher" -Value "FileInNOut"
  Set-ItemProperty -Path $Path -Name "InstallLocation" -Value $resolvedInstall
  Set-ItemProperty -Path $Path -Name "DisplayIcon" -Value $DisplayIcon
  Set-ItemProperty -Path $Path -Name "UninstallString" -Value $uninstallCommand
  Set-ItemProperty -Path $Path -Name "QuietUninstallString" -Value $uninstallCommand
  New-ItemProperty -Path $Path -Name "NoModify" -Value 1 -PropertyType DWord -Force | Out-Null
  New-ItemProperty -Path $Path -Name "NoRepair" -Value 1 -PropertyType DWord -Force | Out-Null
  New-ItemProperty -Path $Path -Name "EstimatedSize" -Value $estimatedSizeKb -PropertyType DWord -Force | Out-Null
}

function Invoke-FileInNOutClient {
  param(
    [string[]]$Arguments,
    [string]$StandardInput = $null
  )

  if ($null -ne $StandardInput) {
    $StandardInput | & $cmdPath @Arguments
  } else {
    & $cmdPath @Arguments
  }
  if ($LASTEXITCODE -ne 0) {
    throw "fileinnout-desktop.cmd failed with exit code $LASTEXITCODE"
  }
}

function Invoke-FileInNOutSyncRootRegistration {
  param([string]$Path)

  if ([string]::IsNullOrWhiteSpace($Path) -or -not (Test-Path -LiteralPath $Path)) {
    return
  }
  if (-not (Test-Path -LiteralPath $trayExePath)) {
    return
  }

  try {
    $arguments = "--register-sync-root `"$Path`""
    $process = Start-Process `
      -FilePath $trayExePath `
      -ArgumentList $arguments `
      -WorkingDirectory (Split-Path -Parent $trayExePath) `
      -WindowStyle Hidden `
      -Wait `
      -PassThru
    if ($process.ExitCode -eq 0) {
      Write-Host "Registered Cloud Files sync root: $Path"
    } else {
      Write-Warning "Cloud Files sync root registration was skipped or failed with exit code $($process.ExitCode)."
    }
  } catch {
    Write-Warning "Cloud Files sync root registration was skipped: $($_.Exception.Message)"
  }
}

New-Item -ItemType Directory -Force -Path $SyncDir | Out-Null
$syncDirDisplayName = Split-Path -Leaf $SyncDir
$syncDirInfoTip = ConvertFrom-FileInNOutUtf8Base64 "RmlsZUluTk91dCDrj5nquLDtmZQg7Y+0642UIC0g67OA6rK9IOyCrO2VreydhCDtgbTrnbzsmrDrk5zsmYAg64+Z6riw7ZmU"
Set-FileInNOutExplorerFolder -Path $SyncDir -IconPath $shortcutIcon -DisplayName $syncDirDisplayName -InfoTip $syncDirInfoTip
New-Item -ItemType Directory -Force -Path $driveRootDir | Out-Null
Set-FileInNOutExplorerFolder -Path $driveRootDir -IconPath $shortcutIcon -DisplayName "FileInNOut" -InfoTip (ConvertFrom-FileInNOutUtf8Base64 "RmlsZUluTk91dCDrk5zrnbzsnbTruIwgLSDrgrQg65Oc65287J2067iM7JmAIOqzteycoCDrrLjshJztlag=")
$myDriveHubName = ([string][char]0xB0B4) + " " + ([string][char]0xB4DC) + ([string][char]0xB77C) + ([string][char]0xC774) + ([string][char]0xBE0C)
$sharedDriveHubName = ([string][char]0xACF5) + ([string][char]0xC720) + " " + ([string][char]0xBB38) + ([string][char]0xC11C) + ([string][char]0xD568)
$myDriveHubDir = Join-Path $driveRootDir $myDriveHubName
$sharedDriveHubDir = Join-Path $driveRootDir $sharedDriveHubName
New-Item -ItemType Directory -Force -Path $myDriveHubDir | Out-Null
New-Item -ItemType Directory -Force -Path $sharedDriveHubDir | Out-Null
Set-FileInNOutExplorerFolder -Path $myDriveHubDir -IconPath $shortcutIcon -DisplayName $myDriveHubName -InfoTip (ConvertFrom-FileInNOutUtf8Base64 "64K06rCAIOuPmeq4sO2ZlO2VmOuKlCDtj7TrjZQ=")
Set-FileInNOutExplorerFolder -Path $sharedDriveHubDir -IconPath $shortcutIcon -DisplayName $sharedDriveHubName -InfoTip (ConvertFrom-FileInNOutUtf8Base64 "6rO17Jyg67Cb7J2AIOuPmeq4sO2ZlCDtj7TrjZQ=")
$driveLinkName = ConvertTo-FileInNOutDriveLinkName -PreferredName (Split-Path -Leaf $SyncDir) -TargetPath $SyncDir
Remove-FileInNOutLegacyDriveJunction -RootPath $driveRootDir -LinkName $driveLinkName
New-FileInNOutDriveJunction -RootPath $myDriveHubDir -LinkName $driveLinkName -TargetPath $SyncDir
Register-FileInNOutExplorerNamespace -Guid $ExplorerNamespaceGuid -TargetPath $driveRootDir -IconPath $shortcutIcon
Register-FileInNOutShellSyncRoot -Guid $ExplorerNamespaceGuid -TargetPath $driveRootDir -IconPath $shortcutIcon -AccountId $(if ($Email) { $Email } else { "default" })
Register-FileInNOutContextMenus -IconPath $shortcutIcon
Register-FileInNOutUrlProtocol -CmdPath $cmdPath -IconPath $shortcutIcon
$mountedDriveLetter = Mount-FileInNOutDrive -Letter $DriveLetter -TargetPath $driveRootDir
if ($mountedDriveLetter) {
  Register-FileInNOutDriveAppearance -Letter $mountedDriveLetter -IconPath $shortcutIcon
}
$registeredDriveLetter = if ($mountedDriveLetter) { $mountedDriveLetter } else { $DriveLetter }
if ($Configure -or -not (Test-Path -LiteralPath $configPath)) {
  Invoke-FileInNOutClient @("init", "--dir", $SyncDir)
}

if ($DriveLetter -and (Test-Path -LiteralPath $configPath)) {
  try {
    $config = Get-Content -Raw -Path $configPath | ConvertFrom-Json
    $config | Add-Member -NotePropertyName "driveLetter" -NotePropertyValue $registeredDriveLetter -Force
    $config | Add-Member -NotePropertyName "driveRoot" -NotePropertyValue $driveRootDir -Force
    $config | ConvertTo-Json -Depth 8 | Set-Content -Encoding UTF8 -Path $configPath
  } catch {
    Write-Warning "Could not save FileInNOut drive letter to config: $($_.Exception.Message)"
  }
}

Sync-FileInNOutDriveHubLinks -ConfigPath $configPath -DriveRootDir $driveRootDir -DefaultSyncDir $SyncDir -IconPath $shortcutIcon
Invoke-FileInNOutSyncRootRegistration -Path $driveRootDir

if ($Configure -or $Server -or $Email) {
  New-Item -ItemType Directory -Force -Path $SyncDir | Out-Null

  if ($Server -or $Email) {
    if (-not $Server -or -not $Email) {
      throw "Both -Server and -Email are required when configuring login."
    }

    $loginArgs = @("login", "--server", $Server, "--email", $Email)
    if ($Password) {
      $loginArgs += @("--password-stdin")
      Invoke-FileInNOutClient -Arguments $loginArgs -StandardInput $Password
    } else {
      Invoke-FileInNOutClient -Arguments $loginArgs
    }
  }
}

if ($InstallStartupTask) {
  New-Item -ItemType Directory -Force -Path $SyncDir | Out-Null

  if (-not (Test-Path $configPath)) {
    Write-Warning "No saved login config found at $configPath. Run login before the startup task can sync successfully."
  }

  try {
    if (Test-Path -LiteralPath $trayExePath) {
      $action = New-ScheduledTaskAction -Execute $trayExePath -WorkingDirectory $InstallDir
    } else {
      $taskArgument = "/c `"`"$watchCmd`" `"$SyncDir`" $Interval`""
      $action = New-ScheduledTaskAction -Execute "cmd.exe" -Argument $taskArgument
    }
    $trigger = New-ScheduledTaskTrigger -AtLogOn
    $userId = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
    $principal = New-ScheduledTaskPrincipal -UserId $userId -LogonType Interactive -RunLevel Limited

    Register-ScheduledTask `
      -TaskName $TaskName `
      -Action $action `
      -Trigger $trigger `
      -Principal $principal `
      -Description "Run FileInNOut Desktop sync watcher at Windows logon." `
      -Force | Out-Null

    if ($startupShortcut -and (Test-Path -LiteralPath $startupShortcut)) {
      Remove-Item -LiteralPath $startupShortcut -Force
    }
    Write-Host "Installed startup task: $TaskName"
  } catch {
    if (-not $startupShortcut) {
      throw
    }
    Write-Warning "Scheduled task registration failed; using Startup folder shortcut instead. $($_.Exception.Message)"
    New-Item -ItemType Directory -Force -Path $startupDir | Out-Null
    New-FileInNOutShortcut `
      -Path $startupShortcut `
      -TargetPath $(if (Test-Path -LiteralPath $trayExePath) { $trayExePath } else { "wscript.exe" }) `
      -Arguments $(if (Test-Path -LiteralPath $trayExePath) { "" } else { "`"$watchHidden`" `"$SyncDir`" $Interval" }) `
      -WorkingDirectory $InstallDir `
      -IconLocation $shortcutIcon
    Write-Host "Installed startup shortcut: $startupShortcut"
  }
}

if ($StartNow) {
  New-Item -ItemType Directory -Force -Path $SyncDir | Out-Null
  if (Test-Path -LiteralPath $trayExePath) {
    Start-Process -FilePath $trayExePath -WorkingDirectory $InstallDir
    Write-Host "Started FileInNOut Desktop tray app"
  } else {
    Start-Process -FilePath "cmd.exe" -ArgumentList @("/c", "`"$watchCmd`" `"$SyncDir`" $Interval") -WindowStyle Hidden
    Write-Host "Started background watcher for $SyncDir"
  }
}

if (-not $NoStartMenuShortcuts -and $startMenuDir) {
  New-Item -ItemType Directory -Force -Path $SyncDir | Out-Null
  New-Item -ItemType Directory -Force -Path $startMenuDir | Out-Null
  $openDriveTarget = if ($mountedDriveLetter) { "${mountedDriveLetter}:\" } else { $driveRootDir }
  New-FileInNOutShortcut `
    -Path (Join-Path $startMenuDir "FileInNOut Desktop.lnk") `
    -TargetPath $(if (Test-Path -LiteralPath $trayExePath) { $trayExePath } else { "explorer.exe" }) `
    -Arguments $(if (Test-Path -LiteralPath $trayExePath) { "" } else { "`"$openDriveTarget`"" }) `
    -WorkingDirectory $(if (Test-Path -LiteralPath $trayExePath) { $InstallDir } else { $openDriveTarget }) `
    -IconLocation $shortcutIcon
  New-FileInNOutShortcut `
    -Path (Join-Path $startMenuDir "Open FileInNOut Folder.lnk") `
    -TargetPath $(if (Test-Path -LiteralPath $trayExePath) { $trayExePath } else { "explorer.exe" }) `
    -Arguments $(if (Test-Path -LiteralPath $trayExePath) { "--open-drive" } else { "`"$openDriveTarget`"" }) `
    -WorkingDirectory $(if (Test-Path -LiteralPath $trayExePath) { $InstallDir } else { $openDriveTarget }) `
    -IconLocation $shortcutIcon
  New-FileInNOutShortcut `
    -Path (Join-Path $startMenuDir "Open FileInNOut Drive.lnk") `
    -TargetPath $(if (Test-Path -LiteralPath $trayExePath) { $trayExePath } else { "explorer.exe" }) `
    -Arguments $(if (Test-Path -LiteralPath $trayExePath) { "--open-drive" } else { "`"$openDriveTarget`"" }) `
    -WorkingDirectory $(if (Test-Path -LiteralPath $trayExePath) { $InstallDir } else { $openDriveTarget }) `
    -IconLocation $shortcutIcon
  New-FileInNOutShortcut `
    -Path (Join-Path $startMenuDir "FileInNOut Sync Now.lnk") `
    -TargetPath "cmd.exe" `
    -Arguments "/k `"`"$cmdPath`" sync-configured`"" `
    -WorkingDirectory $InstallDir `
    -IconLocation $shortcutIcon
  New-FileInNOutShortcut `
    -Path (Join-Path $startMenuDir "FileInNOut Doctor.lnk") `
    -TargetPath "cmd.exe" `
    -Arguments "/k `"`"$cmdPath`" doctor --local-only`"" `
    -WorkingDirectory $InstallDir `
    -IconLocation $shortcutIcon
  New-FileInNOutShortcut `
    -Path (Join-Path $startMenuDir "Uninstall FileInNOut Desktop.lnk") `
    -TargetPath "powershell.exe" `
    -Arguments "-ExecutionPolicy Bypass -File `"$InstallDir\uninstall-windows.ps1`" -RegistryKeyName `"$RegistryKeyName`" -TaskName `"$TaskName`" -ExplorerNamespaceGuid `"$ExplorerNamespaceGuid`" -DriveLetter `"$registeredDriveLetter`" -DriveRootDir `"$driveRootDir`"" `
    -WorkingDirectory $InstallDir `
    -IconLocation $shortcutIcon
  Write-Host "Start Menu shortcuts: $startMenuDir"
}

if ($CreateDesktopShortcut -and $desktopShortcut) {
  New-FileInNOutShortcut `
    -Path $desktopShortcut `
    -TargetPath $(if (Test-Path -LiteralPath $trayExePath) { $trayExePath } else { $cmdPath }) `
    -WorkingDirectory $InstallDir `
    -IconLocation $shortcutIcon
  Write-Host "Desktop shortcut: $desktopShortcut"
}

if (-not $NoRegisterApp) {
  Register-FileInNOutApp `
    -Path $registryPath `
    -InstallLocation $InstallDir `
    -UninstallerPath (Join-Path $InstallDir "uninstall-windows.ps1") `
    -DisplayIcon $shortcutIcon `
    -DisplayVersion $packageVersion `
    -KeyName $RegistryKeyName `
    -ScheduledTaskName $TaskName `
    -NamespaceGuid $ExplorerNamespaceGuid `
    -MountedDriveLetter $registeredDriveLetter `
    -DriveRootPath $driveRootDir
  Write-Host "Registered installed app: $registryPath"
}

Write-Host "Installed FileInNOut Desktop client to $InstallDir"
Write-Host "Command: $cmdPath"
Write-Host "Sync folder: $SyncDir"
if ($mountedDriveLetter) {
  Write-Host "Drive: ${mountedDriveLetter}:\"
} elseif ($DriveLetter) {
  Write-Host "Drive: skipped (${DriveLetter}: unavailable)"
}
Write-Host "Log file: $logPath"
Write-Host "Login: $cmdPath login --server http://YOUR_HOST/api --email admin@fileinnout.local"
Write-Host "Uninstall: powershell -ExecutionPolicy Bypass -File `"$InstallDir\uninstall-windows.ps1`""
