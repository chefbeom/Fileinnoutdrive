using System;
using System.IO;

namespace FileInNOutDesktop
{
    internal static class DesktopExplorerText
    {
        public static string DisplayNameForFolder(SyncFolderConfig folder)
        {
            if (folder == null)
            {
                return "FileInNOut";
            }

            string fallback = "";
            try
            {
                fallback = Path.GetFileName((folder.LocalPath ?? "").TrimEnd('\\', '/'));
            }
            catch
            {
                fallback = "";
            }

            return SafeDesktopIniValue(folder.Name, String.IsNullOrWhiteSpace(fallback) ? "FileInNOut" : fallback);
        }

        public static string InfoTipForFolder(SyncFolderConfig folder, string defaultInfoTip)
        {
            if (folder == null)
            {
                return defaultInfoTip;
            }

            string remotePath = DesktopSyncText.NormalizeRemotePath(folder.RemotePath, folder.LocalPath);
            string direction = DesktopSyncText.DirectionLabel(folder.Direction);
            if (DesktopSyncText.UseKoreanLabels())
            {
                if (IsSharedRemotePath(remotePath))
                {
                    return "\uACF5\uC720\uBC1B\uC740 FileInNOut \uB3D9\uAE30\uD654 \uD3F4\uB354 - " + direction;
                }
                return "FileInNOut \uB3D9\uAE30\uD654 \uD3F4\uB354 - " + direction;
            }
            string sharedPrefix = IsSharedRemotePath(remotePath) ? "Shared " : "";
            return sharedPrefix + "FileInNOut sync folder - " + direction;
        }

        public static string StatusInfoTipForFolder(SyncFolderConfig folder, string status, string permission, string defaultInfoTip)
        {
            string baseTip = InfoTipForFolder(folder, defaultInfoTip);
            string remotePath = folder == null ? "" : DesktopSyncText.NormalizeRemotePath(folder.RemotePath, folder.LocalPath);
            string detail = baseTip + " | \uC0C1\uD0DC: " + status;
            if (folder != null && IsSharedRemotePath(remotePath))
            {
                if (!String.IsNullOrWhiteSpace(permission))
                {
                    detail += " | \uAD8C\uD55C: " + permission;
                }
                string owner = SharedRemoteOwner(remotePath);
                if (!String.IsNullOrWhiteSpace(owner))
                {
                    detail += " | \uC18C\uC720\uC790: " + owner;
                }
            }
            if (!String.IsNullOrWhiteSpace(remotePath))
            {
                detail += " | \uD074\uB77C\uC6B0\uB4DC: " + remotePath;
            }
            return detail;
        }

        public static string SafeDesktopIniValue(string value, string fallback)
        {
            string text = (value ?? "").Trim();
            if (String.IsNullOrWhiteSpace(text))
            {
                text = (fallback ?? "").Trim();
            }
            if (String.IsNullOrWhiteSpace(text))
            {
                text = "FileInNOut";
            }
            return text.Replace("\r", " ").Replace("\n", " ");
        }

        public static string SafeDriveLinkName(string preferredName, string targetFolder)
        {
            string name = (preferredName ?? "").Trim();
            if (String.IsNullOrWhiteSpace(name))
            {
                name = Path.GetFileName((targetFolder ?? "").TrimEnd('\\', '/'));
            }
            if (String.IsNullOrWhiteSpace(name))
            {
                name = "Sync folder";
            }

            foreach (char invalid in Path.GetInvalidFileNameChars())
            {
                name = name.Replace(invalid, '_');
            }
            name = name.Trim().TrimEnd('.');
            return String.IsNullOrWhiteSpace(name) ? "Sync folder" : name;
        }

        public static bool IsSharedRemotePath(string remotePath)
        {
            string normalized = (remotePath ?? "").Trim().Replace('\\', '/').Trim('/');
            return normalized.StartsWith("Shared/", StringComparison.OrdinalIgnoreCase);
        }

        public static string[] SharedRemotePathParts(string remotePath)
        {
            string normalized = (remotePath ?? "").Trim().Replace('\\', '/').Trim('/');
            return normalized.Split(new char[] { '/' }, StringSplitOptions.RemoveEmptyEntries);
        }

        public static string SharedRemoteOwner(string remotePath)
        {
            string[] parts = SharedRemotePathParts(remotePath);
            if (parts.Length < 3 || !String.Equals(parts[0], "Shared", StringComparison.OrdinalIgnoreCase))
            {
                return "";
            }
            return SafeDriveLinkName(parts[1], parts[1]);
        }

        public static string SharedRemoteFolderName(string remotePath)
        {
            string[] parts = SharedRemotePathParts(remotePath);
            if (parts.Length < 3 || !String.Equals(parts[0], "Shared", StringComparison.OrdinalIgnoreCase))
            {
                return "";
            }
            return SafeDriveLinkName(parts[parts.Length - 1], parts[parts.Length - 1]);
        }

        public static string SharedDriveLinkName(SyncFolderConfig folder, string targetFolder)
        {
            string owner = SharedRemoteOwner(folder == null ? "" : folder.RemotePath);
            string name = (folder == null ? "" : (folder.Name ?? "")).Trim();
            string ownerSuffix = String.IsNullOrWhiteSpace(owner) ? "" : " (" + owner + ")";
            if (!String.IsNullOrWhiteSpace(ownerSuffix) && name.EndsWith(ownerSuffix, StringComparison.OrdinalIgnoreCase))
            {
                name = name.Substring(0, name.Length - ownerSuffix.Length).Trim();
            }
            if (String.IsNullOrWhiteSpace(name))
            {
                name = SharedRemoteFolderName(folder == null ? "" : folder.RemotePath);
            }
            return SafeDriveLinkName(name, targetFolder);
        }
    }
}
