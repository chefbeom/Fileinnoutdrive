using System;
using System.Diagnostics;
using System.IO;
using System.Windows.Forms;

namespace FileInNOutDesktop
{
    internal sealed partial class SettingsForm
    {
        private void ResetDashboardReferences()
        {
            subtitleLabel = null;
            storageUsageLabel = null;
            storageRemainLabel = null;
            storagePlanLabel = null;
            storageProgress = null;
            localFolderText = null;
            cloudFolderText = null;
            shareEmailText = null;
            searchText = null;
            directionCombo = null;
            permissionCombo = null;
            statusText = null;
            folderList = null;
            pendingShareList = null;
            fileList = null;
            notificationsCheck = null;
            autoSyncCheck = null;
        }

        private void UpdateHeader(DesktopConfig config)
        {
            if (DesktopSyncText.UseKoreanLabels())
            {
                if (subtitleLabel != null)
                {
                    subtitleLabel.Text = config.Email + " \uACC4\uC815\uC73C\uB85C FileInNOut Cloud\uC5D0 \uC5F0\uACB0\uB428";
                }
                return;
            }
            if (subtitleLabel != null)
            {
                subtitleLabel.Text = config.Email + " 계정으로 FileInNOut Cloud에 연결됨";
            }
        }

        private void RefreshStorage()
        {
            if (storageUsageLabel == null || storageRemainLabel == null || storageProgress == null || storagePlanLabel == null)
            {
                return;
            }
            ApplyStorageSummary(controller.GetStorageSummary());
        }

        private void ApplyStorageSummary(StorageSummary summary)
        {
            SettingsStorageSummaryText summaryText = DesktopSettingsText.BuildStorageSummary(summary, DesktopSyncText.UseKoreanLabels());
            storageUsageLabel.Text = summaryText.UsageText;
            storageRemainLabel.Text = summaryText.RemainingText;
            storageProgress.Value = summaryText.ProgressValue;
            storageProgress.Invalidate();
            storagePlanLabel.Text = summaryText.PlanText;
        }

        private void RefreshStatus()
        {
            if (statusText != null)
            {
                statusText.Text = DesktopSettingsText.BuildStatusText(
                    controller.LastStatus,
                    controller.LastOutput,
                    controller.IsSyncActive,
                    controller.IsSyncPaused,
                    controller.HasPendingFileChange,
                    DesktopSyncText.UseKoreanLabels());
            }
        }

        private void RefreshRecentFiles()
        {
            if (fileList == null)
            {
                return;
            }
            fileList.BeginUpdate();
            try
            {
                fileList.Items.Clear();
                string query = searchText == null ? "" : searchText.Text.Trim();
                if (!String.IsNullOrWhiteSpace(query))
                {
                    foreach (SearchResultItem item in controller.SearchFiles(query))
                    {
                        ListViewItem row = new ListViewItem(item.Title);
                        row.Tag = item;
                        row.SubItems.Add(item.Detail);
                        row.SubItems.Add(item.UpdatedAt == DateTime.MinValue ? "-" : item.UpdatedAt.ToString("yyyy-MM-dd HH:mm:ss"));
                        fileList.Items.Add(row);
                    }
                }
                else
                {
                    foreach (SearchResultItem item in controller.ListSyncIssues())
                    {
                        ListViewItem row = new ListViewItem(item.Title);
                        row.Tag = item;
                        row.SubItems.Add(item.Detail);
                        row.SubItems.Add(item.UpdatedAt == DateTime.MinValue ? "-" : item.UpdatedAt.ToString("yyyy-MM-dd HH:mm:ss"));
                        fileList.Items.Add(row);
                    }
                    foreach (SyncActivityItem item in controller.ListRecentSyncActivity())
                    {
                        ListViewItem row = new ListViewItem(item.Title);
                        row.SubItems.Add(item.Detail);
                        row.SubItems.Add(item.UpdatedAt == DateTime.MinValue ? "-" : item.UpdatedAt.ToString("yyyy-MM-dd HH:mm:ss"));
                        fileList.Items.Add(row);
                    }
                }
            }
            finally
            {
                fileList.EndUpdate();
            }
        }

        private void QueueSearchRefresh()
        {
            if (searchRefreshTimer == null)
            {
                RefreshRecentFiles();
                return;
            }
            searchRefreshTimer.Stop();
            searchRefreshTimer.Start();
        }

