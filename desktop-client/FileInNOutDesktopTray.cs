using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;
using System.Threading;
using System.Windows.Forms;

namespace FileInNOutDesktop
{
    internal sealed partial class TrayController : IDisposable
    {
        private const string LocalDefaultServer = "http://localhost/api";
        private const string BuildVersion = "__FILEINNOUT_DESKTOP_VERSION__";
        private const int AutoSyncIntervalMs = 20000;
        private const string DefaultDriveLetter = "G";
        private const string MyDriveHubName = "\uB0B4 \uB4DC\uB77C\uC774\uBE0C";
        private const string SharedDriveHubName = "\uACF5\uC720 \uBB38\uC11C\uD568";
        private const string DefaultExplorerFolderInfoTip = "FileInNOut 동기화 폴더";
        private const string DriveRootExplorerInfoTip = "FileInNOut 드라이브 - 내 드라이브와 공유 문서함";
        private const string MyDriveExplorerInfoTip = "내가 동기화하는 폴더";
        private const string SharedDriveExplorerInfoTip = "공유받은 동기화 폴더";
        private const string SharedDriveOwnerExplorerInfoTip = "FileInNOut 공유 문서함 소유자 폴더";
        public static string DefaultServer
        {
            get { return ResolveDefaultServer(); }
        }

        private static string ResolveDefaultServer()
        {
            string configured = Environment.GetEnvironmentVariable("FILEINNOUT_DESKTOP_SERVER");
            if (!String.IsNullOrWhiteSpace(configured))
            {
                return configured.Trim().TrimEnd('/');
            }
            return LocalDefaultServer;
        }

        private readonly NotifyIcon notifyIcon;
        private readonly System.Windows.Forms.Timer autoSyncTimer;
        private readonly System.Windows.Forms.Timer initialSyncTimer;
        private readonly System.Windows.Forms.Timer signalTimer;
        private readonly System.Windows.Forms.Timer changeTimer;
        private readonly EventWaitHandle showSettingsEvent;
        private readonly string installDir;
        private readonly string commandPath;
        private readonly string clientScriptPath;
        private readonly string bundledPythonPath;
        private readonly string configDir;
        private readonly string configPath;
        private readonly string trayConfigPath;
        private readonly string driveRootPath;
        private readonly DesktopTrayConfigStore configStore;
        private readonly DesktopChangeTracker changeTracker;
        private readonly DesktopSearchService searchService;
        private SettingsForm settingsForm;
        private Thread signalThread;
        private volatile bool pendingShowSettings;
        private volatile bool disposed;
        private bool autoSyncEnabled = true;
        private bool notificationsEnabled = true;
        private bool updateCheckRunning;
        private DateTime lastUpdateCheckUtc = DateTime.MinValue;
        private string lastStatus = "준비됨";
        private string lastOutput = "";

        public TrayController(EventWaitHandle showSettingsEvent)
        {
            this.showSettingsEvent = showSettingsEvent;
            installDir = AppDomain.CurrentDomain.BaseDirectory.TrimEnd('\\');
            commandPath = Path.Combine(installDir, "fileinnout-desktop.cmd");
            clientScriptPath = Path.Combine(installDir, "fileinnout_desktop.py");
            bundledPythonPath = Path.Combine(installDir, "python-runtime", "python.exe");
            string localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            configDir = Path.Combine(localAppData, "FileInNOutDesktop");
            configPath = Path.Combine(configDir, "config.json");
            trayConfigPath = Path.Combine(configDir, "tray-config.json");
            driveRootPath = Path.Combine(configDir, "drive-root");
            configStore = new DesktopTrayConfigStore(configDir, configPath, driveRootPath);
            changeTracker = new DesktopChangeTracker(
                RefreshExplorerStatusHints,
                delegate(string status)
                {
                    lastStatus = status;
                    RefreshExplorerStatusHints();
                });
            searchService = new DesktopSearchService(LoadDesktopConfig, RunCommand);

            LoadTrayConfig();

            notifyIcon = new NotifyIcon();
            notifyIcon.Icon = DesktopTrayVisuals.LoadTrayIcon(installDir);
            notifyIcon.Text = "FileInNOut Desktop";
            notifyIcon.Visible = true;
            notifyIcon.DoubleClick += delegate { ShowSettings(); };
            notifyIcon.ContextMenuStrip = BuildMenu();

            autoSyncTimer = new System.Windows.Forms.Timer();
            autoSyncTimer.Interval = AutoSyncIntervalMs;
            autoSyncTimer.Tick += delegate
            {
                if (autoSyncEnabled)
                {
                    SyncNow(false);
                }
            };

            initialSyncTimer = new System.Windows.Forms.Timer();
            initialSyncTimer.Interval = 3000;
            initialSyncTimer.Tick += delegate
            {
                initialSyncTimer.Stop();
                if (autoSyncEnabled)
                {
                    SyncNow(false);
                }
            };

            changeTimer = new System.Windows.Forms.Timer();
            changeTimer.Interval = 2000;
            changeTimer.Tick += delegate
            {
                if (changeTracker.ShouldRunPendingSync(autoSyncEnabled))
                {
                    SyncPendingChanges();
                }
            };

            signalTimer = new System.Windows.Forms.Timer();
            signalTimer.Interval = 500;
            signalTimer.Tick += delegate
            {
                if (pendingShowSettings)
                {
                    pendingShowSettings = false;
                    ShowSettings();
                }
            };
        }

