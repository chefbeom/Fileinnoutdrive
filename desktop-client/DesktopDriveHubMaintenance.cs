using System;
using System.Collections.Generic;
using System.IO;

namespace FileInNOutDesktop
{
    internal sealed class DesktopDriveHubMaintenance
    {
        private readonly string installDir;
        private readonly string sharedOwnerInfoTip;
        private readonly Action<string, string, string> applyExplorerFolderBranding;
        private readonly Action<string> clearExplorerFolderBranding;

        public DesktopDriveHubMaintenance(
            string installDir,
            string sharedOwnerInfoTip,
            Action<string, string, string> applyExplorerFolderBranding,
            Action<string> clearExplorerFolderBranding)
        {
            this.installDir = installDir ?? "";
            this.sharedOwnerInfoTip = sharedOwnerInfoTip ?? "";
            this.applyExplorerFolderBranding = applyExplorerFolderBranding;
            this.clearExplorerFolderBranding = clearExplorerFolderBranding;
        }

        public void SyncDriveHubLinks(string driveRootPath, string myDriveHubPath, string sharedDriveHubPath, Dictionary<string, string> desired)
        {
            if (desired == null)
            {
                return;
            }

            RemoveStaleDriveHubLinks(driveRootPath, desired, false);
            RemoveStaleDriveHubLinks(myDriveHubPath, desired, false);
            RemoveStaleDriveHubLinks(sharedDriveHubPath, desired, true);
            foreach (KeyValuePair<string, string> item in desired)
            {
                EnsureDriveHubJunction(item.Key, item.Value);
            }
            PruneEmptySharedOwnerFolders(sharedDriveHubPath, desired);
            ApplySharedOwnerFolderBranding(sharedDriveHubPath, desired);
        }

        private void ApplySharedOwnerFolderBranding(string sharedDriveHubPath, Dictionary<string, string> desired)
        {
            if (String.IsNullOrWhiteSpace(sharedDriveHubPath) || desired == null || applyExplorerFolderBranding == null)
            {
                return;
            }

            HashSet<string> brandedOwners = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (string linkPath in desired.Keys)
            {
                try
                {
                    string ownerPath = Path.GetDirectoryName(linkPath);
                    if (String.IsNullOrWhiteSpace(ownerPath) || DesktopPathRules.SamePath(ownerPath, sharedDriveHubPath))
                    {
                        continue;
                    }

                    string ownerParent = Path.GetDirectoryName(ownerPath);
                    if (String.IsNullOrWhiteSpace(ownerParent) || !DesktopPathRules.SamePath(ownerParent, sharedDriveHubPath))
                    {
                        continue;
                    }

                    if (brandedOwners.Add(ownerPath))
                    {
                        applyExplorerFolderBranding(ownerPath, Path.GetFileName(ownerPath), sharedOwnerInfoTip);
                    }
                }
                catch
                {
                }
            }
        }

        private void PruneEmptySharedOwnerFolders(string sharedDriveHubPath, Dictionary<string, string> desired)
        {
            if (String.IsNullOrWhiteSpace(sharedDriveHubPath) || desired == null || !Directory.Exists(sharedDriveHubPath))
            {
                return;
            }

            HashSet<string> activeOwners = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (string linkPath in desired.Keys)
            {
                try
                {
                    string ownerPath = Path.GetDirectoryName(linkPath);
                    if (String.IsNullOrWhiteSpace(ownerPath) || DesktopPathRules.SamePath(ownerPath, sharedDriveHubPath))
                    {
                        continue;
                    }

                    string ownerParent = Path.GetDirectoryName(ownerPath);
                    if (!String.IsNullOrWhiteSpace(ownerParent) && DesktopPathRules.SamePath(ownerParent, sharedDriveHubPath))
                    {
                        activeOwners.Add(Path.GetFullPath(ownerPath));
                    }
                }
                catch
                {
                }
            }

            foreach (string ownerPath in Directory.GetDirectories(sharedDriveHubPath))
            {
                try
                {
                    string resolvedOwnerPath = Path.GetFullPath(ownerPath);
                    if (activeOwners.Contains(resolvedOwnerPath))
                    {
                        continue;
                    }

                    DirectoryInfo ownerInfo = new DirectoryInfo(ownerPath);
                    if ((ownerInfo.Attributes & FileAttributes.ReparsePoint) != 0)
                    {
                        continue;
                    }

                    if (OwnerFolderHasUserContent(ownerPath))
                    {
                        continue;
                    }

                    if (clearExplorerFolderBranding != null)
                    {
                        clearExplorerFolderBranding(ownerPath);
                    }
                    if (!OwnerFolderHasUserContent(ownerPath))
                    {
                        Directory.Delete(ownerPath, false);
                    }
                }
                catch
                {
                }
            }
        }