        private void OpenSelectedSearchResult()
        {
            if (fileList == null || fileList.SelectedItems.Count == 0)
            {
                return;
            }
            SearchResultItem item = fileList.SelectedItems[0].Tag as SearchResultItem;
            if (item == null)
            {
                return;
            }

            try
            {
                if (!String.IsNullOrWhiteSpace(item.LocalPath) && Directory.Exists(item.LocalPath))
                {
                    controller.OpenFolder(item.LocalPath);
                    return;
                }
                if (!String.IsNullOrWhiteSpace(item.LocalPath) && File.Exists(item.LocalPath))
                {
                    string explorerPath = controller.ResolveDriveHubPathForLocalPath(item.LocalPath);
                    if (String.IsNullOrWhiteSpace(explorerPath))
                    {
                        explorerPath = item.LocalPath;
                    }
                    Process.Start("explorer.exe", "/select,\"" + explorerPath.Replace("\"", "") + "\"");
                    return;
                }
                if (!String.IsNullOrWhiteSpace(item.WebUrl))
                {
                    Process.Start(item.WebUrl);
                }
            }
            catch
            {
            }
        }

        private void RefreshPendingShares()
        {
            if (pendingShareList == null)
            {
                return;
            }

            pendingShareList.BeginUpdate();
            try
            {
                pendingShareList.Items.Clear();
                foreach (PendingShareItem item in controller.ListPendingShares())
                {
                    ListViewItem row = new ListViewItem(item.Path);
                    row.Tag = item;
                    row.SubItems.Add(item.Owner);
                    row.SubItems.Add(item.PermissionLabel);
                    pendingShareList.Items.Add(row);
                }
            }
            finally
            {
                pendingShareList.EndUpdate();
            }
        }

        private void RefreshFolderStatuses()
        {
            if (folderList == null)
            {
                return;
            }
            foreach (ListViewItem row in folderList.Items)
            {
                SyncFolderConfig folder = row.Tag as SyncFolderConfig;
                if (folder == null)
                {
                    continue;
                }
                while (row.SubItems.Count < 5)
                {
                    row.SubItems.Add("");
                }
                row.SubItems[3].Text = controller.FolderPermissionLabel(folder);
                row.SubItems[4].Text = controller.FolderStatusLabel(folder);
            }
        }

        private void LoadSelectedFolder()
        {
            if (folderList == null || folderList.SelectedItems.Count == 0)
            {
                return;
            }
            SyncFolderConfig folder = folderList.SelectedItems[0].Tag as SyncFolderConfig;
            if (folder == null)
            {
                return;
            }
            localFolderText.Text = folder.LocalPath;
            cloudFolderText.Text = folder.RemotePath;
            string direction = DesktopSyncText.NormalizeDirection(folder.Direction);
            directionCombo.SelectedIndex = direction == "upload" ? 1 : direction == "download" ? 2 : 0;
        }

        private void DoLogin()
        {
            bool useKoreanLabels = DesktopSyncText.UseKoreanLabels();
            try
            {
                controller.Login(emailText.Text.Trim(), passwordText.Text);
                passwordText.Text = "";
                RefreshAll();
            }
            catch (Exception ex)
            {
                MessageBox.Show(ex.Message, DesktopSettingsDialogText.LoginFailedTitle(useKoreanLabels), MessageBoxButtons.OK, MessageBoxIcon.Warning);
            }
        }

        private void SaveFolder()
        {
            bool useKoreanLabels = DesktopSyncText.UseKoreanLabels();
            try
            {
                SyncFolderConfig folder = new SyncFolderConfig();
                folder.LocalPath = localFolderText.Text.Trim();
                folder.RemotePath = cloudFolderText.Text.Trim();
                folder.Direction = SelectedDirection();
                folder.Enabled = true;
                folder.Name = Path.GetFileName(folder.LocalPath.TrimEnd('\\', '/'));
                controller.SaveFolderProfile(folder);
                RefreshAll();
            }
            catch (Exception ex)
            {
                MessageBox.Show(ex.Message, DesktopSettingsDialogText.FolderSaveFailedTitle(useKoreanLabels), MessageBoxButtons.OK, MessageBoxIcon.Warning);
            }
        }

        private void NewFolder()
        {
            if (folderList != null)
            {
                while (folderList.SelectedItems.Count > 0)
                {
                    folderList.SelectedItems[0].Selected = false;
                }
            }
            if (localFolderText != null)
            {
                localFolderText.Text = "";
            }
            if (cloudFolderText != null)
            {
                cloudFolderText.Text = "";
            }
            if (shareEmailText != null)
            {
                shareEmailText.Text = "";
            }
            if (directionCombo != null)
            {
                directionCombo.SelectedIndex = 0;
            }
        }

