param(
  [string]$InstallDir = "$env:LOCALAPPDATA\FileInNOutDesktop",
  [string]$SyncDir = "",
  [string]$TaskName = "FileInNOutDesktopSync",
  [string]$RegistryKeyName = "FileInNOutDesktop",
  [string]$ExplorerNamespaceGuid = "{6F4F52E8-8E6F-4B94-A14D-8B22C50C13B9}",
  [string]$DriveLetter = "",
  [string]$DriveRootDir = "",
  [switch]$RemoveConfig,
  [switch]$RemoveSyncDir
)

$ErrorActionPreference = "Stop"

function Get-FullPath {
  param([string]$Path)

  if ([string]::IsNullOrWhiteSpace($Path)) {
    return ""
  }
  if (Test-Path -LiteralPath $Path) {
    return (Resolve-Path -LiteralPath $Path).Path
  }
  return [System.IO.Path]::GetFullPath($Path)
}

function Test-SameOrUnder {
  param(
    [string]$Path,
    [string]$Parent
  )

  $fullPath = Get-FullPath $Path
  $fullParent = Get-FullPath $Parent
  if (-not $fullPath -or -not $fullParent) {
    return $false
  }

  $parentWithSlash = $fullParent.TrimEnd("\") + "\"
  return $fullPath.Equals($fullParent, [System.StringComparison]::OrdinalIgnoreCase) -or
    $fullPath.StartsWith($parentWithSlash, [System.StringComparison]::OrdinalIgnoreCase)
}

function Assert-SafeRecursiveRemoval {
  param(
    [string]$Path,
    [string]$Label
  )

  $fullPath = Get-FullPath $Path
  if ([string]::IsNullOrWhiteSpace($fullPath)) {
    throw "$Label path is empty."
  }

  $trimmed = $fullPath.TrimEnd("\")
  $root = [System.IO.Path]::GetPathRoot($fullPath).TrimEnd("\")
  if ($trimmed.Equals($root, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to remove drive root for ${Label}: $fullPath"
  }

  if ($env:USERPROFILE) {
    $profile = (Get-FullPath $env:USERPROFILE).TrimEnd("\")
    if ($trimmed.Equals($profile, [System.StringComparison]::OrdinalIgnoreCase)) {
      throw "Refusing to remove the user profile for ${Label}: $fullPath"
    }
  }

  if ($trimmed.Length -lt 10) {
    throw "Refusing to remove suspiciously short ${Label} path: $fullPath"
  }

  return $fullPath
}

function Convert-ToPowerShellLiteral {
  param([string]$Value)
  return "'" + $Value.Replace("'", "''") + "'"
}

function Start-DeferredCleanup {
  param(
    [string[]]$RemovePaths,
    [string[]]$EmptyDirs
  )

  if (-not $RemovePaths.Count -and -not $EmptyDirs.Count) {
    return
  }

  $cleanupScript = Join-Path ([System.IO.Path]::GetTempPath()) ("FileInNOutDesktopUninstall-" + [System.Guid]::NewGuid().ToString("N") + ".ps1")
  $removeLiteral = ($RemovePaths | ForEach-Object { Convert-ToPowerShellLiteral $_ }) -join ","
  $emptyLiteral = ($EmptyDirs | ForEach-Object { Convert-ToPowerShellLiteral $_ }) -join ","
  $content = @"
`$ErrorActionPreference = "SilentlyContinue"
Wait-Process -Id $PID -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 500
`$removePaths = @($removeLiteral)
foreach (`$path in `$removePaths) {
  if (Test-Path -LiteralPath `$path) {
    Remove-Item -LiteralPath `$path -Recurse -Force -ErrorAction SilentlyContinue
  }
}
`$emptyDirs = @($emptyLiteral)
foreach (`$dir in `$emptyDirs) {
  if (Test-Path -LiteralPath `$dir) {
    Remove-Item -LiteralPath `$dir -Force -ErrorAction SilentlyContinue
  }
}
Remove-Item -LiteralPath `$PSCommandPath -Force -ErrorAction SilentlyContinue
"@
  $content | Set-Content -Encoding ASCII -Path $cleanupScript
  Start-Process -FilePath "powershell" -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $cleanupScript) -WindowStyle Hidden
}

function Clear-FileInNOutExplorerFolder {
  param([string]$Path)

  if ([string]::IsNullOrWhiteSpace($Path) -or -not (Test-Path -LiteralPath $Path)) {
    return
  }

  $desktopIni = Join-Path $Path "desktop.ini"
  if (Test-Path -LiteralPath $desktopIni) {
    $shouldRemove = $false
    try {
      $content = Get-Content -Raw -Path $desktopIni -ErrorAction Stop
      $shouldRemove = $content -match "LocalizedResourceName=FileInNOut" -or
        $content -match "FileInNOutDesktop\.ico"
    } catch {
      $shouldRemove = $false
    }

    if ($shouldRemove) {
      & attrib -h -s $desktopIni 2>$null
      Remove-Item -LiteralPath $desktopIni -Force -ErrorAction SilentlyContinue
      & attrib -r -s $Path 2>$null
    }
  }
}

function Normalize-FileInNOutDriveLetter {
  param([string]$Value)

  $text = ([string]$Value).Trim().TrimEnd(":").ToUpperInvariant()
  if ($text -match '^[A-Z]$') {
    return $text
  }
  return ""
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

function Get-FileInNOutSubstMappings {
  $mappings = @()
  $output = & subst 2>$null
  foreach ($line in $output) {
    if ($line -match '^([A-Z]):\\: => (.+)$') {
      $mappings += [pscustomobject]@{
        Letter = $Matches[1]
        Target = $Matches[2].Trim()
      }
    }
  }
  return $mappings
}

function Remove-FileInNOutDriveMapping {
  param(
    [string]$Letter,
    [string]$ExpectedTarget
  )

  $normalized = Normalize-FileInNOutDriveLetter $Letter
  if (-not $normalized) {
    return
  }

  $target = Get-FileInNOutSubstTarget $normalized
  if (-not $target) {
    return
  }

  $shouldRemove = $false
  try {
    $resolvedTarget = (Resolve-Path -LiteralPath $target).Path
    $resolvedExpected = Get-FullPath $ExpectedTarget
    $shouldRemove = $resolvedExpected -and $resolvedTarget.Equals($resolvedExpected, [System.StringComparison]::OrdinalIgnoreCase)
  } catch {
    $shouldRemove = $false
  }

  if ($shouldRemove) {
    & subst "${normalized}:" /D 2>$null
  }
}

function Remove-FileInNOutDriveMappingsForTarget {
  param(
    [string]$ExpectedTarget,
    [string]$PreferredLetter = ""
  )

  $removed = @()
  $normalizedPreferred = Normalize-FileInNOutDriveLetter $PreferredLetter
  if ($normalizedPreferred) {
    Remove-FileInNOutDriveMapping -Letter $normalizedPreferred -ExpectedTarget $ExpectedTarget
    if (-not (Get-FileInNOutSubstTarget $normalizedPreferred)) {
      $removed += $normalizedPreferred
    }
  }

  $resolvedExpected = Get-FullPath $ExpectedTarget
  if (-not $resolvedExpected) {
    return $removed | Select-Object -Unique
  }

  foreach ($mapping in Get-FileInNOutSubstMappings) {
    $letter = Normalize-FileInNOutDriveLetter $mapping.Letter
    if (-not $letter -or ($normalizedPreferred -and $letter -eq $normalizedPreferred)) {
      continue
    }

    try {
      $resolvedTarget = (Resolve-Path -LiteralPath $mapping.Target).Path
      if ($resolvedTarget.Equals($resolvedExpected, [System.StringComparison]::OrdinalIgnoreCase)) {
        & subst "${letter}:" /D 2>$null
        $removed += $letter
      }
    } catch {
    }
  }

  return $removed | Select-Object -Unique
}

function Remove-FileInNOutDriveAppearance {
  param([string]$Letter)

  $normalized = Normalize-FileInNOutDriveLetter $Letter
  if (-not $normalized) {
    return
  }

  $driveIconPath = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\DriveIcons\$normalized"
  if (-not (Test-Path -LiteralPath $driveIconPath)) {
    return
  }

  $shouldRemove = $false
  try {
    $labelPath = Join-Path $driveIconPath "DefaultLabel"
    if (Test-Path -LiteralPath $labelPath) {
      $label = (Get-Item -LiteralPath $labelPath).GetValue("")
      if ([string]$label -eq "FileInNOut") {
        $shouldRemove = $true
      }
    }
    $iconPath = Join-Path $driveIconPath "DefaultIcon"
    if (Test-Path -LiteralPath $iconPath) {
      $icon = [string]((Get-Item -LiteralPath $iconPath).GetValue(""))
      if ($icon -match "FileInNOutDesktop\.ico") {
        $shouldRemove = $true
      }
    }
  } catch {
    $shouldRemove = $false
  }

  if ($shouldRemove) {
    Remove-Item -LiteralPath $driveIconPath -Recurse -Force -ErrorAction SilentlyContinue
  }
}

function Remove-FileInNOutShellSyncRootRegistrations {
  try {
    $sid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    $basePath = "HKLM:\Software\Microsoft\Windows\CurrentVersion\Explorer\SyncRootManager"
    if (-not (Test-Path -LiteralPath $basePath)) {
      return
    }

    Get-ChildItem -LiteralPath $basePath -ErrorAction SilentlyContinue |
      Where-Object { $_.PSChildName -like "FileInNOut!$sid!*" -or $_.PSChildName -like "FileInNOut!*" } |
      ForEach-Object {
        Remove-Item -LiteralPath $_.PSPath -Recurse -Force -ErrorAction SilentlyContinue
      }
  } catch {
    Write-Warning "Shell sync root provider cleanup was skipped: $($_.Exception.Message)"
  }
}

function Clear-FileInNOutDriveRoot {
  param([string]$Path)

  if ([string]::IsNullOrWhiteSpace($Path) -or -not (Test-Path -LiteralPath $Path)) {
    return
  }

  foreach ($child in Get-ChildItem -LiteralPath $Path -Force -ErrorAction SilentlyContinue) {
    try {
      if ($child.PSIsContainer) {
        $childItem = Get-Item -LiteralPath $child.FullName -Force -ErrorAction SilentlyContinue
        if ($childItem -and (($childItem.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0)) {
          & cmd.exe /d /c rmdir "$($child.FullName)" 2>$null
          if (Test-Path -LiteralPath $child.FullName) {
            Remove-Item -LiteralPath $child.FullName -Force -ErrorAction SilentlyContinue
          }
        } else {
          Clear-FileInNOutDriveRoot -Path $child.FullName
        }
      } else {
        & attrib -h -s -r $child.FullName 2>$null
        Remove-Item -LiteralPath $child.FullName -Force -ErrorAction SilentlyContinue
      }
    } catch {
    }
  }

  try {
    & attrib -h -s -r $Path 2>$null
    & cmd.exe /d /c rmdir "$Path" 2>$null
    if (-not (Test-Path -LiteralPath $Path)) {
      return
    }
    Remove-Item -LiteralPath $Path -Force -ErrorAction SilentlyContinue
  } catch {
  }
}

function Invoke-FileInNOutSyncRootUnregistration {
  param(
    [string]$TrayExePath,
    [string]$Path
  )

  if ([string]::IsNullOrWhiteSpace($Path) -or -not (Test-Path -LiteralPath $Path)) {
    return
  }
  if ([string]::IsNullOrWhiteSpace($TrayExePath) -or -not (Test-Path -LiteralPath $TrayExePath)) {
    return
  }

  try {
    $arguments = "--unregister-sync-root `"$Path`""
    $process = Start-Process `
      -FilePath $TrayExePath `
      -ArgumentList $arguments `
      -WorkingDirectory (Split-Path -Parent $TrayExePath) `
      -WindowStyle Hidden `
      -Wait `
      -PassThru
    if ($process.ExitCode -ne 0) {
      Write-Warning "Cloud Files sync root unregistration was skipped or failed with exit code $($process.ExitCode)."
    }
  } catch {
    Write-Warning "Cloud Files sync root unregistration was skipped: $($_.Exception.Message)"
  }
}

$configBase = if ($env:LOCALAPPDATA) { $env:LOCALAPPDATA } elseif ($env:APPDATA) { $env:APPDATA } else { $env:USERPROFILE }
$configDir = Join-Path $configBase "FileInNOutDesktop"
$configPath = Join-Path $configDir "config.json"
if (-not $DriveRootDir) {
  $DriveRootDir = Join-Path $configDir "drive-root"
}
$startMenuBase = if ($env:APPDATA) { Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs" } else { "" }
$startMenuDir = if ($startMenuBase) { Join-Path $startMenuBase "FileInNOut Desktop" } else { "" }
$startupDir = if ($env:APPDATA) { Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\Startup" } else { "" }
$startupShortcut = if ($startupDir) { Join-Path $startupDir "$TaskName.lnk" } else { "" }
$desktopDir = if ($env:FILEINNOUT_DESKTOP_DIR) { $env:FILEINNOUT_DESKTOP_DIR } else { [Environment]::GetFolderPath("DesktopDirectory") }
$desktopShortcut = if ($desktopDir) { Join-Path $desktopDir "FileInNOut Desktop.lnk" } else { "" }

if ($RegistryKeyName -match '[\\/]') {
  throw "RegistryKeyName must not contain path separators."
}
try {
  $ExplorerNamespaceGuid = "{" + ([guid]$ExplorerNamespaceGuid.Trim("{}")).ToString().ToUpperInvariant() + "}"
} catch {
  throw "ExplorerNamespaceGuid must be a valid GUID."
}

$registryPath = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\$RegistryKeyName"
$explorerClsidPath = "HKCU:\Software\Classes\CLSID\$ExplorerNamespaceGuid"
$explorerDesktopNamespacePath = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Desktop\NameSpace\$ExplorerNamespaceGuid"
$explorerMyComputerNamespacePath = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\MyComputer\NameSpace\$ExplorerNamespaceGuid"
$hideDesktopIconPath = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\HideDesktopIcons\NewStartPanel"
$contextMenuPaths = @(
  "HKCU:\Software\Classes\Directory\shell\FileInNOut",
  "HKCU:\Software\Classes\Directory\Background\shell\FileInNOut",
  "HKCU:\Software\Classes\Drive\shell\FileInNOut",
  "HKCU:\Software\Classes\*\shell\FileInNOut"
)

if (-not $SyncDir -and (Test-Path -LiteralPath $configPath)) {
  try {
    $config = Get-Content -Raw -Path $configPath | ConvertFrom-Json
    if ($config.syncDir) {
      $SyncDir = [string]$config.syncDir
    }
  } catch {
    Write-Warning "Could not read saved sync folder from $configPath"
  }
}

if (-not $SyncDir) {
  $SyncDir = "$env:USERPROFILE\FileInNOut"
}

if (-not $DriveLetter -and (Test-Path -LiteralPath $configPath)) {
  try {
    $config = Get-Content -Raw -Path $configPath | ConvertFrom-Json
    if ($config.driveLetter) {
      $DriveLetter = [string]$config.driveLetter
    }
  } catch {
  }
}
if ((-not $DriveRootDir -or $DriveRootDir -eq (Join-Path $configDir "drive-root")) -and (Test-Path -LiteralPath $configPath)) {
  try {
    $config = Get-Content -Raw -Path $configPath | ConvertFrom-Json
    if ($config.driveRoot) {
      $DriveRootDir = [string]$config.driveRoot
    }
  } catch {
  }
}
$DriveLetter = Normalize-FileInNOutDriveLetter $DriveLetter
$removedDriveLetters = @(Remove-FileInNOutDriveMappingsForTarget -ExpectedTarget $DriveRootDir -PreferredLetter $DriveLetter)
foreach ($letterToClean in @($DriveLetter) + $removedDriveLetters) {
  Remove-FileInNOutDriveAppearance -Letter $letterToClean
}

if (Get-Command Unregister-ScheduledTask -ErrorAction SilentlyContinue) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
}
if ($startupShortcut -and (Test-Path -LiteralPath $startupShortcut)) {
  Remove-Item -LiteralPath $startupShortcut -Force
}

if (Test-Path -LiteralPath $registryPath) {
  Remove-Item -LiteralPath $registryPath -Recurse -Force
}
foreach ($path in @($explorerDesktopNamespacePath, $explorerMyComputerNamespacePath, $explorerClsidPath)) {
  if (Test-Path -LiteralPath $path) {
    Remove-Item -LiteralPath $path -Recurse -Force
  }
}
if (Test-Path -LiteralPath $hideDesktopIconPath) {
  Remove-ItemProperty -Path $hideDesktopIconPath -Name $ExplorerNamespaceGuid -ErrorAction SilentlyContinue
}
Remove-FileInNOutShellSyncRootRegistrations
foreach ($path in $contextMenuPaths) {
  if (Test-Path -LiteralPath $path) {
    Remove-Item -LiteralPath $path -Recurse -Force
  }
}

$resolvedInstallDir = Get-FullPath $InstallDir
$selfPath = Get-FullPath $MyInvocation.MyCommand.Path
$deferredRemovePaths = @()
$deferredEmptyDirs = @()

if (Test-Path -LiteralPath $resolvedInstallDir) {
  Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object {
      $_.ExecutablePath -and
      $_.ExecutablePath.Equals((Join-Path $resolvedInstallDir "FileInNOutDesktop.exe"), [System.StringComparison]::OrdinalIgnoreCase)
  } |
  ForEach-Object {
    Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
  }

  Invoke-FileInNOutSyncRootUnregistration `
    -TrayExePath (Join-Path $resolvedInstallDir "FileInNOutDesktop.exe") `
    -Path $SyncDir

  $installedFiles = @(
    "FileInNOutDesktop.exe",
    "FileInNOutDesktop.ico",
    "FileInNOutDesktopTray.cs",
    "fileinnout_desktop.py",
    "fileinnout-desktop.cmd",
    "fileinnout-watch.cmd",
    "fileinnout-watch-hidden.vbs",
    "fileinnout-context.cmd",
    "fileinnout-context-hidden.vbs",
    "uninstall-windows.ps1"
  )

  foreach ($name in $installedFiles) {
    $path = Join-Path $resolvedInstallDir $name
    if (-not (Test-Path -LiteralPath $path)) {
      continue
    }
    $fullPath = Get-FullPath $path
    if ($selfPath -and $fullPath.Equals($selfPath, [System.StringComparison]::OrdinalIgnoreCase)) {
      $deferredRemovePaths += $fullPath
      continue
    }
    Remove-Item -LiteralPath $fullPath -Force
  }

  $deferredEmptyDirs += $resolvedInstallDir
}

if ($startMenuDir -and (Test-Path -LiteralPath $startMenuDir)) {
  $resolvedStartMenuDir = Assert-SafeRecursiveRemoval $startMenuDir "start menu shortcut directory"
  $resolvedStartMenuBase = Get-FullPath $startMenuBase
  if (-not (Test-SameOrUnder $resolvedStartMenuDir $resolvedStartMenuBase)) {
    throw "Refusing to remove start menu folder outside Programs: $resolvedStartMenuDir"
  }
  Remove-Item -LiteralPath $resolvedStartMenuDir -Recurse -Force
}

if ($desktopShortcut -and (Test-Path -LiteralPath $desktopShortcut)) {
  Remove-Item -LiteralPath $desktopShortcut -Force
}

if ($RemoveSyncDir) {
  $resolvedSyncDir = Assert-SafeRecursiveRemoval $SyncDir "sync directory"
  $statePath = Join-Path $resolvedSyncDir ".fileinnout\state.json"
  if (-not (Test-Path -LiteralPath $statePath)) {
    throw "Refusing to remove sync directory without .fileinnout\state.json: $resolvedSyncDir"
  }
  Remove-Item -LiteralPath $resolvedSyncDir -Recurse -Force
} else {
  Clear-FileInNOutExplorerFolder -Path $SyncDir
}

if ($DriveRootDir -and (Test-Path -LiteralPath $DriveRootDir)) {
  $resolvedDriveRootDir = Assert-SafeRecursiveRemoval $DriveRootDir "drive root directory"
  if (Test-SameOrUnder $resolvedDriveRootDir $configDir) {
    Clear-FileInNOutDriveRoot -Path $resolvedDriveRootDir
  }
}

if ($RemoveConfig) {
  $resolvedConfigDir = Assert-SafeRecursiveRemoval $configDir "config directory"
  if (Test-SameOrUnder $selfPath $resolvedConfigDir) {
    $deferredRemovePaths += $resolvedConfigDir
  } elseif (Test-Path -LiteralPath $resolvedConfigDir) {
    Remove-Item -LiteralPath $resolvedConfigDir -Recurse -Force
  }
}

Start-DeferredCleanup -RemovePaths $deferredRemovePaths -EmptyDirs $deferredEmptyDirs

Write-Host "Uninstalled FileInNOut Desktop client from $resolvedInstallDir"
Write-Host "Removed startup task if present: $TaskName"
if ($startupShortcut) {
  Write-Host "Removed startup shortcut if present: $startupShortcut"
}
Write-Host "Removed installed-app registration if present: $registryPath"
Write-Host "Removed Explorer namespace if present: $ExplorerNamespaceGuid"
Write-Host "Removed Explorer context menus if present"
if ($DriveLetter) {
  Write-Host "Removed drive mapping if present: ${DriveLetter}:\"
}
if ($DriveRootDir) {
  Write-Host "Removed drive root if present: $DriveRootDir"
}
if ($startMenuDir) {
  Write-Host "Removed Start Menu shortcuts if present: $startMenuDir"
}
if ($desktopShortcut) {
  Write-Host "Removed desktop shortcut if present: $desktopShortcut"
}
if ($RemoveSyncDir) {
  Write-Host "Removed sync folder: $SyncDir"
} else {
  Write-Host "Kept sync folder: $SyncDir"
}
if ($RemoveConfig) {
  Write-Host "Removed config folder: $configDir"
} else {
  Write-Host "Kept config folder: $configDir"
}
