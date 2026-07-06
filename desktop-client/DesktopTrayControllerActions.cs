using System;
using System.Collections.Generic;
using System.IO;
using System.Threading;
using System.Windows.Forms;

namespace FileInNOutDesktop
{
    internal sealed partial class TrayController
    {
        public void ToggleAutoSync()
        {
            if (UseKoreanLabels())
            {
                ToggleAutoSyncKorean();
                return;
            }
            ApplyAutoSyncToggle();
        }

        public void SetNotifications(bool enabled)
        {
            notificationsEnabled = enabled;
            SaveTrayConfig();
            notifyIcon.ContextMenuStrip = BuildMenu();
        }

        private void ToggleAutoSyncKorean()
        {
            ApplyAutoSyncToggle();
        }

        private void ApplyAutoSyncToggle()
        {
            autoSyncEnabled = !autoSyncEnabled;
            SaveTrayConfig();
            notifyIcon.ContextMenuStrip = BuildMenu();
            lastStatus = DesktopSyncText.AutoSyncToggleStatus(autoSyncEnabled);
            lastOutput = DesktopSyncText.AutoSyncToggleOutput(autoSyncEnabled);
            UpdateSettingsForm(false);
            ShowNotification(
                DesktopSyncText.AutoSyncToggleNotificationTitle(),
                DesktopSyncText.AutoSyncToggleNotificationBody(autoSyncEnabled),
                ToolTipIcon.Info);
        }

        private CommandResult RunLoginCommand(string server, string email, string password)
        {
            string args = "login --server " + DesktopProcessRunner.Quote(server) + " --email " + DesktopProcessRunner.Quote(email.Trim());
            if (!String.IsNullOrEmpty(password))
            {
                return RunCommand(args + " --password-stdin", password);
            }
            return RunCommand(args);
        }

        private void LoginKorean(string email, string password)
        {
            if (String.IsNullOrWhiteSpace(email))
            {
                throw new InvalidOperationException("\uC774\uBA54\uC77C\uC744 \uC785\uB825\uD558\uC138\uC694.");
            }

            DesktopConfig config = LoadDesktopConfig();
            string server = String.IsNullOrWhiteSpace(config.Server) ? DefaultServer : config.Server;
            CommandResult result = RunLoginCommand(server, email, password);
            if (result.ExitCode != 0)
            {
                throw new InvalidOperationException(result.Output);
            }

            config = LoadDesktopConfig();
            config.Server = server.TrimEnd('/');
            config.Email = email.Trim();
            DesktopFolderProfileRules.EnsureDefaultFolder(config);
            SaveDesktopConfig(config);

            lastStatus = email.Trim() + " \uACC4\uC815\uC73C\uB85C \uB85C\uADF8\uC778\uB428";
            lastOutput = result.Output;
            ShowNotification("\uB85C\uADF8\uC778 \uC644\uB8CC", email.Trim() + " \uACC4\uC815\uC73C\uB85C \uB85C\uADF8\uC778\uD588\uC2B5\uB2C8\uB2E4.", ToolTipIcon.Info);
        }

        private void LogoutKorean()
        {
            CommandResult result = RunCommand("logout");
            DesktopConfig config = LoadDesktopConfig();
            config.Token = "";
            config.RefreshToken = "";
            SaveDesktopConfig(config);
            lastStatus = "\uB85C\uADF8\uC544\uC6C3\uB428";
            lastOutput = result.Output;
            UpdateSettingsForm(true);
            ShowNotification("\uB85C\uADF8\uC544\uC6C3", "FileInNOut \uB370\uC2A4\uD06C\uD1B1\uC5D0\uC11C \uB85C\uADF8\uC544\uC6C3\uD588\uC2B5\uB2C8\uB2E4.", ToolTipIcon.Info);
        }

        private void SaveFolderProfileKorean(SyncFolderConfig folder)
        {
            if (String.IsNullOrWhiteSpace(folder.LocalPath))
            {
                throw new InvalidOperationException("\uBA3C\uC800 \uD3F4\uB354\uB97C \uC120\uD0DD\uD558\uC138\uC694.");
            }
            folder = DesktopFolderProfileRules.NormalizeForSave(folder);
            ApplyExplorerFolderBranding(folder.LocalPath, ExplorerDisplayNameForFolder(folder), ExplorerStatusInfoTipForFolder(folder));

            DesktopConfig config = LoadDesktopConfig();
            DesktopFolderProfileRules.UpsertFolder(config, folder);
            SaveDesktopConfig(config);
            EnsureDriveHubMapping(config);
            RegisterExplorerNamespace(driveRootPath);
            CloudFilesIntegration.TryRegisterSyncRoot(driveRootPath);

            CommandResult result = RunCommand("init --dir " + DesktopProcessRunner.Quote(folder.LocalPath));
            lastStatus = "\uB3D9\uAE30\uD654 \uD3F4\uB354 \uC800\uC7A5\uB428";
            lastOutput = result.Output;
            RefreshWatchers();
            RefreshExplorerStatusHints();
        }

