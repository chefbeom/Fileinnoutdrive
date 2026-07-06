using System;
using System.Collections.Generic;
using System.IO;

namespace FileInNOutDesktop
{
    internal static class DesktopDriveHubLinks
    {
        public static Dictionary<string, string> Build(DesktopConfig config, string myDriveHubPath, string sharedDriveHubPath)
        {
            return Build(config == null ? null : config.SyncFolders, myDriveHubPath, sharedDriveHubPath);
        }

        public static Dictionary<string, string> Build(IEnumerable<SyncFolderConfig> folders, string myDriveHubPath, string sharedDriveHubPath)
        {
            Dictionary<string, string> desired = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            if (folders == null)
            {
                return desired;
            }

            foreach (SyncFolderConfig folder in folders)
            {
                if (folder == null || !folder.Enabled || String.IsNullOrWhiteSpace(folder.LocalPath))
                {
                    continue;
                }
                if (!Directory.Exists(folder.LocalPath))
                {
                    continue;
                }

                string target = Path.GetFullPath(folder.LocalPath);
                string hubPath = myDriveHubPath;
                string name = DesktopExplorerText.SafeDriveLinkName(folder.Name, target);
                if (DesktopExplorerText.IsSharedRemotePath(folder.RemotePath))
                {
                    string owner = DesktopExplorerText.SharedRemoteOwner(folder.RemotePath);
                    hubPath = String.IsNullOrWhiteSpace(owner) ? sharedDriveHubPath : Path.Combine(sharedDriveHubPath, owner);
                    name = DesktopExplorerText.SharedDriveLinkName(folder, target);
                }

                string uniqueName = name;
                int suffix = 2;
                string linkPath = Path.Combine(hubPath, uniqueName);
                while (desired.ContainsKey(linkPath) && !DesktopPathRules.SamePath(desired[linkPath], target))
                {
                    uniqueName = name + " " + suffix.ToString();
                    linkPath = Path.Combine(hubPath, uniqueName);
                    suffix++;
                }
                desired[linkPath] = target;
            }

            return desired;
        }
    }
}