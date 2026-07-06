# FileInNOut Desktop installer shell, Explorer, registry, shortcut, and URL protocol helpers.
# Dot-sourced by install-windows.ps1 after the context menu runner scripts are created.
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
