# FileInNOut Desktop installer drive mapping and drive hub helpers.
# Dot-sourced by install-windows.ps1 after the shared registry and Explorer helpers are defined.
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
