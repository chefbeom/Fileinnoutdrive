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
$trayExeSource = Join-Path $scriptDir "FileInNOutDesktop.exe"
$trayIconSource = Join-Path $scriptDir "FileInNOutDesktop.ico"
$traySource = Join-Path $scriptDir "FileInNOutDesktopTray.cs"
$uninstallerSource = Join-Path $scriptDir "uninstall-windows.ps1"
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

New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
$existingTrayPath = Join-Path ([System.IO.Path]::GetFullPath($InstallDir)) "FileInNOutDesktop.exe"
Get-Process -Name FileInNOutDesktop -ErrorAction SilentlyContinue |
  Where-Object {
    try {
      $_.Path -and $_.Path.Equals($existingTrayPath, [System.StringComparison]::OrdinalIgnoreCase)
    } catch {
      $false
    }
  } |
  ForEach-Object {
    Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
  }
Start-Sleep -Milliseconds 300
Copy-Item -Force -Path $clientSource -Destination (Join-Path $InstallDir "fileinnout_desktop.py")
Copy-Item -Force -Path $uninstallerSource -Destination (Join-Path $InstallDir "uninstall-windows.ps1")
if (Test-Path -LiteralPath $trayExeSource) {
  Copy-Item -Force -Path $trayExeSource -Destination (Join-Path $InstallDir "FileInNOutDesktop.exe")
} elseif (Test-Path -LiteralPath $traySource) {
  $csc = Resolve-CSharpCompiler
  if ($csc) {
    $trayBuildOutput = Join-Path $InstallDir "FileInNOutDesktop.exe"
    $trayBuildArgs = @(
      "/nologo",
      "/codepage:65001",
      "/target:winexe",
      "/out:$trayBuildOutput",
      "/reference:System.Windows.Forms.dll",
      "/reference:System.Drawing.dll",
      "/reference:System.Web.Extensions.dll"
    )
    if (Test-Path -LiteralPath $trayIconSource) {
      $trayBuildArgs += "/win32icon:$trayIconSource"
    }
    $trayBuildArgs += $traySource
    & $csc @trayBuildArgs
    if ($LASTEXITCODE -ne 0) {
      Write-Warning "Could not build FileInNOutDesktop.exe; command-line shortcuts will still be installed."
    }
  } else {
    Write-Warning "C# compiler was not found; command-line shortcuts will still be installed."
  }
}
if (Test-Path -LiteralPath $trayIconSource) {
  Copy-Item -Force -Path $trayIconSource -Destination (Join-Path $InstallDir "FileInNOutDesktop.ico")
}
if (Test-Path -LiteralPath $traySource) {
  Copy-Item -Force -Path $traySource -Destination (Join-Path $InstallDir "FileInNOutDesktopTray.cs")
}

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

function New-FileInNOutShortcut {
  param(
    [string]$Path,
    [string]$TargetPath,
    [string]$Arguments = "",
    [string]$WorkingDirectory = "",
    [string]$IconLocation = ""
  )

  $shell = New-Object -ComObject WScript.Shell
  $shortcut = $shell.CreateShortcut($Path)
  $shortcut.TargetPath = $TargetPath
  if ($Arguments) {
    $shortcut.Arguments = $Arguments
  }
  if ($WorkingDirectory) {
    $shortcut.WorkingDirectory = $WorkingDirectory
  }
  if ($IconLocation) {
    $shortcut.IconLocation = $IconLocation
  }
  $shortcut.Save()
}

function Set-FileInNOutExplorerFolder {
  param(
    [string]$Path,
    [string]$IconPath = "",
    [string]$DisplayName = "FileInNOut",
    [string]$InfoTip = ""
  )

  if ([string]::IsNullOrWhiteSpace($Path)) {
    return
  }

  New-Item -ItemType Directory -Force -Path $Path | Out-Null
  $desktopIni = Join-Path $Path "desktop.ini"
  $safeDisplayName = if ([string]::IsNullOrWhiteSpace($DisplayName)) { "FileInNOut" } else { $DisplayName.Trim() }
  $safeInfoTip = if ([string]::IsNullOrWhiteSpace($InfoTip)) { ConvertFrom-FileInNOutUtf8Base64 "RmlsZUluTk91dCDrj5nquLDtmZQg7Y+0642U" } else { $InfoTip.Trim() }
  $lines = @(
    "[.ShellClassInfo]",
    "LocalizedResourceName=$safeDisplayName",
    "InfoTip=$safeInfoTip"
  )
  if ($IconPath -and (Test-Path -LiteralPath $IconPath)) {
    $lines += "IconResource=$IconPath,0"
    $lines += "IconFile=$IconPath"
    $lines += "IconIndex=0"
  }
  $lines += ""
  $lines | Set-Content -Encoding Unicode -Path $desktopIni

  & attrib +h +s $desktopIni 2>$null
  & attrib +r +s $Path 2>$null
}