        private void RemoveFolderProfileKorean(string localPath)
        {
            DesktopConfig config = LoadDesktopConfig();
            bool stillConfigured = DesktopFolderProfileRules.RemoveFolder(config, localPath);
            SaveDesktopConfig(config);
            EnsureDriveHubMapping(config);
            RefreshWatchers();
            if (!stillConfigured)
            {
                ClearExplorerFolderBranding(localPath);
                UpdateExplorerNamespaceToConfiguredFolder();
            }
            lastStatus = "\uB3D9\uAE30\uD654 \uD3F4\uB354 \uC124\uC815\uC5D0\uC11C \uC81C\uAC70\uB428";
            lastOutput = localPath;
        }

        private void ShareFolderKorean(string localPath, string remotePath, string emails, string permission)
        {
            if (String.IsNullOrWhiteSpace(emails))
            {
                throw new InvalidOperationException("\uACF5\uC720\uD560 \uC774\uBA54\uC77C\uC744 \uD558\uB098 \uC774\uC0C1 \uC785\uB825\uD558\uC138\uC694.");
            }
            string args = "share-scope --local-path " + DesktopProcessRunner.Quote(localPath) +
                " --remote-path " + DesktopProcessRunner.Quote(DesktopSyncText.NormalizeRemotePath(remotePath, localPath)) +
                " --email " + DesktopProcessRunner.Quote(emails.Trim()) +
                " --permission " + DesktopProcessRunner.Quote(String.IsNullOrWhiteSpace(permission) ? "WRITE" : permission) +
                " --push-first";
            CommandResult result = RunCommand(args);
            if (result.ExitCode != 0)
            {
                throw new InvalidOperationException(result.Output);
            }
            lastStatus = "\uD3F4\uB354 \uACF5\uC720 \uC644\uB8CC";
            lastOutput = result.Output;
            ShowNotification("\uD3F4\uB354 \uACF5\uC720 \uC644\uB8CC", DesktopSyncText.TrimForBalloon(result.Output), ToolTipIcon.Info);
            UpdateSettingsForm(false);
        }

        public void OpenSharedAddress(string address)
        {
            OpenSharedAddressKorean(address);
        }

        private void OpenSharedAddressKorean(string address)
        {
            if (String.IsNullOrWhiteSpace(address))
            {
                throw new InvalidOperationException("\uACF5\uC720 \uC8FC\uC18C\uB97C \uC785\uB825\uD558\uC138\uC694.");
            }

            CommandResult result = RunCommand("open-address --address " + DesktopProcessRunner.Quote(address.Trim()));
            if (result.ExitCode != 0)
            {
                throw new InvalidOperationException(result.Output);
            }
            lastStatus = "\uACF5\uC720 \uD3F4\uB354 \uC5F0\uACB0 \uC644\uB8CC";
            lastOutput = result.Output;
            EnsureDriveHubMapping(LoadDesktopConfig());
            RefreshWatchers();
            ShowNotification("\uACF5\uC720 \uD3F4\uB354 \uC5F0\uACB0 \uC644\uB8CC", DesktopSyncText.TrimForBalloon(result.Output), ToolTipIcon.Info);
            UpdateSettingsForm(true);
        }

        public void Login(string email, string password)
        {
            LoginKorean(email, password);
        }

        public void Logout()
        {
            LogoutKorean();
        }

        public void SaveFolderProfile(SyncFolderConfig folder)
        {
            SaveFolderProfileKorean(folder);
        }

        public void RemoveFolderProfile(string localPath)
        {
            RemoveFolderProfileKorean(localPath);
        }

        public void ShareFolder(string localPath, string remotePath, string emails, string permission)
        {
            ShareFolderKorean(localPath, remotePath, emails, permission);
        }

        public void SyncNow(bool userRequested)
        {
            SyncNow(userRequested, false);
        }

        private void SyncNow(bool userRequested, bool preferPendingTargets)
        {
            SyncNowKorean(userRequested, preferPendingTargets);
        }

