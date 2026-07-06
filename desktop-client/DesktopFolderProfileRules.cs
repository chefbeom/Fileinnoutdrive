using System;
using System.Text;
using System.IO;
using System.Linq;

namespace FileInNOutDesktop
{
    internal static class DesktopFolderProfileRules
    {
        public static SyncFolderConfig DefaultFolderConfig(string localPath)
        {
            return DesktopTrayConfigStore.DefaultFolderConfig(localPath);
        }

        public static string DefaultSyncDir()
        {
            return DesktopTrayConfigStore.DefaultSyncDir();
        }

        public static void EnsureDefaultFolder(DesktopConfig config)
        {
            if (config == null || config.SyncFolders.Count > 0)
            {
                return;
            }
            config.SyncFolders.Add(DefaultFolderConfig(config.SyncDir));
        }

        public static SyncFolderConfig FirstEnabledFolder(DesktopConfig config)
        {
            if (config != null)
            {
                foreach (SyncFolderConfig folder in config.SyncFolders)
                {
                    if (folder.Enabled)
                    {
                        return folder;
                    }
                }
                return DefaultFolderConfig(config.SyncDir);
            }
            return DefaultFolderConfig(DefaultSyncDir());
        }

        public static SyncFolderConfig NormalizeForSave(SyncFolderConfig folder)
        {
            Directory.CreateDirectory(folder.LocalPath);
            folder.LocalPath = Path.GetFullPath(folder.LocalPath);
            folder.RemotePath = DesktopSyncText.NormalizeRemotePath(folder.RemotePath, folder.LocalPath);
            folder.Direction = DesktopSyncText.NormalizeDirection(folder.Direction);
            folder.Name = String.IsNullOrWhiteSpace(folder.Name) ? Path.GetFileName(folder.LocalPath) : folder.Name;
            folder.Enabled = true;
            return folder;
        }

        public static void UpsertFolder(DesktopConfig config, SyncFolderConfig folder)
        {
            if (config == null || folder == null)
            {
                return;
            }
            config.SyncDir = folder.LocalPath;
            int existing = config.SyncFolders.FindIndex(x => DesktopPathRules.SamePath(x.LocalPath, folder.LocalPath));
            if (existing >= 0)
            {
                if (String.IsNullOrWhiteSpace(folder.Permission))
                {
                    folder.Permission = config.SyncFolders[existing].Permission;
                }
                config.SyncFolders[existing] = folder;
            }
            else
            {
                config.SyncFolders.Add(folder);
            }
        }

        public static bool RemoveFolder(DesktopConfig config, string localPath)
        {
            if (config == null)
            {
                return false;
            }

            var removedShared = config.SyncFolders
                .Where(x => DesktopPathRules.SamePath(x.LocalPath, localPath) && DesktopExplorerText.IsSharedRemotePath(x.RemotePath))
                .ToList();
            config.SyncFolders.RemoveAll(x => DesktopPathRules.SamePath(x.LocalPath, localPath));
            foreach (SyncFolderConfig folder in removedShared)
            {
                folder.Enabled = false;
                config.SyncFolders.Add(folder);
            }
            if (!config.SyncFolders.Any(x => x.Enabled))
            {
                config.SyncFolders.Add(DefaultFolderConfig(config.SyncDir));
            }
            return config.SyncFolders.Any(x => DesktopPathRules.SamePath(x.LocalPath, localPath));
        }

        public static string Signature(DesktopConfig config)
        {
            if (config == null || config.SyncFolders == null)
            {
                return "";
            }

            StringBuilder builder = new StringBuilder();
            foreach (SyncFolderConfig folder in config.SyncFolders)
            {
                if (folder == null)
                {
                    continue;
                }
                builder.Append(folder.Enabled ? "1" : "0").Append('|');
                builder.Append(NormalizePathForSignature(folder.LocalPath)).Append('|');
                builder.Append(DesktopSyncText.NormalizeRemotePath(folder.RemotePath, folder.LocalPath)).Append('|');
                builder.Append(DesktopSyncText.NormalizeDirection(folder.Direction)).Append('|');
                builder.Append(folder.Name ?? "").Append('\n');
            }
            return builder.ToString();
        }

        private static string NormalizePathForSignature(string path)
        {
            if (String.IsNullOrWhiteSpace(path))
            {
                return "";
            }
            try
            {
                return Path.GetFullPath(path).TrimEnd('\\', '/').ToUpperInvariant();
            }
            catch
            {
                return path.Trim().TrimEnd('\\', '/').ToUpperInvariant();
            }
        }
    }
}