function Get-FileInNOutCurrentUserSubKeyPath {
  param(
    [string]$Path
  )

  $subKeyPath = $Path -replace '^HKCU:\\', ''
  if ($subKeyPath -eq $Path) {
    throw "Only HKCU registry paths are supported here: $Path"
  }
  return $subKeyPath
}

function New-FileInNOutRegistryKey {
  param(
    [string]$Path
  )

  $subKeyPath = Get-FileInNOutCurrentUserSubKeyPath -Path $Path
  $key = [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey($subKeyPath)
  if (-not $key) {
    throw "Cannot open registry key for writing: $Path"
  }
  try {
    return
  } finally {
    $key.Close()
  }
}

function Set-FileInNOutRegistryValue {
  param(
    [string]$Path,
    [AllowEmptyString()][string]$Name,
    [object]$Value,
    [Microsoft.Win32.RegistryValueKind]$Kind = [Microsoft.Win32.RegistryValueKind]::String
  )

  $subKeyPath = Get-FileInNOutCurrentUserSubKeyPath -Path $Path
  $key = [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey($subKeyPath)
  if (-not $key) {
    throw "Cannot open registry key for writing: $Path"
  }
  try {
    $key.SetValue($Name, $Value, $Kind)
  } finally {
    $key.Close()
  }
}

function Set-RegistryDefaultValue {
  param(
    [string]$Path,
    [string]$Value
  )

  Set-FileInNOutRegistryValue -Path $Path -Name "" -Value $Value
}

function ConvertFrom-FileInNOutUtf8Base64 {
  param([string]$Value)
  return [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($Value))
}

function Register-FileInNOutExplorerNamespace {
  param(
    [string]$Guid,
    [string]$TargetPath,
    [string]$IconPath = ""
  )

  if ([string]::IsNullOrWhiteSpace($TargetPath)) {
    return
  }

  $resolvedTarget = (Resolve-Path -LiteralPath $TargetPath).Path
  $displayIcon = if ($IconPath -and (Test-Path -LiteralPath $IconPath)) { "$IconPath,0" } else { "%SystemRoot%\System32\shell32.dll,3" }
  $clsidPath = "HKCU:\Software\Classes\CLSID\$Guid"
  $defaultIconPath = Join-Path $clsidPath "DefaultIcon"
  $inProcPath = Join-Path $clsidPath "InProcServer32"
  $instancePath = Join-Path $clsidPath "Instance"
  $propertyBagPath = Join-Path $instancePath "InitPropertyBag"
  $shellFolderPath = Join-Path $clsidPath "ShellFolder"
  $desktopNamespacePath = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Desktop\NameSpace\$Guid"
  $myComputerNamespacePath = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\MyComputer\NameSpace\$Guid"
  $hideDesktopIconPath = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\HideDesktopIcons\NewStartPanel"

  New-Item -Path $clsidPath -Force | Out-Null
  Set-RegistryDefaultValue -Path $clsidPath -Value "FileInNOut"
  New-ItemProperty -Path $clsidPath -Name "System.IsPinnedToNameSpaceTree" -Value 1 -PropertyType DWord -Force | Out-Null
  New-ItemProperty -Path $clsidPath -Name "SortOrderIndex" -Value 66 -PropertyType DWord -Force | Out-Null
  New-ItemProperty -Path $clsidPath -Name "ThisPCPolicy" -Value "Show" -PropertyType String -Force | Out-Null

  New-Item -Path $defaultIconPath -Force | Out-Null
  Set-RegistryDefaultValue -Path $defaultIconPath -Value $displayIcon

  New-Item -Path $inProcPath -Force | Out-Null
  Set-RegistryDefaultValue -Path $inProcPath -Value "%SystemRoot%\System32\shell32.dll"
  New-ItemProperty -Path $inProcPath -Name "ThreadingModel" -Value "Both" -PropertyType String -Force | Out-Null

  New-Item -Path $instancePath -Force | Out-Null
  New-ItemProperty -Path $instancePath -Name "CLSID" -Value "{0E5AAE11-A475-4C5B-AB00-C66DE400274E}" -PropertyType String -Force | Out-Null
  New-Item -Path $propertyBagPath -Force | Out-Null
  New-ItemProperty -Path $propertyBagPath -Name "Attributes" -Value 17 -PropertyType DWord -Force | Out-Null
  New-ItemProperty -Path $propertyBagPath -Name "TargetFolderPath" -Value $resolvedTarget -PropertyType String -Force | Out-Null

  New-Item -Path $shellFolderPath -Force | Out-Null
  New-ItemProperty -Path $shellFolderPath -Name "FolderValueFlags" -Value 40 -PropertyType DWord -Force | Out-Null
  New-ItemProperty -Path $shellFolderPath -Name "Attributes" -Value 4034920525 -PropertyType DWord -Force | Out-Null

  New-Item -Path $desktopNamespacePath -Force | Out-Null
  Set-RegistryDefaultValue -Path $desktopNamespacePath -Value "FileInNOut"
  New-Item -Path $myComputerNamespacePath -Force | Out-Null
  Set-RegistryDefaultValue -Path $myComputerNamespacePath -Value "FileInNOut"
  New-Item -Path $hideDesktopIconPath -Force | Out-Null
  New-ItemProperty -Path $hideDesktopIconPath -Name $Guid -Value 1 -PropertyType DWord -Force | Out-Null
}

function Register-FileInNOutShellSyncRoot {
  param(
    [string]$Guid,
    [string]$TargetPath,
    [string]$IconPath = "",
    [string]$AccountId = "default"
  )

  if ([string]::IsNullOrWhiteSpace($TargetPath)) {
    return
  }

  try {
    $resolvedTarget = (Resolve-Path -LiteralPath $TargetPath).Path
    $sid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    $safeAccount = ([string]$AccountId).Trim()
    if (-not $safeAccount) {
      $safeAccount = "default"
    }
    $safeAccount = ($safeAccount -replace '[\\/:*?"<>|!]', '_')
    $syncRootId = "FileInNOut!$sid!$safeAccount"
    $syncRootManagerPath = "HKLM:\Software\Microsoft\Windows\CurrentVersion\Explorer\SyncRootManager\$syncRootId"
    $userSyncRootsPath = Join-Path $syncRootManagerPath "UserSyncRoots"
    $iconValue = if ($IconPath -and (Test-Path -LiteralPath $IconPath)) { "$IconPath,0" } else { "%SystemRoot%\System32\shell32.dll,3" }

    New-Item -Path $syncRootManagerPath -Force | Out-Null
    New-ItemProperty -Path $syncRootManagerPath -Name "DisplayNameResource" -Value "FileInNOut" -PropertyType String -Force | Out-Null
    New-ItemProperty -Path $syncRootManagerPath -Name "IconResource" -Value $iconValue -PropertyType ExpandString -Force | Out-Null
    New-ItemProperty -Path $syncRootManagerPath -Name "NamespaceCLSID" -Value $Guid -PropertyType String -Force | Out-Null
    New-Item -Path $userSyncRootsPath -Force | Out-Null
    New-ItemProperty -Path $userSyncRootsPath -Name $sid -Value $resolvedTarget -PropertyType ExpandString -Force | Out-Null
    Write-Host "Registered Shell sync root provider: $syncRootId"
  } catch {
    Write-Warning "Shell sync root provider registration was skipped: $($_.Exception.Message)"
  }
}

function New-FileInNOutContextAction {
  param(
    [string]$ParentPath,
    [string]$ActionKey,
    [string]$Label,
    [string]$Action,
    [string]$TargetPlaceholder,
    [string]$IconPath = ""
  )

  $actionPath = Join-Path (Join-Path $ParentPath "shell") $ActionKey
  $commandPath = Join-Path $actionPath "command"
  $iconValue = if ($IconPath -and (Test-Path -LiteralPath $IconPath)) { "$IconPath,0" } else { "" }

  New-FileInNOutRegistryKey -Path $actionPath
  Set-FileInNOutRegistryValue -Path $actionPath -Name "MUIVerb" -Value $Label
  if ($iconValue) {
    Set-FileInNOutRegistryValue -Path $actionPath -Name "Icon" -Value $iconValue
  }

  New-FileInNOutRegistryKey -Path $commandPath
  Set-RegistryDefaultValue -Path $commandPath -Value "wscript.exe `"$contextHidden`" $Action `"$TargetPlaceholder`""
}

function Register-FileInNOutContextMenuRoot {
  param(
    [string]$RootPath,
    [string]$TargetPlaceholder,
    [string]$IconPath = ""
  )

  $iconValue = if ($IconPath -and (Test-Path -LiteralPath $IconPath)) { "$IconPath,0" } else { "" }
  New-FileInNOutRegistryKey -Path $RootPath
  Set-FileInNOutRegistryValue -Path $RootPath -Name "MUIVerb" -Value "FileInNOut"
  Set-FileInNOutRegistryValue -Path $RootPath -Name "SubCommands" -Value ""
  Set-FileInNOutRegistryValue -Path $RootPath -Name "Position" -Value "Top"
  if ($iconValue) {
    Set-FileInNOutRegistryValue -Path $RootPath -Name "Icon" -Value $iconValue
  }

  New-FileInNOutContextAction -ParentPath $RootPath -ActionKey "sync" -Label (ConvertFrom-FileInNOutUtf8Base64 "7KeA6riIIOuPmeq4sO2ZlA==") -Action "sync" -TargetPlaceholder $TargetPlaceholder -IconPath $IconPath
  New-FileInNOutContextAction -ParentPath $RootPath -ActionKey "drive" -Label (ConvertFrom-FileInNOutUtf8Base64 "RmlsZUluTk91dCDrk5zrnbzsnbTruIwg7Je06riw") -Action "drive" -TargetPlaceholder $TargetPlaceholder -IconPath $IconPath
  New-FileInNOutContextAction -ParentPath $RootPath -ActionKey "open" -Label (ConvertFrom-FileInNOutUtf8Base64 "642w7Iqk7YGs7YaxIOyVsSDsl7TquLA=") -Action "app" -TargetPlaceholder $TargetPlaceholder -IconPath $IconPath
  New-FileInNOutContextAction -ParentPath $RootPath -ActionKey "web" -Label (ConvertFrom-FileInNOutUtf8Base64 "7Ju57JeQ7IScIOyXtOq4sA==") -Action "web" -TargetPlaceholder $TargetPlaceholder -IconPath $IconPath
  New-FileInNOutContextAction -ParentPath $RootPath -ActionKey "copy-link" -Label (ConvertFrom-FileInNOutUtf8Base64 "66eB7YGsIOuzteyCrA==") -Action "copy-link" -TargetPlaceholder $TargetPlaceholder -IconPath $IconPath
  New-FileInNOutContextAction -ParentPath $RootPath -ActionKey "share" -Label (ConvertFrom-FileInNOutUtf8Base64 "6rO17JygLi4u") -Action "share" -TargetPlaceholder $TargetPlaceholder -IconPath $IconPath
  New-FileInNOutContextAction -ParentPath $RootPath -ActionKey "add-sync-folder" -Label (ConvertFrom-FileInNOutUtf8Base64 "64+Z6riw7ZmUIO2PtOuNlCDstpTqsIA=") -Action "add-sync-folder" -TargetPlaceholder $TargetPlaceholder -IconPath $IconPath
  New-FileInNOutContextAction -ParentPath $RootPath -ActionKey "status" -Label (ConvertFrom-FileInNOutUtf8Base64 "64+Z6riw7ZmUIOyDge2DnCDtmZXsnbg=") -Action "status" -TargetPlaceholder $TargetPlaceholder -IconPath $IconPath
}

function Register-FileInNOutContextMenus {
  param([string]$IconPath = "")

  Register-FileInNOutContextMenuRoot -RootPath "HKCU:\Software\Classes\Directory\shell\FileInNOut" -TargetPlaceholder "%1" -IconPath $IconPath
  Register-FileInNOutContextMenuRoot -RootPath "HKCU:\Software\Classes\Directory\Background\shell\FileInNOut" -TargetPlaceholder "%V" -IconPath $IconPath
  Register-FileInNOutContextMenuRoot -RootPath "HKCU:\Software\Classes\Drive\shell\FileInNOut" -TargetPlaceholder "%1" -IconPath $IconPath
  Register-FileInNOutContextMenuRoot -RootPath "HKCU:\Software\Classes\*\shell\FileInNOut" -TargetPlaceholder "%1" -IconPath $IconPath
}

function Register-FileInNOutUrlProtocol {
  param(
    [string]$CmdPath,
    [string]$IconPath = ""
  )

  if ([string]::IsNullOrWhiteSpace($CmdPath)) {
    return
  }

  $protocolPath = "HKCU:\Software\Classes\fileinnout"
  $defaultIconPath = Join-Path $protocolPath "DefaultIcon"
  $commandPath = Join-Path $protocolPath "shell\open\command"
  $iconValue = if ($IconPath -and (Test-Path -LiteralPath $IconPath)) { "$IconPath,0" } else { "$CmdPath,0" }

  New-FileInNOutRegistryKey -Path $protocolPath
  Set-RegistryDefaultValue -Path $protocolPath -Value "URL:FileInNOut shared folder"
  Set-FileInNOutRegistryValue -Path $protocolPath -Name "URL Protocol" -Value ""

  New-FileInNOutRegistryKey -Path $defaultIconPath
  Set-RegistryDefaultValue -Path $defaultIconPath -Value $iconValue

  New-FileInNOutRegistryKey -Path $commandPath
  Set-RegistryDefaultValue -Path $commandPath -Value "`"$CmdPath`" open-address --address `"%1`""
}

function Get-FileInNOutSubstTarget {
  param([string]$Letter)

  $normalized = Normalize-FileInNOutDriveLetter $Letter
  if (-not $normalized) {
    return ""
  }

  $output = & subst 2>$null
  foreach ($line in $output) {
    if ($line -match ("^" + [regex]::Escape($normalized) + ":\\: => (.+)$")) {
      return $Matches[1].Trim()
    }
  }
  return ""
}

function Get-FileInNOutDriveLetterCandidates {
  param([string]$PreferredLetter)

  $normalized = Normalize-FileInNOutDriveLetter $PreferredLetter
  $letters = @()
  if ($normalized) {
    $letters += $normalized
    $start = [int][char]$normalized
    for ($code = $start + 1; $code -le [int][char]"Z"; $code++) {
      $letters += [string][char]$code
    }
  }
  foreach ($fallback in @("G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z")) {
    $letters += $fallback
  }
  return $letters | Where-Object { $_ -and $_ -match "^[A-Z]$" } | Select-Object -Unique
}

function Mount-FileInNOutDrive {
  param(
    [string]$Letter,
    [string]$TargetPath
  )

  $normalized = Normalize-FileInNOutDriveLetter $Letter
  if (-not $normalized -or [string]::IsNullOrWhiteSpace($TargetPath)) {
    return ""
  }

  $resolvedTarget = (Resolve-Path -LiteralPath $TargetPath).Path
  foreach ($candidate in Get-FileInNOutDriveLetterCandidates $normalized) {
    $driveName = "${candidate}:"
    $driveRoot = "${candidate}:\"
    $existingSubst = Get-FileInNOutSubstTarget $candidate

    if ($existingSubst) {
      try {
        $resolvedExisting = (Resolve-Path -LiteralPath $existingSubst).Path
      } catch {
        $resolvedExisting = $existingSubst
      }
      if ($resolvedExisting.Equals($resolvedTarget, [System.StringComparison]::OrdinalIgnoreCase)) {
        return $candidate
      }
      continue
    } elseif (Test-Path -LiteralPath $driveRoot) {
      if ($candidate -eq $normalized) {
        Write-Warning "Drive ${driveName} is already in use; trying another FileInNOut drive letter."
      }
      continue
    }

    & subst $driveName $resolvedTarget
    if ($LASTEXITCODE -eq 0) {
      return $candidate
    }
    Write-Warning "Could not map FileInNOut drive ${driveName} to $resolvedTarget."
  }
  return ""
}

function Register-FileInNOutDriveAppearance {
  param(
    [string]$Letter,
    [string]$IconPath = ""
  )

  $normalized = Normalize-FileInNOutDriveLetter $Letter
  if (-not $normalized) {
    return
  }

  $displayIcon = if ($IconPath -and (Test-Path -LiteralPath $IconPath)) { "$IconPath,0" } else { "%SystemRoot%\System32\shell32.dll,3" }
  $driveIconPath = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\DriveIcons\$normalized"
  $defaultIconPath = Join-Path $driveIconPath "DefaultIcon"
  $defaultLabelPath = Join-Path $driveIconPath "DefaultLabel"

  New-Item -Path $defaultIconPath -Force | Out-Null
  Set-RegistryDefaultValue -Path $defaultIconPath -Value $displayIcon
  New-Item -Path $defaultLabelPath -Force | Out-Null
  Set-RegistryDefaultValue -Path $defaultLabelPath -Value "FileInNOut"
}

function ConvertTo-FileInNOutDriveLinkName {
  param(
    [string]$PreferredName,
    [string]$TargetPath
  )

  $name = ([string]$PreferredName).Trim()
  if (-not $name) {
    $name = Split-Path -Leaf $TargetPath
  }
  if (-not $name) {
    $name = "Sync folder"
  }

  foreach ($invalid in [System.IO.Path]::GetInvalidFileNameChars()) {
    $name = $name.Replace([string]$invalid, "_")
  }
  $name = $name.Trim().TrimEnd(".")
  if (-not $name) {
    return "Sync folder"
  }
  return $name
}

function New-FileInNOutDriveJunction {
  param(
    [string]$RootPath,
    [string]$LinkName,
    [string]$TargetPath
  )

  $resolvedTarget = (Resolve-Path -LiteralPath $TargetPath).Path
  New-Item -ItemType Directory -Force -Path $RootPath | Out-Null
  $linkPath = Join-Path $RootPath $LinkName
  if (Test-Path -LiteralPath $linkPath) {
    $item = Get-Item -LiteralPath $linkPath -Force
    if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
      & cmd.exe /d /c rmdir "$linkPath" 2>$null
      if (Test-Path -LiteralPath $linkPath) {
        Remove-Item -LiteralPath $linkPath -Force -ErrorAction SilentlyContinue
      }
    } elseif (-not (Remove-FileInNOutEmptyHubConflictDirectory -Path $linkPath)) {
      return
    }
  }

  try {
    New-Item -ItemType Junction -Path $linkPath -Target $resolvedTarget -Force | Out-Null
  } catch {
    & cmd.exe /d /c mklink /J "$linkPath" "$resolvedTarget" | Out-Null
  }
}

function Test-FileInNOutDirectoryHasUserContent {
  param([string]$Path)

  if ([string]::IsNullOrWhiteSpace($Path) -or -not (Test-Path -LiteralPath $Path -PathType Container)) {
    return $false
  }

  try {
    foreach ($item in Get-ChildItem -LiteralPath $Path -Force -ErrorAction Stop) {
      if ($item.Name -ieq "desktop.ini") {
        continue
      }
      return $true
    }
  } catch {
    return $true
  }
  return $false
}

function Remove-FileInNOutEmptyHubConflictDirectory {
  param([string]$Path)

  if ([string]::IsNullOrWhiteSpace($Path) -or -not (Test-Path -LiteralPath $Path -PathType Container)) {
    return $false
  }

  try {
    $item = Get-Item -LiteralPath $Path -Force
    if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
      return $false
    }
    if (Test-FileInNOutDirectoryHasUserContent -Path $Path) {
      return $false
    }

    $desktopIniPath = Join-Path $Path "desktop.ini"
    if (Test-Path -LiteralPath $desktopIniPath) {
      Remove-Item -LiteralPath $desktopIniPath -Force -ErrorAction SilentlyContinue
    }
    if (Test-FileInNOutDirectoryHasUserContent -Path $Path) {
      return $false
    }
    Remove-Item -LiteralPath $Path -Force -ErrorAction Stop
    return $true
  } catch {
    return $false
  }
}