        public string LastStatus { get { return lastStatus; } }
        public string LastOutput { get { return lastOutput; } }
        public bool IsSyncActive { get { return IsSyncRunning(); } }
        public bool HasPendingFileChange
        {
            get { return changeTracker.HasPendingFileChange; }
        }
        public bool AutoSyncEnabled { get { return autoSyncEnabled; } }
        public bool IsSyncPaused { get { return !autoSyncEnabled; } }
        public bool NotificationsEnabled { get { return notificationsEnabled; } }
        public string ConfigPath { get { return configPath; } }
        public string AppVersion { get { return DesktopUpdateService.CurrentAppVersion(BuildVersion); } }

        public void Start()
        {
            Directory.CreateDirectory(configDir);
            EnsureDefaultSyncFolderSaved();
            ApplyExplorerBrandingToConfiguredFolders();
            UpdateExplorerNamespaceToConfiguredFolder();
            EnsureDriveMappingToConfiguredFolder();
            RegisterCloudFilesSyncRootToConfiguredFolder();
            RefreshWatchers();
            initialSyncTimer.Start();
            autoSyncTimer.Start();
            changeTimer.Start();
            signalTimer.Start();
            signalThread = new Thread(WaitForSettingsSignal);
            signalThread.IsBackground = true;
            signalThread.Start();
            QueueUpdateCheck(false);
        }

        public void Dispose()
        {
            disposed = true;
            try
            {
                showSettingsEvent.Set();
            }
            catch
            {
            }
            initialSyncTimer.Stop();
            autoSyncTimer.Stop();
            changeTimer.Stop();
            signalTimer.Stop();
            changeTracker.Dispose();
            notifyIcon.Visible = false;
            notifyIcon.Dispose();
            if (settingsForm != null)
            {
                settingsForm.Dispose();
            }
        }

        private void WaitForSettingsSignal()
        {
            while (!disposed)
            {
                try
                {
                    showSettingsEvent.WaitOne();
                    if (!disposed)
                    {
                        pendingShowSettings = true;
                    }
                }
                catch
                {
                    return;
                }
            }
        }

        public DesktopConfig LoadDesktopConfig()
        {
            return configStore.Load(DefaultServer, DefaultDriveLetter);
        }

        public void SaveDesktopConfig(DesktopConfig config)
        {
            configStore.Save(config, DefaultServer);
            RefreshWatchers();
        }

        public bool IsLoggedIn()
        {
            DesktopConfig config = LoadDesktopConfig();
            return !String.IsNullOrWhiteSpace(config.RefreshToken);
        }

        public void ShowSettings()
        {
            if (settingsForm == null || settingsForm.IsDisposed)
            {
                settingsForm = new SettingsForm(this);
            }
            settingsForm.RefreshAll();
            settingsForm.Show();
            settingsForm.WindowState = FormWindowState.Normal;
            settingsForm.Activate();
        }

        public void OpenSyncFolder()
        {
            OpenDriveRoot();
        }

        public void OpenDriveRoot()
        {
            DesktopConfig config = LoadDesktopConfig();
            EnsureDriveHubMapping(config);

            string driveLetter = DesktopPathRules.NormalizeDriveLetter(config.DriveLetter);
            string drivePath = driveLetter + ":\\";
            string mappedTarget = DesktopDriveMapping.CurrentSubstTarget(driveLetter, installDir);
            if (
                !String.IsNullOrWhiteSpace(driveLetter) &&
                Directory.Exists(drivePath) &&
                !String.IsNullOrWhiteSpace(mappedTarget) &&
                DesktopPathRules.SamePath(DesktopPathRules.ResolvePathIfPossible(mappedTarget), driveRootPath)
            )
            {
                Process.Start("explorer.exe", DesktopProcessRunner.Quote(drivePath));
                return;
            }

            Directory.CreateDirectory(driveRootPath);
            Process.Start("explorer.exe", DesktopProcessRunner.Quote(driveRootPath));
        }

