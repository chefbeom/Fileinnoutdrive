using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;

namespace FileInNOutDesktop
{
    internal sealed class DesktopChangeTracker : IDisposable
    {
        private readonly List<FileSystemWatcher> watchers = new List<FileSystemWatcher>();
        private readonly HashSet<string> pendingChangePaths = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        private readonly object stateLock = new object();
        private readonly Action refreshStatusHints;
        private readonly Action<string> watcherErrorStatus;
        private bool pendingFileChange;
        private bool syncRunning;

        public DesktopChangeTracker(Action refreshStatusHints, Action<string> watcherErrorStatus)
        {
            this.refreshStatusHints = refreshStatusHints;
            this.watcherErrorStatus = watcherErrorStatus;
        }

        public bool HasPendingFileChange
        {
            get
            {
                lock (stateLock)
                {
                    return pendingFileChange;
                }
            }
        }

        public void RefreshWatchers(DesktopConfig config, string driveRootPath, string myDriveHubName, string sharedDriveHubName)
        {
            DisposeWatchers();
            AddWatcher(driveRootPath, false);
            AddWatcher(Path.Combine(driveRootPath, myDriveHubName), false);
            AddWatcher(Path.Combine(driveRootPath, sharedDriveHubName), false);
            AddSharedOwnerDriveHubWatchers(config, driveRootPath, sharedDriveHubName);
            if (config == null || config.SyncFolders == null)
            {
                return;
            }

            foreach (SyncFolderConfig folder in config.SyncFolders)
            {
                if (!folder.Enabled || String.IsNullOrWhiteSpace(folder.LocalPath) || !Directory.Exists(folder.LocalPath))
                {
                    continue;
                }
                AddWatcher(folder.LocalPath, true);
            }
        }

        public bool ShouldRunPendingSync(bool autoSyncEnabled)
        {
            lock (stateLock)
            {
                if (pendingFileChange && autoSyncEnabled && !syncRunning)
                {
                    pendingFileChange = false;
                    return true;
                }
                return false;
            }
        }

        public bool IsSyncRunning()
        {
            lock (stateLock)
            {
                return syncRunning;
            }
        }

        public bool TryBeginSyncRun()
        {
            lock (stateLock)
            {
                if (syncRunning)
                {
                    return false;
                }
                syncRunning = true;
                return true;
            }
        }

        public void EndSyncRun()
        {
            lock (stateLock)
            {
                syncRunning = false;
            }
        }

        public List<string> TakePendingChangePaths()
        {
            lock (stateLock)
            {
                List<string> paths = pendingChangePaths.ToList();
                pendingChangePaths.Clear();
                pendingFileChange = false;
                return paths;
            }
        }

        public void RestorePendingChangePaths(IEnumerable<string> paths)
        {
            if (paths == null)
            {
                return;
            }

            lock (stateLock)
            {
                foreach (string path in paths)
                {
                    if (pendingChangePaths.Count >= 128)
                    {
                        break;
                    }
                    if (!String.IsNullOrWhiteSpace(path))
                    {
                        pendingChangePaths.Add(path);
                    }
                }
                pendingFileChange = pendingChangePaths.Count > 0;
            }
        }

        public void Dispose()
        {
            DisposeWatchers();
        }

        private void AddWatcher(string path, bool includeSubdirectories)
        {
            if (String.IsNullOrWhiteSpace(path) || !Directory.Exists(path))
            {
                return;
            }

            try
            {
                FileSystemWatcher watcher = new FileSystemWatcher(path);
                watcher.IncludeSubdirectories = includeSubdirectories;
                watcher.InternalBufferSize = 64 * 1024;
                watcher.NotifyFilter = NotifyFilters.FileName | NotifyFilters.DirectoryName | NotifyFilters.LastWrite | NotifyFilters.Size;
                FileSystemEventHandler changed = delegate(object sender, FileSystemEventArgs e) { QueueFileChange(e.FullPath); };
                RenamedEventHandler renamed = delegate(object sender, RenamedEventArgs e)
                {
                    QueueFileChange(e.FullPath);
                    QueueFileChange(e.OldFullPath);
                };
                ErrorEventHandler watcherError = delegate(object sender, ErrorEventArgs e) { QueueFullSyncAfterWatcherError(path, e.GetException()); };
                watcher.Created += changed;
                watcher.Changed += changed;
                watcher.Deleted += changed;
                watcher.Renamed += renamed;
                watcher.Error += watcherError;
                watcher.EnableRaisingEvents = true;
                watchers.Add(watcher);
            }
            catch
            {
            }
        }