function Remove-FileInNOutLegacyDriveJunction {
  param(
    [string]$RootPath,
    [string]$LinkName
  )

  if ([string]::IsNullOrWhiteSpace($RootPath) -or [string]::IsNullOrWhiteSpace($LinkName)) {
    return
  }

  $linkPath = Join-Path $RootPath $LinkName
  if (-not (Test-Path -LiteralPath $linkPath)) {
    return
  }

  try {
    $item = Get-Item -LiteralPath $linkPath -Force
    if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
      & cmd.exe /d /c rmdir "$linkPath" 2>$null
      if (Test-Path -LiteralPath $linkPath) {
        Remove-Item -LiteralPath $linkPath -Force -ErrorAction SilentlyContinue
      }
    }
  } catch {
  }
}

function Get-FileInNOutObjectValue {
  param(
    [object]$Object,
    [string]$Name
  )

  if (-not $Object) {
    return $null
  }
  $property = $Object.PSObject.Properties[$Name]
  if ($property) {
    return $property.Value
  }
  return $null
}

function Test-FileInNOutSharedRemotePath {
  param([string]$RemotePath)

  $normalized = (([string]$RemotePath).Trim() -replace "\\", "/").Trim("/")
  return $normalized.StartsWith("Shared/", [System.StringComparison]::OrdinalIgnoreCase)
}