        private void SyncNowKorean(bool userRequested, bool preferPendingTargets)
        {
            if (IsSyncRunning())
            {
                if (userRequested)
                {
                    ShowNotification("\uB3D9\uAE30\uD654 \uC9C4\uD589 \uC911", "\uC774\uBBF8 \uB3D9\uAE30\uD654\uAC00 \uC2E4\uD589 \uC911\uC785\uB2C8\uB2E4.", ToolTipIcon.Info);
                }
                return;
            }

            DesktopConfig config = LoadDesktopConfig();
            if (String.IsNullOrWhiteSpace(config.RefreshToken))
            {
                lastStatus = "\uB85C\uADF8\uC778 \uD544\uC694";
                lastOutput = "FileInNOut \uB370\uC2A4\uD06C\uD1B1\uC744 \uC5F4\uACE0 \uB85C\uADF8\uC778\uD558\uC138\uC694.";
                if (userRequested)
                {
                    ShowSettings();
                }
                return;
            }

            EnsureDefaultSyncFolderSaved();
            string folderSignatureBefore = DesktopFolderProfileRules.Signature(LoadDesktopConfig());
            List<string> pendingTargets = TakePendingChangePaths();
            if (!TryBeginSyncRun())
            {
                RestorePendingChangePaths(pendingTargets);
                return;
            }
            lastStatus = "\uB3D9\uAE30\uD654 \uC911...";
            UpdateSettingsForm(false);

            ThreadPool.QueueUserWorkItem(delegate
            {
                CommandResult result = RunSyncCommand(preferPendingTargets, pendingTargets);
                EndSyncRun();
                lastOutput = DesktopSyncText.TranslateCommandOutput(result.Output);
                bool rebuildSettings = false;
                if (result.ExitCode == 0)
                {
                    EnsureDriveHubMapping(LoadDesktopConfig());
                    RefreshWatchers();
                    rebuildSettings = !String.Equals(
                        folderSignatureBefore,
                        DesktopFolderProfileRules.Signature(LoadDesktopConfig()),
                        StringComparison.Ordinal);
                    lastStatus = "\uB9C8\uC9C0\uB9C9 \uB3D9\uAE30\uD654 \uC131\uACF5: " + DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss");
                    if (userRequested || (notificationsEnabled && DesktopSyncText.HasSyncChanges(result.Output)))
                    {
                        ShowNotification("\uB3D9\uAE30\uD654 \uC644\uB8CC", DesktopSyncText.SummarizeSync(result.Output), ToolTipIcon.Info);
                    }
                }
                else
                {
                    RestorePendingChangePaths(pendingTargets);
                    lastStatus = "\uB3D9\uAE30\uD654 \uC2E4\uD328: " + DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss");
                    ShowNotification("\uB3D9\uAE30\uD654 \uC2E4\uD328", DesktopSyncText.TrimForBalloon(result.Output), ToolTipIcon.Warning);
                }
                RefreshExplorerStatusHints();
                UpdateSettingsForm(rebuildSettings);
            });
        }

        private CommandResult RunSyncCommand(bool preferPendingTargets, List<string> pendingTargets)
        {
            return DesktopSyncCommandRunner.Run(
                preferPendingTargets,
                pendingTargets,
                LoadDesktopConfig(),
                driveRootPath,
                RunCommand);
        }

        public string DoctorLocal()
        {
            SyncFolderConfig folder = FirstEnabledFolder();
            return DoctorLocal(folder.LocalPath);
        }

        public string DoctorLocal(string localPath)
        {
            if (String.IsNullOrWhiteSpace(localPath))
            {
                localPath = FirstEnabledFolder().LocalPath;
            }
            CommandResult result = RunCommand("doctor --dir " + DesktopProcessRunner.Quote(localPath) + " --local-only");
            return result.Output;
        }

        public StorageSummary GetStorageSummary()
        {
            CommandResult result = RunCommand("storage");
            return DesktopDataReader.ParseStorageSummary(result.ExitCode, result.Output);
        }

        public List<SyncActivityItem> ListRecentSyncActivity()
        {
            return DesktopSyncState.ListRecentSyncActivity(LoadDesktopConfig(), UseKoreanLabels());
        }

        public List<SearchResultItem> ListSyncIssues()
        {
            return DesktopSyncState.ListSyncIssues(LoadDesktopConfig());
        }

        public string FolderStatusLabel(SyncFolderConfig folder)
        {
            return DesktopSyncState.FolderStatusLabel(folder);
        }

        public string FolderPermissionLabel(SyncFolderConfig folder)
        {
            return DesktopSyncState.FolderPermissionLabel(folder);
        }

        public List<SearchResultItem> SearchLocalFiles(string query)
        {
            return searchService.SearchLocalFiles(query);
        }

        public List<SearchResultItem> SearchFiles(string query)
        {
            return searchService.SearchFiles(query);
        }