        public void OpenFolder(string localPath)
        {
            if (String.IsNullOrWhiteSpace(localPath))
            {
                OpenSyncFolder();
                return;
            }
            Directory.CreateDirectory(localPath);
            string driveHubPath = ResolveDriveHubPathForLocalPath(localPath);
            if (!String.IsNullOrWhiteSpace(driveHubPath) && Directory.Exists(driveHubPath))
            {
                Process.Start("explorer.exe", DesktopProcessRunner.Quote(driveHubPath));
                return;
            }
            Process.Start("explorer.exe", DesktopProcessRunner.Quote(localPath));
        }

        public void OpenWeb()
        {
            DesktopConfig config = LoadDesktopConfig();
            string url = (String.IsNullOrWhiteSpace(config.Server) ? DefaultServer : config.Server).Replace("/api", "").TrimEnd('/');
            Process.Start(url);
        }

        private void QueueUpdateCheck(bool userRequested)
        {
            if (updateCheckRunning)
            {
                if (userRequested)
                {
                    ShowNotification("업데이트 확인", "이미 업데이트 확인이 진행 중입니다.", ToolTipIcon.Info);
                }
                return;
            }
            if (!userRequested && !ShouldCheckForUpdates())
            {
                return;
            }

            updateCheckRunning = true;
            if (userRequested)
            {
                lastStatus = "업데이트 확인 중...";
                lastOutput = "FileInNOut Desktop 업데이트 정보를 확인하고 있습니다.";
                UpdateSettingsForm(false);
            }

            ThreadPool.QueueUserWorkItem(delegate
            {
                try
                {
                    DesktopUpdateResult result = DesktopUpdateService.CheckForUpdate(LoadDesktopConfig(), DefaultServer, BuildVersion);
                    lastUpdateCheckUtc = DateTime.UtcNow;
                    SaveTrayConfig();
                    HandleUpdateCheckResult(result, userRequested);
                }
                catch (Exception ex)
                {
                    if (userRequested)
                    {
                        lastStatus = "업데이트 확인 실패";
                        lastOutput = ex.Message;
                        ShowNotification("업데이트 확인 실패", ex.Message, ToolTipIcon.Warning);
                        UpdateSettingsForm(false);
                    }
                }
                finally
                {
                    updateCheckRunning = false;
                }
            });
        }

        private bool ShouldCheckForUpdates()
        {
            return DesktopUpdateService.ShouldCheck(lastUpdateCheckUtc);
        }

        private void HandleUpdateCheckResult(DesktopUpdateResult result, bool userRequested)
        {
            if (result.CurrentVersionIsLocal && !userRequested)
            {
                return;
            }

            if (result.HasUpdate || result.CurrentVersionIsLocal)
            {
                lastStatus = result.HasUpdate ? "업데이트 사용 가능: " + result.LatestVersion : "업데이트 확인 완료";
                lastOutput = DesktopUpdateService.BuildSummary(result);
                if (result.HasUpdate)
                {
                    ShowNotification("FileInNOut 업데이트", "새 버전 " + result.LatestVersion + "을 사용할 수 있습니다.", ToolTipIcon.Info);
                }
                if (userRequested && !String.IsNullOrWhiteSpace(result.DownloadUrl))
                {
                    string message = DesktopUpdateService.BuildDialogMessage(result);
                    if (MessageBox.Show(message, "FileInNOut Desktop 업데이트", MessageBoxButtons.YesNo, MessageBoxIcon.Information) == DialogResult.Yes)
                    {
                        OpenUpdateDownload(result.DownloadUrl);
                    }
                }
            }
            else if (userRequested)
            {
                lastStatus = "최신 버전 사용 중";
                lastOutput = DesktopUpdateService.BuildSummary(result);
                ShowNotification("업데이트 확인", "현재 최신 버전을 사용 중입니다.", ToolTipIcon.Info);
            }
            UpdateSettingsForm(false);
        }

        private void OpenUpdateDownload(string url)
        {
            try
            {
                Process.Start(url);
            }
            catch (Exception ex)
            {
                ShowNotification("업데이트 다운로드 실패", ex.Message, ToolTipIcon.Warning);
            }
        }