function Get-FileInNOutSharedRemoteParts {
  param([string]$RemotePath)

  $normalized = (([string]$RemotePath).Trim() -replace "\\", "/").Trim("/")
  if (-not $normalized.StartsWith("Shared/", [System.StringComparison]::OrdinalIgnoreCase)) {
    return @()
  }
  return @($normalized.Split("/", [System.StringSplitOptions]::RemoveEmptyEntries))
}

function Get-FileInNOutSharedOwnerLinkName {
  param([string]$RemotePath)

  $parts = Get-FileInNOutSharedRemoteParts -RemotePath $RemotePath
  if (@($parts).Count -lt 3) {
    return ""
  }
  return ConvertTo-FileInNOutDriveLinkName -PreferredName $parts[1] -TargetPath $parts[1]
}

function Get-FileInNOutSharedFolderLinkName {
  param(
    [object]$Profile
  )

  $remotePath = [string]$Profile.RemotePath
  $parts = Get-FileInNOutSharedRemoteParts -RemotePath $remotePath
  $owner = if (@($parts).Count -ge 3) { ConvertTo-FileInNOutDriveLinkName -PreferredName $parts[1] -TargetPath $parts[1] } else { "" }
  $name = ([string]$Profile.Name).Trim()
  $ownerSuffix = if ($owner) { " ($owner)" } else { "" }
  if ($ownerSuffix -and $name.EndsWith($ownerSuffix, [System.StringComparison]::OrdinalIgnoreCase)) {
    $name = $name.Substring(0, $name.Length - $ownerSuffix.Length).Trim()
  }
  $partCount = @($parts).Count
  if (-not $name -and $partCount -ge 3) {
    $name = $parts[$partCount - 1]
  }
  return ConvertTo-FileInNOutDriveLinkName -PreferredName $name -TargetPath $Profile.LocalPath
}