        public List<SearchResultItem> SearchCloudFiles(string query)
        {
            return searchService.SearchCloudFiles(query);
        }

        public List<PendingShareItem> ListPendingShares()
        {
            if (!IsLoggedIn())
            {
                return new List<PendingShareItem>();
            }

            CommandResult result = RunCommand("pending-shares");
            if (result.ExitCode != 0)
            {
                return new List<PendingShareItem>();
            }

            return DesktopDataReader.ParsePendingShares(result.Output);
        }

        public void AcceptPendingShare(PendingShareItem item)
        {
            if (UseKoreanLabels())
            {
                AcceptPendingShareKorean(item);
                return;
            }
            if (item == null)
            {
                throw new InvalidOperationException("수락할 공유 초대를 선택하세요.");
            }

            CommandResult result = RunCommand("accept-share --id " + item.Id.ToString());
            if (result.ExitCode != 0)
            {
                throw new InvalidOperationException(result.Output);
            }

            lastStatus = "공유 초대를 수락했습니다.";
            lastOutput = result.Output;
            EnsureDriveHubMapping(LoadDesktopConfig());
            RefreshWatchers();
            ShowNotification("공유 초대 수락", item.Path + " 공유를 수락했습니다.", ToolTipIcon.Info);
            UpdateSettingsForm(true);
            SyncNow(true);
        }

        public void RejectPendingShare(PendingShareItem item)
        {
            if (UseKoreanLabels())
            {
                RejectPendingShareKorean(item);
                return;
            }
            if (item == null)
            {
                throw new InvalidOperationException("거절할 공유 초대를 선택하세요.");
            }

            CommandResult result = RunCommand("reject-share --id " + item.Id.ToString());
            if (result.ExitCode != 0)
            {
                throw new InvalidOperationException(result.Output);
            }

            lastStatus = "공유 초대를 거절했습니다.";
            lastOutput = result.Output;
            ShowNotification("공유 초대 거절", item.Path + " 공유를 거절했습니다.", ToolTipIcon.Info);
            UpdateSettingsForm(false);
        }

        private void AcceptPendingShareKorean(PendingShareItem item)
        {
            if (item == null)
            {
                throw new InvalidOperationException("\uC218\uB77D\uD560 \uACF5\uC720 \uCD08\uB300\uB97C \uC120\uD0DD\uD558\uC138\uC694.");
            }

            CommandResult result = RunCommand("accept-share --id " + item.Id.ToString());
            if (result.ExitCode != 0)
            {
                throw new InvalidOperationException(result.Output);
            }

            lastStatus = "\uACF5\uC720 \uCD08\uB300\uB97C \uC218\uB77D\uD588\uC2B5\uB2C8\uB2E4.";
            lastOutput = result.Output;
            EnsureDriveHubMapping(LoadDesktopConfig());
            RefreshWatchers();
            ShowNotification("\uACF5\uC720 \uCD08\uB300 \uC218\uB77D", item.Path + " \uACF5\uC720\uB97C \uC218\uB77D\uD588\uC2B5\uB2C8\uB2E4.", ToolTipIcon.Info);
            UpdateSettingsForm(true);
            SyncNow(true);
        }

        private void RejectPendingShareKorean(PendingShareItem item)
        {
            if (item == null)
            {
                throw new InvalidOperationException("\uAC70\uC808\uD560 \uACF5\uC720 \uCD08\uB300\uB97C \uC120\uD0DD\uD558\uC138\uC694.");
            }

            CommandResult result = RunCommand("reject-share --id " + item.Id.ToString());
            if (result.ExitCode != 0)
            {
                throw new InvalidOperationException(result.Output);
            }

            lastStatus = "\uACF5\uC720 \uCD08\uB300\uB97C \uAC70\uC808\uD588\uC2B5\uB2C8\uB2E4.";
            lastOutput = result.Output;
            ShowNotification("\uACF5\uC720 \uCD08\uB300 \uAC70\uC808", item.Path + " \uACF5\uC720\uB97C \uAC70\uC808\uD588\uC2B5\uB2C8\uB2E4.", ToolTipIcon.Info);
            UpdateSettingsForm(false);
        }

        private void EnsureDefaultSyncFolderSaved()
        {
            DesktopConfig config = LoadDesktopConfig();
            int folderCountBefore = config.SyncFolders.Count;
            DesktopFolderProfileRules.EnsureDefaultFolder(config);
            if (config.SyncFolders.Count != folderCountBefore)
            {
                SaveDesktopConfig(config);
            }
        }

        private SyncFolderConfig FirstEnabledFolder()
        {
            return DesktopFolderProfileRules.FirstEnabledFolder(LoadDesktopConfig());
        }
    }
}