        private ContextMenuStrip BuildMenu()
        {
            return DesktopTrayMenu.Build(
                UseKoreanLabels(),
                autoSyncEnabled,
                notificationsEnabled,
                delegate { ShowSettings(); },
                delegate { OpenSyncFolder(); },
                delegate { SyncNow(true); },
                delegate { OpenWeb(); },
                delegate { QueueUpdateCheck(true); },
                delegate { ToggleAutoSync(); },
                delegate { SetNotifications(!notificationsEnabled); },
                delegate { Application.Exit(); });
        }

        private CommandResult RunCommand(string arguments)
        {
            return RunCommand(arguments, null);
        }

        private CommandResult RunCommand(string arguments, string standardInput)
        {
            return DesktopProcessRunner.RunDesktopCommand(
                installDir,
                commandPath,
                bundledPythonPath,
                clientScriptPath,
                arguments,
                standardInput);
        }

        private void ShowNotification(string title, string body, ToolTipIcon icon)
        {
            if (!notificationsEnabled && icon != ToolTipIcon.Warning)
            {
                return;
            }
            notifyIcon.ShowBalloonTip(3500, title, DesktopSyncText.TrimForBalloon(body), icon);
        }

        private void UpdateSettingsForm(bool rebuild)
        {
            if (settingsForm == null || settingsForm.IsDisposed)
            {
                return;
            }
            try
            {
                settingsForm.BeginInvoke(new MethodInvoker(delegate
                {
                    if (rebuild)
                    {
                        settingsForm.RefreshAll();
                    }
                    else
                    {
                        settingsForm.RefreshLiveData();
                    }
                }));
            }
            catch
            {
            }
        }

        private void RefreshWatchers()
        {
            changeTracker.RefreshWatchers(LoadDesktopConfig(), driveRootPath, MyDriveHubName, SharedDriveHubName);
        }

        private bool IsSyncRunning()
        {
            return changeTracker.IsSyncRunning();
        }

        private bool TryBeginSyncRun()
        {
            return changeTracker.TryBeginSyncRun();
        }

        private void EndSyncRun()
        {
            changeTracker.EndSyncRun();
        }

        private void SyncPendingChanges()
        {
            SyncNow(false, true);
        }

        private List<string> TakePendingChangePaths()
        {
            return changeTracker.TakePendingChangePaths();
        }

        private void RestorePendingChangePaths(IEnumerable<string> paths)
        {
            changeTracker.RestorePendingChangePaths(paths);
        }

        private void LoadTrayConfig()
        {
            DesktopTrayPreferences preferences = DesktopTrayPreferences.Load(trayConfigPath);
            autoSyncEnabled = preferences.AutoSyncEnabled;
            notificationsEnabled = preferences.NotificationsEnabled;
            lastUpdateCheckUtc = preferences.LastUpdateCheckUtc;
        }

        private void SaveTrayConfig()
        {
            DesktopTrayPreferences.Save(
                trayConfigPath,
                new DesktopTrayPreferences(autoSyncEnabled, notificationsEnabled, lastUpdateCheckUtc));
        }

        private void ApplyExplorerBrandingToConfiguredFolders()
        {
            DesktopConfig config = LoadDesktopConfig();
            foreach (SyncFolderConfig folder in config.SyncFolders)
            {
                if (folder.Enabled && !String.IsNullOrWhiteSpace(folder.LocalPath))
                {
                    ApplyExplorerFolderBranding(folder.LocalPath, ExplorerDisplayNameForFolder(folder), ExplorerStatusInfoTipForFolder(folder));
                }
            }
        }

        private void RefreshExplorerStatusHints()
        {
            try
            {
                ApplyExplorerBrandingToConfiguredFolders();
            }
            catch
            {
            }
        }

        private void ApplyExplorerFolderBranding(string folderPath, string displayName = "FileInNOut", string infoTip = DefaultExplorerFolderInfoTip)
        {
            DesktopExplorerBranding.Apply(folderPath, installDir, displayName, infoTip, DefaultExplorerFolderInfoTip);
        }

        private static string ExplorerDisplayNameForFolder(SyncFolderConfig folder)
        {
            return DesktopExplorerText.DisplayNameForFolder(folder);
        }

        private static string ExplorerInfoTipForFolder(SyncFolderConfig folder)
        {
            return DesktopExplorerText.InfoTipForFolder(folder, DefaultExplorerFolderInfoTip);
        }