function Get-FileInNOutSyncFolderProfiles {
  param(
    [string]$ConfigPath,
    [string]$DefaultSyncDir
  )

  $profiles = @()
  $hasConfiguredProfiles = $false
  $config = $null
  if ($ConfigPath -and (Test-Path -LiteralPath $ConfigPath)) {
    try {
      $config = Get-Content -Raw -Path $ConfigPath | ConvertFrom-Json
    } catch {
      $config = $null
    }
  }

  $syncFolders = if ($config) { Get-FileInNOutObjectValue -Object $config -Name "syncFolders" } else { $null }
  if ($syncFolders) {
    foreach ($folder in @($syncFolders)) {
      if (-not $folder) {
        continue
      }

      $localPath = [string](Get-FileInNOutObjectValue -Object $folder -Name "localPath")
      if (-not $localPath) {
        $localPath = [string](Get-FileInNOutObjectValue -Object $folder -Name "syncDir")
      }
      $localPath = [Environment]::ExpandEnvironmentVariables($localPath.Trim())
      if (-not $localPath) {
        continue
      }

      $hasConfiguredProfiles = $true
      if (-not (Test-Path -LiteralPath $localPath)) {
        continue
      }

      $enabledValue = Get-FileInNOutObjectValue -Object $folder -Name "enabled"
      $enabled = $true
      if ($null -ne $enabledValue -and $enabledValue -eq $false) {
        $enabled = $false
      }

      $resolvedLocal = (Resolve-Path -LiteralPath $localPath).Path
      $name = [string](Get-FileInNOutObjectValue -Object $folder -Name "name")
      $remotePath = [string](Get-FileInNOutObjectValue -Object $folder -Name "remotePath")
      $profiles += [pscustomobject]@{
        Name = $name
        LocalPath = $resolvedLocal
        RemotePath = $remotePath
        Enabled = $enabled
      }
    }
  }

  if (-not $hasConfiguredProfiles) {
    $legacyDir = ""
    if ($config) {
      $legacyDir = [string](Get-FileInNOutObjectValue -Object $config -Name "syncDir")
    }
    if (-not $legacyDir) {
      $legacyDir = $DefaultSyncDir
    }
    $legacyDir = [Environment]::ExpandEnvironmentVariables(([string]$legacyDir).Trim())
    if ($legacyDir -and (Test-Path -LiteralPath $legacyDir)) {
      $legacyName = ConvertTo-FileInNOutDriveLinkName -PreferredName (Split-Path -Leaf $legacyDir) -TargetPath $legacyDir
      $profiles += [pscustomobject]@{
        Name = $legacyName
        LocalPath = (Resolve-Path -LiteralPath $legacyDir).Path
        RemotePath = $legacyName
        Enabled = $true
      }
    }
  }

  return $profiles
}

