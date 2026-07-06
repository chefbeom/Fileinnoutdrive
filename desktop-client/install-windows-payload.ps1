function Install-FileInNOutPayloadFiles {
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
  if (-not (Test-Path -LiteralPath $trayIconSource)) {
    $trayIconSource = Join-Path $InstallDir "FileInNOutDesktop.ico"
    New-FileInNOutIcon -Path $trayIconSource
  }
  # Generated fallback icon for source installs.
  Copy-Item -Force -Path $clientSource -Destination (Join-Path $InstallDir "fileinnout_desktop.py")
  if (Test-Path -LiteralPath $clientConstantsSource) {
    Copy-Item -Force -Path $clientConstantsSource -Destination (Join-Path $InstallDir "fileinnout_desktop_constants.py")
  }
  if (Test-Path -LiteralPath $clientModelsSource) {
    Copy-Item -Force -Path $clientModelsSource -Destination (Join-Path $InstallDir "fileinnout_desktop_models.py")
  }
  if (Test-Path -LiteralPath $clientPathsSource) {
    Copy-Item -Force -Path $clientPathsSource -Destination (Join-Path $InstallDir "fileinnout_desktop_paths.py")
  }
  if (Test-Path -LiteralPath $clientApiSource) {
    Copy-Item -Force -Path $clientApiSource -Destination (Join-Path $InstallDir "fileinnout_desktop_api.py")
  }
  if (Test-Path -LiteralPath $clientSecuritySource) {
    Copy-Item -Force -Path $clientSecuritySource -Destination (Join-Path $InstallDir "fileinnout_desktop_security.py")
  }
  if (Test-Path -LiteralPath $clientWindowsSource) {
    Copy-Item -Force -Path $clientWindowsSource -Destination (Join-Path $InstallDir "fileinnout_desktop_windows.py")
  }
  if (Test-Path -LiteralPath $clientStateSource) {
    Copy-Item -Force -Path $clientStateSource -Destination (Join-Path $InstallDir "fileinnout_desktop_state.py")
  }
  if (Test-Path -LiteralPath $clientConfigSource) {
    Copy-Item -Force -Path $clientConfigSource -Destination (Join-Path $InstallDir "fileinnout_desktop_config.py")
  }
  if (Test-Path -LiteralPath $clientFilesSource) {
    Copy-Item -Force -Path $clientFilesSource -Destination (Join-Path $InstallDir "fileinnout_desktop_files.py")
  }
  if (Test-Path -LiteralPath $clientRemoteSource) {
    Copy-Item -Force -Path $clientRemoteSource -Destination (Join-Path $InstallDir "fileinnout_desktop_remote.py")
  }
  if (Test-Path -LiteralPath $clientWebSource) {
    Copy-Item -Force -Path $clientWebSource -Destination (Join-Path $InstallDir "fileinnout_desktop_web.py")
  }
  if (Test-Path -LiteralPath $clientDriveSource) {
    Copy-Item -Force -Path $clientDriveSource -Destination (Join-Path $InstallDir "fileinnout_desktop_drive.py")
  }
  if (Test-Path -LiteralPath $clientDriveHubSource) {
    Copy-Item -Force -Path $clientDriveHubSource -Destination (Join-Path $InstallDir "fileinnout_desktop_drive_hub.py")
  }
  if (Test-Path -LiteralPath $clientProfilesSource) {
    Copy-Item -Force -Path $clientProfilesSource -Destination (Join-Path $InstallDir "fileinnout_desktop_profiles.py")
  }
  if (Test-Path -LiteralPath $clientDiagnosticsSource) {
    Copy-Item -Force -Path $clientDiagnosticsSource -Destination (Join-Path $InstallDir "fileinnout_desktop_diagnostics.py")
  }
  if (Test-Path -LiteralPath $clientSharingSource) {
    Copy-Item -Force -Path $clientSharingSource -Destination (Join-Path $InstallDir "fileinnout_desktop_sharing.py")
  }
  if (Test-Path -LiteralPath $clientSyncSource) {
    Copy-Item -Force -Path $clientSyncSource -Destination (Join-Path $InstallDir "fileinnout_desktop_sync.py")
  }
  if (Test-Path -LiteralPath $clientParserSource) {
    Copy-Item -Force -Path $clientParserSource -Destination (Join-Path $InstallDir "fileinnout_desktop_parser.py")
  }
  if (Test-Path -LiteralPath $clientAccountCommandsSource) {
    Copy-Item -Force -Path $clientAccountCommandsSource -Destination (Join-Path $InstallDir "fileinnout_desktop_account_commands.py")
  }
  if (Test-Path -LiteralPath $clientStatusCommandsSource) {
    Copy-Item -Force -Path $clientStatusCommandsSource -Destination (Join-Path $InstallDir "fileinnout_desktop_status_commands.py")
  }
  if (Test-Path -LiteralPath $clientShareCommandsSource) {
    Copy-Item -Force -Path $clientShareCommandsSource -Destination (Join-Path $InstallDir "fileinnout_desktop_share_commands.py")
  }
  if (Test-Path -LiteralPath $clientSyncLocalSource) {
    Copy-Item -Force -Path $clientSyncLocalSource -Destination (Join-Path $InstallDir "fileinnout_desktop_sync_local.py")
  }
  if (Test-Path -LiteralPath $clientSyncSharedSource) {
    Copy-Item -Force -Path $clientSyncSharedSource -Destination (Join-Path $InstallDir "fileinnout_desktop_sync_shared.py")
  }
  if (Test-Path -LiteralPath $clientSyncMovesSource) {
    Copy-Item -Force -Path $clientSyncMovesSource -Destination (Join-Path $InstallDir "fileinnout_desktop_sync_moves.py")
  }
  if (Test-Path -LiteralPath $clientDriveAdoptionSource) {
    Copy-Item -Force -Path $clientDriveAdoptionSource -Destination (Join-Path $InstallDir "fileinnout_desktop_drive_adoption.py")
  }
  Copy-Item -Force -Path $uninstallerSource -Destination (Join-Path $InstallDir "uninstall-windows.ps1")
  if (Test-Path -LiteralPath $packageManifestSource) {
    Copy-Item -Force -Path $packageManifestSource -Destination (Join-Path $InstallDir "manifest.json")
  }
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
        "/reference:System.Security.dll",
        "/reference:System.Web.Extensions.dll"
      )
      if (Test-Path -LiteralPath $trayIconSource) {
        $trayBuildArgs += "/win32icon:$trayIconSource"
      }
      if (Test-Path -LiteralPath $desktopProgramSource) {
        $trayBuildArgs += $desktopProgramSource
      }
      $trayBuildArgs += $traySource
      if (Test-Path -LiteralPath $desktopTrayControllerActionsSource) {
        $trayBuildArgs += $desktopTrayControllerActionsSource
      }
      if (Test-Path -LiteralPath $settingsFormSource) {
        $trayBuildArgs += $settingsFormSource
      }
      if (Test-Path -LiteralPath $settingsFormActionsSource) {
        $trayBuildArgs += $settingsFormActionsSource
      }
      if (Test-Path -LiteralPath $desktopUiControlsSource) {
        $trayBuildArgs += $desktopUiControlsSource
      }
      if (Test-Path -LiteralPath $desktopTrayMenuSource) {
        $trayBuildArgs += $desktopTrayMenuSource
      }
      if (Test-Path -LiteralPath $desktopTrayVisualsSource) {
        $trayBuildArgs += $desktopTrayVisualsSource
      }
      if (Test-Path -LiteralPath $desktopSettingsTextSource) {
        $trayBuildArgs += $desktopSettingsTextSource
      }
      if (Test-Path -LiteralPath $desktopSettingsDialogTextSource) {
        $trayBuildArgs += $desktopSettingsDialogTextSource
      }
      if (Test-Path -LiteralPath $desktopModelsSource) {
        $trayBuildArgs += $desktopModelsSource
      }
      if (Test-Path -LiteralPath $desktopSyncTextSource) {
        $trayBuildArgs += $desktopSyncTextSource
      }
      if (Test-Path -LiteralPath $desktopUpdateServiceSource) {
        $trayBuildArgs += $desktopUpdateServiceSource
      }
      if (Test-Path -LiteralPath $desktopExplorerTextSource) {
        $trayBuildArgs += $desktopExplorerTextSource
      }
      if (Test-Path -LiteralPath $desktopExplorerBrandingSource) {
        $trayBuildArgs += $desktopExplorerBrandingSource
      }
      if (Test-Path -LiteralPath $desktopExplorerNamespaceSource) {
        $trayBuildArgs += $desktopExplorerNamespaceSource
      }
      if (Test-Path -LiteralPath $desktopDriveHubLinksSource) {
        $trayBuildArgs += $desktopDriveHubLinksSource
      }
      if (Test-Path -LiteralPath $desktopDriveHubMaintenanceSource) {
        $trayBuildArgs += $desktopDriveHubMaintenanceSource
      }
      if (Test-Path -LiteralPath $desktopDriveMappingSource) {
        $trayBuildArgs += $desktopDriveMappingSource
      }
  if (Test-Path -LiteralPath $desktopProcessRunnerSource) {
        $trayBuildArgs += $desktopProcessRunnerSource
      }
      if (Test-Path -LiteralPath $desktopPathRulesSource) {
        $trayBuildArgs += $desktopPathRulesSource
      }
      if (Test-Path -LiteralPath $desktopDataReaderSource) {
        $trayBuildArgs += $desktopDataReaderSource
      }
      if (Test-Path -LiteralPath $desktopTrayConfigStoreSource) {
        $trayBuildArgs += $desktopTrayConfigStoreSource
      }
      if (Test-Path -LiteralPath $desktopTrayPreferencesSource) {
        $trayBuildArgs += $desktopTrayPreferencesSource
      }
      if (Test-Path -LiteralPath $desktopFolderProfileRulesSource) {
        $trayBuildArgs += $desktopFolderProfileRulesSource
      }
      if (Test-Path -LiteralPath $desktopFileSearchSource) {
        $trayBuildArgs += $desktopFileSearchSource
      }
      if (Test-Path -LiteralPath $desktopSearchServiceSource) {
        $trayBuildArgs += $desktopSearchServiceSource
      }
      if (Test-Path -LiteralPath $desktopSyncStateSource) {
        $trayBuildArgs += $desktopSyncStateSource
      }
      if (Test-Path -LiteralPath $desktopChangeTrackerSource) {
        $trayBuildArgs += $desktopChangeTrackerSource
      }
      if (Test-Path -LiteralPath $desktopSyncCommandRunnerSource) {
        $trayBuildArgs += $desktopSyncCommandRunnerSource
      }
      if (Test-Path -LiteralPath $explorerDriveLauncherSource) {
        $trayBuildArgs += $explorerDriveLauncherSource
      }
      if (Test-Path -LiteralPath $cloudFilesIntegrationSource) {
        $trayBuildArgs += $cloudFilesIntegrationSource
      }
      & $csc @trayBuildArgs
      if ($LASTEXITCODE -ne 0) {
        Write-Warning "Could not build FileInNOutDesktop.exe; command-line shortcuts will still be installed."
      }
    } else {
      Write-Warning "C# compiler was not found; command-line shortcuts will still be installed."
    }
  }
  if (Test-Path -LiteralPath $trayIconSource) {
    $trayIconDestination = Join-Path $InstallDir "FileInNOutDesktop.ico"
    if (-not ([System.IO.Path]::GetFullPath($trayIconSource).Equals([System.IO.Path]::GetFullPath($trayIconDestination), [System.StringComparison]::OrdinalIgnoreCase))) {
      Copy-Item -Force -Path $trayIconSource -Destination $trayIconDestination
    }
  }
  if (Test-Path -LiteralPath $desktopProgramSource) {
    Copy-Item -Force -Path $desktopProgramSource -Destination (Join-Path $InstallDir "DesktopProgram.cs")
  }
  if (Test-Path -LiteralPath $traySource) {
    Copy-Item -Force -Path $traySource -Destination (Join-Path $InstallDir "FileInNOutDesktopTray.cs")
  }
  if (Test-Path -LiteralPath $desktopTrayControllerActionsSource) {
    Copy-Item -Force -Path $desktopTrayControllerActionsSource -Destination (Join-Path $InstallDir "DesktopTrayControllerActions.cs")
  }
  if (Test-Path -LiteralPath $settingsFormSource) {
    Copy-Item -Force -Path $settingsFormSource -Destination (Join-Path $InstallDir "SettingsForm.cs")
  }
  if (Test-Path -LiteralPath $settingsFormActionsSource) {
    Copy-Item -Force -Path $settingsFormActionsSource -Destination (Join-Path $InstallDir "SettingsFormActions.cs")
  }
  if (Test-Path -LiteralPath $desktopUiControlsSource) {
    Copy-Item -Force -Path $desktopUiControlsSource -Destination (Join-Path $InstallDir "DesktopUiControls.cs")
  }
  if (Test-Path -LiteralPath $desktopTrayMenuSource) {
    Copy-Item -Force -Path $desktopTrayMenuSource -Destination (Join-Path $InstallDir "DesktopTrayMenu.cs")
  }
  if (Test-Path -LiteralPath $desktopTrayVisualsSource) {
    Copy-Item -Force -Path $desktopTrayVisualsSource -Destination (Join-Path $InstallDir "DesktopTrayVisuals.cs")
  }
  if (Test-Path -LiteralPath $desktopSettingsTextSource) {
    Copy-Item -Force -Path $desktopSettingsTextSource -Destination (Join-Path $InstallDir "DesktopSettingsText.cs")
  }
  if (Test-Path -LiteralPath $desktopSettingsDialogTextSource) {
    Copy-Item -Force -Path $desktopSettingsDialogTextSource -Destination (Join-Path $InstallDir "DesktopSettingsDialogText.cs")
  }
  if (Test-Path -LiteralPath $desktopModelsSource) {
    Copy-Item -Force -Path $desktopModelsSource -Destination (Join-Path $InstallDir "DesktopModels.cs")
  }
  if (Test-Path -LiteralPath $desktopSyncTextSource) {
    Copy-Item -Force -Path $desktopSyncTextSource -Destination (Join-Path $InstallDir "DesktopSyncText.cs")
  }
  if (Test-Path -LiteralPath $desktopUpdateServiceSource) {
    Copy-Item -Force -Path $desktopUpdateServiceSource -Destination (Join-Path $InstallDir "DesktopUpdateService.cs")
  }
  if (Test-Path -LiteralPath $desktopExplorerTextSource) {
    Copy-Item -Force -Path $desktopExplorerTextSource -Destination (Join-Path $InstallDir "DesktopExplorerText.cs")
  }
  if (Test-Path -LiteralPath $desktopExplorerBrandingSource) {
    Copy-Item -Force -Path $desktopExplorerBrandingSource -Destination (Join-Path $InstallDir "DesktopExplorerBranding.cs")
  }
  if (Test-Path -LiteralPath $desktopExplorerNamespaceSource) {
    Copy-Item -Force -Path $desktopExplorerNamespaceSource -Destination (Join-Path $InstallDir "DesktopExplorerNamespace.cs")
  }
  if (Test-Path -LiteralPath $desktopDriveHubLinksSource) {
    Copy-Item -Force -Path $desktopDriveHubLinksSource -Destination (Join-Path $InstallDir "DesktopDriveHubLinks.cs")
  }
  if (Test-Path -LiteralPath $desktopDriveHubMaintenanceSource) {
    Copy-Item -Force -Path $desktopDriveHubMaintenanceSource -Destination (Join-Path $InstallDir "DesktopDriveHubMaintenance.cs")
  }
  if (Test-Path -LiteralPath $desktopDriveMappingSource) {
    Copy-Item -Force -Path $desktopDriveMappingSource -Destination (Join-Path $InstallDir "DesktopDriveMapping.cs")
  }
  if (Test-Path -LiteralPath $desktopProcessRunnerSource) {
    Copy-Item -Force -Path $desktopProcessRunnerSource -Destination (Join-Path $InstallDir "DesktopProcessRunner.cs")
  }
  if (Test-Path -LiteralPath $desktopPathRulesSource) {
    Copy-Item -Force -Path $desktopPathRulesSource -Destination (Join-Path $InstallDir "DesktopPathRules.cs")
  }
  if (Test-Path -LiteralPath $desktopDataReaderSource) {
    Copy-Item -Force -Path $desktopDataReaderSource -Destination (Join-Path $InstallDir "DesktopDataReader.cs")
  }
  if (Test-Path -LiteralPath $desktopTrayConfigStoreSource) {
    Copy-Item -Force -Path $desktopTrayConfigStoreSource -Destination (Join-Path $InstallDir "DesktopTrayConfigStore.cs")
  }
  if (Test-Path -LiteralPath $desktopTrayPreferencesSource) {
    Copy-Item -Force -Path $desktopTrayPreferencesSource -Destination (Join-Path $InstallDir "DesktopTrayPreferences.cs")
  }
  if (Test-Path -LiteralPath $desktopFolderProfileRulesSource) {
    Copy-Item -Force -Path $desktopFolderProfileRulesSource -Destination (Join-Path $InstallDir "DesktopFolderProfileRules.cs")
  }
  if (Test-Path -LiteralPath $desktopFileSearchSource) {
    Copy-Item -Force -Path $desktopFileSearchSource -Destination (Join-Path $InstallDir "DesktopFileSearch.cs")
  }
  if (Test-Path -LiteralPath $desktopSearchServiceSource) {
    Copy-Item -Force -Path $desktopSearchServiceSource -Destination (Join-Path $InstallDir "DesktopSearchService.cs")
  }
  if (Test-Path -LiteralPath $desktopSyncStateSource) {
    Copy-Item -Force -Path $desktopSyncStateSource -Destination (Join-Path $InstallDir "DesktopSyncState.cs")
  }
  if (Test-Path -LiteralPath $desktopChangeTrackerSource) {
    Copy-Item -Force -Path $desktopChangeTrackerSource -Destination (Join-Path $InstallDir "DesktopChangeTracker.cs")
  }
  if (Test-Path -LiteralPath $desktopSyncCommandRunnerSource) {
    Copy-Item -Force -Path $desktopSyncCommandRunnerSource -Destination (Join-Path $InstallDir "DesktopSyncCommandRunner.cs")
  }
  if (Test-Path -LiteralPath $explorerDriveLauncherSource) {
    Copy-Item -Force -Path $explorerDriveLauncherSource -Destination (Join-Path $InstallDir "ExplorerDriveLauncher.cs")
  }
  if (Test-Path -LiteralPath $cloudFilesIntegrationSource) {
    Copy-Item -Force -Path $cloudFilesIntegrationSource -Destination (Join-Path $InstallDir "CloudFilesIntegration.cs")
  }
}