        private string ExplorerStatusInfoTipForFolder(SyncFolderConfig folder)
        {
            string status = FolderStatusLabel(folder);
            string permission = folder == null ? "" : FolderPermissionLabel(folder);
            return DesktopExplorerText.StatusInfoTipForFolder(folder, status, permission, DefaultExplorerFolderInfoTip);
        }



        private void ClearExplorerFolderBranding(string folderPath)
        {
            DesktopExplorerBranding.Clear(folderPath);
        }

        private void UpdateExplorerNamespaceToConfiguredFolder()
        {
            try
            {
                DesktopConfig config = LoadDesktopConfig();
                EnsureDriveHubMapping(config);
                RegisterExplorerNamespace(driveRootPath);
            }
            catch
            {
            }
        }

        private void RegisterExplorerNamespace(string targetFolder)
        {
            DesktopExplorerNamespace.Register(targetFolder, installDir);
        }
        private void EnsureDriveMappingToConfiguredFolder()
        {
            try
            {
                DesktopConfig config = LoadDesktopConfig();
                EnsureDriveHubMapping(config);
            }
            catch
            {
            }
        }

        private void EnsureDriveHubMapping(DesktopConfig config)
        {
            if (config == null)
            {
                return;
            }

            try
            {
                Directory.CreateDirectory(driveRootPath);
                ApplyExplorerFolderBranding(driveRootPath, "FileInNOut", DriveRootExplorerInfoTip);
                string myDriveHubPath = Path.Combine(driveRootPath, MyDriveHubName);
                string sharedDriveHubPath = Path.Combine(driveRootPath, SharedDriveHubName);
                Directory.CreateDirectory(myDriveHubPath);
                Directory.CreateDirectory(sharedDriveHubPath);
                ApplyExplorerFolderBranding(myDriveHubPath, MyDriveHubName, MyDriveExplorerInfoTip);
                ApplyExplorerFolderBranding(sharedDriveHubPath, SharedDriveHubName, SharedDriveExplorerInfoTip);

                Dictionary<string, string> desired = DesktopDriveHubLinks.Build(config, myDriveHubPath, sharedDriveHubPath);

                new DesktopDriveHubMaintenance(
                    installDir,
                    SharedDriveOwnerExplorerInfoTip,
                    ApplyExplorerFolderBranding,
                    ClearExplorerFolderBranding)
                    .SyncDriveHubLinks(driveRootPath, myDriveHubPath, sharedDriveHubPath, desired);

                string mappedLetter = DesktopDriveMapping.Ensure(config.DriveLetter, driveRootPath, installDir);
                if (!String.IsNullOrWhiteSpace(mappedLetter) && !String.Equals(mappedLetter, DesktopPathRules.NormalizeDriveLetter(config.DriveLetter), StringComparison.OrdinalIgnoreCase))
                {
                    config.DriveLetter = mappedLetter;
                    SaveDesktopConfig(config);
                }
                if (!String.IsNullOrWhiteSpace(mappedLetter))
                {
                    DesktopDriveMapping.RegisterAppearance(mappedLetter, installDir);
                }
            }
            catch
            {
            }
        }

        public string ResolveDriveHubPathForLocalPath(string localPath)
        {
            if (String.IsNullOrWhiteSpace(localPath))
            {
                return "";
            }

            try
            {
                DesktopConfig config = LoadDesktopConfig();
                EnsureDriveHubMapping(config);
                string myDriveHubPath = Path.Combine(driveRootPath, MyDriveHubName);
                string sharedDriveHubPath = Path.Combine(driveRootPath, SharedDriveHubName);
                Dictionary<string, string> desired = DesktopDriveHubLinks.Build(config, myDriveHubPath, sharedDriveHubPath);
                string target = Path.GetFullPath(localPath);
                foreach (KeyValuePair<string, string> item in desired.OrderByDescending(x => Path.GetFullPath(x.Value).Length))
                {
                    if (DesktopPathRules.SamePath(item.Value, target))
                    {
                        return item.Key;
                    }
                    if (DesktopSyncCommandRunner.PathIsInsideOrSame(item.Value, target))
                    {
                        string relative = DesktopFileSearch.MakeRelative(item.Value, target);
                        return Path.Combine(item.Key, relative);
                    }
                }
            }
            catch
            {
            }

            return "";
        }

        private void RegisterCloudFilesSyncRootToConfiguredFolder()
        {
            try
            {
                Directory.CreateDirectory(driveRootPath);
                CloudFilesIntegration.TryRegisterSyncRoot(driveRootPath);
            }
            catch
            {
            }
        }

        private static bool UseKoreanLabels()
        {
            return DesktopSyncText.UseKoreanLabels();
        }
    }
}