function Remove-FileInNOutStaleDriveHubLinks {
  param(
    [string]$RootPath,
    [System.Collections.Generic.Dictionary[string,string]]$DesiredLinks,
    [switch]$Recurse
  )

  if ([string]::IsNullOrWhiteSpace($RootPath) -or -not (Test-Path -LiteralPath $RootPath)) {
    return
  }

  Get-ChildItem -LiteralPath $RootPath -Directory -Force -ErrorAction SilentlyContinue | ForEach-Object {
    try {
      if (($_.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -eq 0) {
        return
      }
      if ($DesiredLinks.ContainsKey($_.FullName)) {
        return
      }
      & cmd.exe /d /c rmdir "$($_.FullName)" 2>$null
      if (Test-Path -LiteralPath $_.FullName) {
        Remove-Item -LiteralPath $_.FullName -Force -ErrorAction SilentlyContinue
      }
    } catch {
    }
  }

  if ($Recurse) {
    Get-ChildItem -LiteralPath $RootPath -Directory -Force -ErrorAction SilentlyContinue | ForEach-Object {
      try {
        if (($_.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
          return
        }
        Remove-FileInNOutStaleDriveHubLinks -RootPath $_.FullName -DesiredLinks $DesiredLinks
      } catch {
      }
    }
  }
}

function Sync-FileInNOutDriveHubLinks {
  param(
    [string]$ConfigPath,
    [string]$DriveRootDir,
    [string]$DefaultSyncDir,
    [string]$IconPath = ""
  )

  if ([string]::IsNullOrWhiteSpace($DriveRootDir)) {
    return
  }

  $myDriveHubName = ([string][char]0xB0B4) + " " + ([string][char]0xB4DC) + ([string][char]0xB77C) + ([string][char]0xC774) + ([string][char]0xBE0C)
  $sharedDriveHubName = ([string][char]0xACF5) + ([string][char]0xC720) + " " + ([string][char]0xBB38) + ([string][char]0xC11C) + ([string][char]0xD568)
  $myDriveHubDir = Join-Path $DriveRootDir $myDriveHubName
  $sharedDriveHubDir = Join-Path $DriveRootDir $sharedDriveHubName
  $driveRootInfoTip = ConvertFrom-FileInNOutUtf8Base64 "RmlsZUluTk91dCDrk5zrnbzsnbTruIwgLSDrgrQg65Oc65287J2067iM7JmAIOqzteycoCDrrLjshJztlag="
  $myDriveInfoTip = ConvertFrom-FileInNOutUtf8Base64 "64K06rCAIOuPmeq4sO2ZlO2VmOuKlCDtj7TrjZQ="
  $sharedDriveInfoTip = ConvertFrom-FileInNOutUtf8Base64 "6rO17Jyg67Cb7J2AIOuPmeq4sO2ZlCDtj7TrjZQ="
  $sharedOwnerInfoTip = ConvertFrom-FileInNOutUtf8Base64 "RmlsZUluTk91dCDqs7XsnKAg66y47ISc7ZWoIOyGjOycoOyekCDtj7TrjZQ="

  New-Item -ItemType Directory -Force -Path $DriveRootDir | Out-Null
  Set-FileInNOutExplorerFolder -Path $DriveRootDir -IconPath $IconPath -DisplayName "FileInNOut" -InfoTip $driveRootInfoTip
  New-Item -ItemType Directory -Force -Path $myDriveHubDir | Out-Null
  New-Item -ItemType Directory -Force -Path $sharedDriveHubDir | Out-Null
  Set-FileInNOutExplorerFolder -Path $myDriveHubDir -IconPath $IconPath -DisplayName $myDriveHubName -InfoTip $myDriveInfoTip
  Set-FileInNOutExplorerFolder -Path $sharedDriveHubDir -IconPath $IconPath -DisplayName $sharedDriveHubName -InfoTip $sharedDriveInfoTip

  $desired = New-Object "System.Collections.Generic.Dictionary[string,string]" ([System.StringComparer]::OrdinalIgnoreCase)
  foreach ($profile in Get-FileInNOutSyncFolderProfiles -ConfigPath $ConfigPath -DefaultSyncDir $DefaultSyncDir) {
    if (-not $profile.Enabled -or -not (Test-Path -LiteralPath $profile.LocalPath)) {
      continue
    }

    $hubDir = $myDriveHubDir
    $baseName = ConvertTo-FileInNOutDriveLinkName -PreferredName $profile.Name -TargetPath $profile.LocalPath
    if (Test-FileInNOutSharedRemotePath -RemotePath $profile.RemotePath) {
      $ownerLinkName = Get-FileInNOutSharedOwnerLinkName -RemotePath $profile.RemotePath
      $hubDir = if ($ownerLinkName) { Join-Path $sharedDriveHubDir $ownerLinkName } else { $sharedDriveHubDir }
      $baseName = Get-FileInNOutSharedFolderLinkName -Profile $profile
    }
    $uniqueName = $baseName
    $suffix = 2
    $linkPath = Join-Path $hubDir $uniqueName
    while ($desired.ContainsKey($linkPath) -and -not $desired[$linkPath].Equals($profile.LocalPath, [System.StringComparison]::OrdinalIgnoreCase)) {
      $uniqueName = "$baseName $suffix"
      $linkPath = Join-Path $hubDir $uniqueName
      $suffix += 1
    }
    $desired[$linkPath] = $profile.LocalPath
  }

  Remove-FileInNOutStaleDriveHubLinks -RootPath $DriveRootDir -DesiredLinks $desired
  Remove-FileInNOutStaleDriveHubLinks -RootPath $myDriveHubDir -DesiredLinks $desired
  Remove-FileInNOutStaleDriveHubLinks -RootPath $sharedDriveHubDir -DesiredLinks $desired -Recurse

  $trimChars = [char[]]@([System.IO.Path]::DirectorySeparatorChar, [System.IO.Path]::AltDirectorySeparatorChar)
  $normalizedSharedHubDir = [System.IO.Path]::GetFullPath($sharedDriveHubDir).TrimEnd($trimChars)
  $brandedSharedOwnerDirs = New-Object "System.Collections.Generic.HashSet[string]" ([System.StringComparer]::OrdinalIgnoreCase)
  foreach ($linkPath in $desired.Keys) {
    $linkParent = Split-Path -Parent $linkPath
    New-FileInNOutDriveJunction -RootPath $linkParent -LinkName (Split-Path -Leaf $linkPath) -TargetPath $desired[$linkPath]

    if ($linkParent) {
      $ownerParent = Split-Path -Parent $linkParent
      if ($ownerParent) {
        $normalizedOwnerParent = [System.IO.Path]::GetFullPath($ownerParent).TrimEnd($trimChars)
        if ($normalizedOwnerParent.Equals($normalizedSharedHubDir, [System.StringComparison]::OrdinalIgnoreCase)) {
          if ($brandedSharedOwnerDirs.Add($linkParent)) {
            Set-FileInNOutExplorerFolder -Path $linkParent -IconPath $IconPath -DisplayName (Split-Path -Leaf $linkParent) -InfoTip $sharedOwnerInfoTip
          }
        }
      }
    }
  }
}

function Register-FileInNOutApp {
  param(
    [string]$Path,
    [string]$InstallLocation,
    [string]$UninstallerPath,
    [string]$DisplayIcon,
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
  Set-ItemProperty -Path $Path -Name "DisplayVersion" -Value "local"
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
  param([string[]]$Arguments)

  & $cmdPath @Arguments
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
      $loginArgs += @("--password", $Password)
    }
    Invoke-FileInNOutClient $loginArgs
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