        private void AddSharedOwnerDriveHubWatchers(DesktopConfig config, string driveRootPath, string sharedDriveHubName)
        {
            string sharedDriveHubPath = Path.Combine(driveRootPath, sharedDriveHubName);
            if (!Directory.Exists(sharedDriveHubPath))
            {
                return;
            }

            HashSet<string> expectedOwners = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            if (config != null && config.SyncFolders != null)
            {
                foreach (SyncFolderConfig folder in config.SyncFolders)
                {
                    if (folder == null || !folder.Enabled || String.IsNullOrWhiteSpace(folder.RemotePath))
                    {
                        continue;
                    }

                    string owner = DesktopExplorerText.SharedRemoteOwner(folder.RemotePath);
                    if (!String.IsNullOrWhiteSpace(owner))
                    {
                        expectedOwners.Add(owner);
                    }
                }
            }

            try
            {
                foreach (string ownerPath in Directory.GetDirectories(sharedDriveHubPath))
                {
                    string ownerName = Path.GetFileName(ownerPath);
                    if (expectedOwners.Count > 0 && !expectedOwners.Contains(ownerName))
                    {
                        continue;
                    }
                    AddWatcher(ownerPath, false);
                }
            }
            catch
            {
            }
        }

        private void DisposeWatchers()
        {
            foreach (FileSystemWatcher watcher in watchers)
            {
                try
                {
                    watcher.EnableRaisingEvents = false;
                    watcher.Dispose();
                }
                catch
                {
                }
            }
            watchers.Clear();
        }

        private void QueueFileChange(string path)
        {
            if (ShouldIgnoreWatcherPath(path))
            {
                return;
            }
            lock (stateLock)
            {
                pendingFileChange = true;
                if (pendingChangePaths.Count < 128)
                {
                    pendingChangePaths.Add(path);
                }
            }
            if (refreshStatusHints != null)
            {
                refreshStatusHints();
            }
        }

        private void QueueFullSyncAfterWatcherError(string watchedPath, Exception error)
        {
            lock (stateLock)
            {
                pendingChangePaths.Clear();
                pendingFileChange = true;
            }

            string message = "\uBCC0\uACBD \uAC10\uC9C0 \uC7AC\uC2A4\uCE94 \uC608\uC57D";
            if (!String.IsNullOrWhiteSpace(watchedPath))
            {
                message += ": " + Path.GetFileName(watchedPath);
            }
            if (error != null && !String.IsNullOrWhiteSpace(error.Message))
            {
                message += " (" + error.Message + ")";
            }
            if (watcherErrorStatus != null)
            {
                watcherErrorStatus(message);
            }
        }

        private static bool ShouldIgnoreWatcherPath(string path)
        {
            if (String.IsNullOrWhiteSpace(path))
            {
                return true;
            }
            string fileName = Path.GetFileName(path);
            if (String.IsNullOrWhiteSpace(fileName))
            {
                return false;
            }
            if (fileName.Equals("desktop.ini", StringComparison.OrdinalIgnoreCase) ||
                fileName.EndsWith(".tmp", StringComparison.OrdinalIgnoreCase) ||
                fileName.EndsWith(".crdownload", StringComparison.OrdinalIgnoreCase) ||
                fileName.EndsWith(".part", StringComparison.OrdinalIgnoreCase) ||
                fileName.EndsWith(".fileinnout-download", StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }
            if (fileName.StartsWith("~$", StringComparison.OrdinalIgnoreCase) ||
                fileName.StartsWith(".", StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }
            return false;
        }
    }
}