        private static bool OwnerFolderHasUserContent(string ownerPath)
        {
            if (String.IsNullOrWhiteSpace(ownerPath) || !Directory.Exists(ownerPath))
            {
                return false;
            }

            try
            {
                foreach (string directory in Directory.GetDirectories(ownerPath))
                {
                    return true;
                }
                foreach (string file in Directory.GetFiles(ownerPath))
                {
                    if (!String.Equals(Path.GetFileName(file), "desktop.ini", StringComparison.OrdinalIgnoreCase))
                    {
                        return true;
                    }
                }
            }
            catch
            {
                return true;
            }
            return false;
        }

        private static bool RemoveEmptyHubConflictDirectory(string folderPath)
        {
            if (String.IsNullOrWhiteSpace(folderPath) || !Directory.Exists(folderPath))
            {
                return false;
            }

            try
            {
                DirectoryInfo info = new DirectoryInfo(folderPath);
                if ((info.Attributes & FileAttributes.ReparsePoint) != 0 || OwnerFolderHasUserContent(folderPath))
                {
                    return false;
                }

                string desktopIniPath = Path.Combine(folderPath, "desktop.ini");
                if (File.Exists(desktopIniPath))
                {
                    File.SetAttributes(desktopIniPath, FileAttributes.Normal);
                    File.Delete(desktopIniPath);
                }
                if (OwnerFolderHasUserContent(folderPath))
                {
                    return false;
                }
                Directory.Delete(folderPath, false);
                return true;
            }
            catch
            {
                return false;
            }
        }

        private void RemoveStaleDriveHubLinks(string rootPath, Dictionary<string, string> desired, bool recurse)
        {
            if (String.IsNullOrWhiteSpace(rootPath) || desired == null || !Directory.Exists(rootPath))
            {
                return;
            }

            foreach (string path in Directory.GetDirectories(rootPath))
            {
                try
                {
                    DirectoryInfo info = new DirectoryInfo(path);
                    if ((info.Attributes & FileAttributes.ReparsePoint) == 0)
                    {
                        if (recurse)
                        {
                            RemoveStaleDriveHubLinks(path, desired, true);
                        }
                        continue;
                    }
                    if (desired.ContainsKey(path))
                    {
                        continue;
                    }
                    Directory.Delete(path);
                }
                catch
                {
                }
            }
        }

        private void EnsureDriveHubJunction(string linkPath, string targetFolder)
        {
            try
            {
                if (DesktopPathRules.SamePath(linkPath, targetFolder))
                {
                    return;
                }

                string parent = Path.GetDirectoryName(linkPath);
                if (!String.IsNullOrWhiteSpace(parent))
                {
                    Directory.CreateDirectory(parent);
                }

                if (Directory.Exists(linkPath))
                {
                    DirectoryInfo info = new DirectoryInfo(linkPath);
                    if ((info.Attributes & FileAttributes.ReparsePoint) != 0)
                    {
                        Directory.Delete(linkPath);
                    }
                    else if (!RemoveEmptyHubConflictDirectory(linkPath))
                    {
                        return;
                    }
                }

                DesktopProcessRunner.RunHidden("cmd.exe", "/d /c mklink /J " + DesktopProcessRunner.Quote(linkPath) + " " + DesktopProcessRunner.Quote(targetFolder), installDir);
            }
            catch
            {
            }
        }
    }
}