        private void RemoveFolder()
        {
            if (String.IsNullOrWhiteSpace(localFolderText.Text))
            {
                return;
            }
            controller.RemoveFolderProfile(localFolderText.Text.Trim());
            RefreshAll();
        }

        private void ShareFolder()
        {
            bool useKoreanLabels = DesktopSyncText.UseKoreanLabels();
            try
            {
                controller.ShareFolder(
                    localFolderText.Text.Trim(),
                    cloudFolderText.Text.Trim(),
                    shareEmailText.Text.Trim(),
                    SelectedPermission());
                shareEmailText.Text = "";
                RefreshLiveData();
            }
            catch (Exception ex)
            {
                MessageBox.Show(ex.Message, DesktopSettingsDialogText.ShareFailedTitle(useKoreanLabels), MessageBoxButtons.OK, MessageBoxIcon.Warning);
            }
        }

        private void OpenSharedAddress()
        {
            bool useKoreanLabels = DesktopSyncText.UseKoreanLabels();
            try
            {
                controller.OpenSharedAddress(sharedAddressText == null ? "" : sharedAddressText.Text.Trim());
                if (sharedAddressText != null)
                {
                    sharedAddressText.Text = "";
                }
                RefreshPendingShares();
                RefreshLiveData();
            }
            catch (Exception ex)
            {
                MessageBox.Show(ex.Message, DesktopSettingsDialogText.OpenSharedAddressFailedTitle(useKoreanLabels), MessageBoxButtons.OK, MessageBoxIcon.Warning);
            }
        }

        private PendingShareItem SelectedPendingShare()
        {
            if (pendingShareList == null || pendingShareList.SelectedItems.Count == 0)
            {
                return null;
            }
            return pendingShareList.SelectedItems[0].Tag as PendingShareItem;
        }

        private void AcceptSelectedPendingShare()
        {
            bool useKoreanLabels = DesktopSyncText.UseKoreanLabels();
            try
            {
                controller.AcceptPendingShare(SelectedPendingShare());
                RefreshPendingShares();
                RefreshLiveData();
            }
            catch (Exception ex)
            {
                MessageBox.Show(ex.Message, DesktopSettingsDialogText.PendingShareAcceptFailedTitle(useKoreanLabels), MessageBoxButtons.OK, MessageBoxIcon.Warning);
            }
        }

        private void RejectSelectedPendingShare()
        {
            bool useKoreanLabels = DesktopSyncText.UseKoreanLabels();
            try
            {
                controller.RejectPendingShare(SelectedPendingShare());
                RefreshPendingShares();
                RefreshLiveData();
            }
            catch (Exception ex)
            {
                MessageBox.Show(ex.Message, DesktopSettingsDialogText.PendingShareRejectFailedTitle(useKoreanLabels), MessageBoxButtons.OK, MessageBoxIcon.Warning);
            }
        }

        private void BrowseFolder()
        {
            bool useKoreanLabels = DesktopSyncText.UseKoreanLabels();
            using (FolderBrowserDialog dialog = new FolderBrowserDialog())
            {
                dialog.Description = DesktopSettingsDialogText.BrowseFolderDescription(useKoreanLabels);
                dialog.SelectedPath = localFolderText.Text;
                if (dialog.ShowDialog(this) == DialogResult.OK)
                {
                    localFolderText.Text = dialog.SelectedPath;
                    if (String.IsNullOrWhiteSpace(cloudFolderText.Text))
                    {
                        cloudFolderText.Text = DesktopSyncText.NormalizeRemotePath("", dialog.SelectedPath);
                    }
                }
            }
        }

        private string SelectedDirection()
        {
            int selected = directionCombo.SelectedIndex;
            if (selected == 1)
            {
                return "upload";
            }
            if (selected == 2)
            {
                return "download";
            }
            return "two-way";
        }

        private string SelectedPermission()
        {
            if (permissionCombo == null)
            {
                return "WRITE";
            }
            if (permissionCombo.SelectedIndex == 1)
            {
                return "READ";
            }
            if (permissionCombo.SelectedIndex == 2)
            {
                return "DOWNLOAD";
            }
            if (permissionCombo.SelectedIndex == 3)
            {
                return "UPLOAD";
            }
            return "WRITE";
        }
    }
}