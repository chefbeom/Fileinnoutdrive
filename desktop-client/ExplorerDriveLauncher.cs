using System;
using System.Collections;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Text;
using System.Web.Script.Serialization;
using Microsoft.Win32;

namespace FileInNOutDesktop
{
    internal static class ExplorerDriveLauncher
    {
        private const string DefaultDriveLetter = "G";
        private const string MyDriveHubName = "\uB0B4 \uB4DC\uB77C\uC774\uBE0C";
        private const string SharedDriveHubName = "\uACF5\uC720 \uBB38\uC11C\uD568";
        private const string DriveRootInfoTip = "FileInNOut \uB4DC\uB77C\uC774\uBE0C";
        private const string MyDriveInfoTip = "\uB0B4\uAC00 \uB3D9\uAE30\uD654\uD558\uB294 \uD3F4\uB354";
        private const string SharedDriveInfoTip = "\uACF5\uC720\uBC1B\uC740 \uB3D9\uAE30\uD654 \uD3F4\uB354";

        public static int OpenDriveRoot()
        {
            try
            {
                string installDir = AppDomain.CurrentDomain.BaseDirectory.TrimEnd('\\');
                string localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
                string configDir = Path.Combine(localAppData, "FileInNOutDesktop");
                string configPath = Path.Combine(configDir, "config.json");
                string driveRoot = Path.Combine(configDir, "drive-root");
                string defaultSyncDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "FileInNOut");
                string driveLetter = DefaultDriveLetter;
                Dictionary<string, object> configValues = null;

                if (File.Exists(configPath))
                {
                    try
                    {
                        JavaScriptSerializer serializer = new JavaScriptSerializer();
                        Dictionary<string, object> values = serializer.Deserialize<Dictionary<string, object>>(File.ReadAllText(configPath));
                        if (values != null)
                        {
                            configValues = values;
                            object value;
                            if (values.TryGetValue("driveRoot", out value) && value != null && !String.IsNullOrWhiteSpace(Convert.ToString(value)))
                            {
                                driveRoot = Convert.ToString(value);
                            }
                            if (values.TryGetValue("driveLetter", out value) && value != null)
                            {
                                driveLetter = Convert.ToString(value);
                            }
                        }
                    }
                    catch
                    {
                    }
                }

                Directory.CreateDirectory(driveRoot);
                EnsureDriveRootLayout(installDir, driveRoot, configValues, defaultSyncDir);
                string mappedLetter = EnsureDriveMapping(driveLetter, driveRoot);
                if (!String.IsNullOrWhiteSpace(mappedLetter))
                {
                    if (!String.Equals(mappedLetter, NormalizeDriveLetter(driveLetter), StringComparison.OrdinalIgnoreCase))
                    {
                        SaveDriveLetter(configPath, configValues, driveRoot, mappedLetter);
                    }
                    RegisterDriveAppearance(installDir, mappedLetter);

                    string drivePath = mappedLetter + ":\\";
                    if (Directory.Exists(drivePath))
                    {
                        Process.Start("explorer.exe", Quote(drivePath));
                        return 0;
                    }
                }

                Process.Start("explorer.exe", Quote(driveRoot));
                return 0;
            }
            catch
            {
                return 1;
            }
        }

        private static string EnsureDriveMapping(string driveLetter, string targetFolder)
        {
            string letter = NormalizeDriveLetter(driveLetter);
            if (String.IsNullOrWhiteSpace(letter) || String.IsNullOrWhiteSpace(targetFolder))
            {
                return "";
            }

            try
            {
                string target = Path.GetFullPath(targetFolder);
                foreach (string candidate in DriveLetterCandidates(letter))
                {
                    string currentTarget = CurrentSubstTarget(candidate);
                    if (!String.IsNullOrWhiteSpace(currentTarget) && SamePath(ResolvePathIfPossible(currentTarget), target))
                    {
                        return candidate;
                    }
                    if (!String.IsNullOrWhiteSpace(currentTarget) || Directory.Exists(candidate + ":\\"))
                    {
                        continue;
                    }

                    RunHiddenProcess("cmd.exe", "/d /c subst " + candidate + ": " + Quote(target));
                    string mappedTarget = CurrentSubstTarget(candidate);
                    if (!String.IsNullOrWhiteSpace(mappedTarget) && SamePath(ResolvePathIfPossible(mappedTarget), target))
                    {
                        return candidate;
                    }
                }
            }
            catch
            {
            }
            return "";
        }

        private static void EnsureDriveRootLayout(string installDir, string driveRoot, Dictionary<string, object> configValues, string defaultSyncDir)
        {
            try
            {
                Directory.CreateDirectory(driveRoot);
                string iconPath = Path.Combine(installDir, "FileInNOutDesktop.ico");
                ApplyExplorerFolderBranding(driveRoot, iconPath, "FileInNOut", DriveRootInfoTip);

                string myDriveHub = Path.Combine(driveRoot, MyDriveHubName);
                string sharedDriveHub = Path.Combine(driveRoot, SharedDriveHubName);
                Directory.CreateDirectory(myDriveHub);
                Directory.CreateDirectory(sharedDriveHub);
                ApplyExplorerFolderBranding(myDriveHub, iconPath, MyDriveHubName, MyDriveInfoTip);
                ApplyExplorerFolderBranding(sharedDriveHub, iconPath, SharedDriveHubName, SharedDriveInfoTip);
                SyncDriveHubLinks(iconPath, myDriveHub, sharedDriveHub, LoadConfiguredSyncFolders(configValues, defaultSyncDir));
            }
            catch
            {
            }
        }

        private static List<SyncFolderConfig> LoadConfiguredSyncFolders(Dictionary<string, object> configValues, string defaultSyncDir)
        {
            List<SyncFolderConfig> folders = new List<SyncFolderConfig>();
            if (configValues != null && configValues.ContainsKey("syncFolders"))
            {
                IEnumerable values = configValues["syncFolders"] as IEnumerable;
                if (values != null && !(configValues["syncFolders"] is string))
                {
                    foreach (object item in values)
                    {
                        Dictionary<string, object> data = item as Dictionary<string, object>;
                        if (data == null)
                        {
                            continue;
                        }

                        string localPath = ReadString(data, "localPath");
                        if (String.IsNullOrWhiteSpace(localPath))
                        {
                            continue;
                        }

                        SyncFolderConfig folder = new SyncFolderConfig();
                        folder.Name = ReadString(data, "name");
                        folder.LocalPath = localPath;
                        folder.RemotePath = NormalizeRemotePathForFolder(ReadString(data, "remotePath"), localPath);
                        folder.Enabled = !data.ContainsKey("enabled") || Convert.ToBoolean(data["enabled"]);
                        folders.Add(folder);
                    }
                }
            }

            if (folders.Any(folder => folder.Enabled))
            {
                return folders;
            }

            string syncDir = configValues == null ? "" : ReadString(configValues, "syncDir");
            if (String.IsNullOrWhiteSpace(syncDir))
            {
                syncDir = defaultSyncDir;
            }
            if (String.IsNullOrWhiteSpace(syncDir))
            {
                return folders;
            }

            try
            {
                Directory.CreateDirectory(syncDir);
            }
            catch
            {
            }
            SyncFolderConfig defaultFolder = new SyncFolderConfig();
            defaultFolder.Name = Path.GetFileName(syncDir.TrimEnd('\\', '/'));
            defaultFolder.LocalPath = syncDir;
            defaultFolder.RemotePath = NormalizeRemotePathForFolder("", syncDir);
            defaultFolder.Enabled = true;
            folders.Add(defaultFolder);
            return folders;
        }

        private static string ReadString(Dictionary<string, object> values, string key)
        {
            object value;
            if (values != null && values.TryGetValue(key, out value) && value != null)
            {
                return Convert.ToString(value) ?? "";
            }
            return "";
        }

        private static void SyncDriveHubLinks(string iconPath, string myDriveHub, string sharedDriveHub, List<SyncFolderConfig> folders)
        {
            Dictionary<string, string> desired = BuildDriveHubLinks(folders, myDriveHub, sharedDriveHub);
            string driveRoot = Path.GetDirectoryName(myDriveHub);
            RemoveStaleDriveHubLinks(driveRoot, desired, false);
            RemoveStaleDriveHubLinks(myDriveHub, desired, false);
            RemoveStaleDriveHubLinks(sharedDriveHub, desired, true);
            foreach (KeyValuePair<string, string> item in desired)
            {
                EnsureDriveHubJunction(item.Key, item.Value);
            }
            PruneEmptySharedOwnerFolders(sharedDriveHub, desired);
            ApplySharedOwnerFolderBranding(iconPath, sharedDriveHub, desired);
        }

        private static Dictionary<string, string> BuildDriveHubLinks(List<SyncFolderConfig> folders, string myDriveHub, string sharedDriveHub)
        {
            return DesktopDriveHubLinks.Build(folders, myDriveHub, sharedDriveHub);
        }

        private static void EnsureDriveHubJunction(string linkPath, string targetFolder)
        {
            try
            {
                if (SamePath(linkPath, targetFolder))
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

                RunHiddenProcess("cmd.exe", "/d /c mklink /J " + Quote(linkPath) + " " + Quote(targetFolder));
            }
            catch
            {
            }
        }

        private static void RemoveStaleDriveHubLinks(string rootPath, Dictionary<string, string> desired, bool recurse)
        {
            if (String.IsNullOrWhiteSpace(rootPath) || !Directory.Exists(rootPath))
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
                    if (desired != null && desired.ContainsKey(path))
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

        private static void ApplySharedOwnerFolderBranding(string iconPath, string sharedDriveHub, Dictionary<string, string> desired)
        {
            if (String.IsNullOrWhiteSpace(sharedDriveHub) || desired == null)
            {
                return;
            }

            HashSet<string> brandedOwners = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (string linkPath in desired.Keys)
            {
                try
                {
                    string ownerPath = Path.GetDirectoryName(linkPath);
                    string ownerParent = String.IsNullOrWhiteSpace(ownerPath) ? "" : Path.GetDirectoryName(ownerPath);
                    if (String.IsNullOrWhiteSpace(ownerParent) || !SamePath(ownerParent, sharedDriveHub))
                    {
                        continue;
                    }
                    if (brandedOwners.Add(ownerPath))
                    {
                        ApplyExplorerFolderBranding(ownerPath, iconPath, Path.GetFileName(ownerPath), "\uACF5\uC720 \uBB38\uC11C\uD568 \uC18C\uC720\uC790 \uD3F4\uB354");
                    }
                }
                catch
                {
                }
            }
        }

        private static void PruneEmptySharedOwnerFolders(string sharedDriveHub, Dictionary<string, string> desired)
        {
            if (String.IsNullOrWhiteSpace(sharedDriveHub) || !Directory.Exists(sharedDriveHub))
            {
                return;
            }

            HashSet<string> activeOwners = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            if (desired != null)
            {
                foreach (string linkPath in desired.Keys)
                {
                    try
                    {
                        string ownerPath = Path.GetDirectoryName(linkPath);
                        string ownerParent = String.IsNullOrWhiteSpace(ownerPath) ? "" : Path.GetDirectoryName(ownerPath);
                        if (!String.IsNullOrWhiteSpace(ownerParent) && SamePath(ownerParent, sharedDriveHub))
                        {
                            activeOwners.Add(Path.GetFullPath(ownerPath));
                        }
                    }
                    catch
                    {
                    }
                }
            }

            foreach (string ownerPath in Directory.GetDirectories(sharedDriveHub))
            {
                try
                {
                    string resolvedOwnerPath = Path.GetFullPath(ownerPath);
                    if (activeOwners.Contains(resolvedOwnerPath))
                    {
                        continue;
                    }
                    DirectoryInfo ownerInfo = new DirectoryInfo(ownerPath);
                    if ((ownerInfo.Attributes & FileAttributes.ReparsePoint) != 0 || OwnerFolderHasUserContent(ownerPath))
                    {
                        continue;
                    }

                    string desktopIniPath = Path.Combine(ownerPath, "desktop.ini");
                    if (File.Exists(desktopIniPath))
                    {
                        File.SetAttributes(desktopIniPath, FileAttributes.Normal);
                        File.Delete(desktopIniPath);
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

        private static string NormalizeRemotePathForFolder(string remotePath, string localPath)
        {
            string text = (remotePath ?? "").Trim().Replace('\\', '/').Trim('/');
            if (!String.IsNullOrWhiteSpace(text))
            {
                return text;
            }
            return DesktopExplorerText.SafeDriveLinkName(Path.GetFileName((localPath ?? "").TrimEnd('\\', '/')), localPath);
        }

        private static void ApplyExplorerFolderBranding(string folderPath, string iconPath, string displayName, string infoTip)
        {
            if (String.IsNullOrWhiteSpace(folderPath))
            {
                return;
            }

            try
            {
                Directory.CreateDirectory(folderPath);
                List<string> lines = new List<string>();
                lines.Add("[.ShellClassInfo]");
                lines.Add("LocalizedResourceName=" + SafeDesktopIniValue(displayName, "FileInNOut"));
                lines.Add("InfoTip=" + SafeDesktopIniValue(infoTip, "FileInNOut"));
                if (File.Exists(iconPath))
                {
                    lines.Add("IconResource=" + iconPath + ",0");
                    lines.Add("IconFile=" + iconPath);
                    lines.Add("IconIndex=0");
                }
                lines.Add("");

                string desktopIniPath = Path.Combine(folderPath, "desktop.ini");
                File.WriteAllText(desktopIniPath, String.Join(Environment.NewLine, lines.ToArray()), Encoding.Unicode);
                File.SetAttributes(desktopIniPath, FileAttributes.Hidden | FileAttributes.System | FileAttributes.Archive);
                DirectoryInfo directory = new DirectoryInfo(folderPath);
                directory.Attributes = directory.Attributes | FileAttributes.System | FileAttributes.ReadOnly;
            }
            catch
            {
            }
        }

        private static string SafeDesktopIniValue(string value, string fallback)
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

        private static void RegisterDriveAppearance(string installDir, string driveLetter)
        {
            string letter = NormalizeDriveLetter(driveLetter);
            if (String.IsNullOrWhiteSpace(letter))
            {
                return;
            }

            try
            {
                string iconPath = Path.Combine(installDir, "FileInNOutDesktop.ico");
                string iconValue = File.Exists(iconPath) ? iconPath + ",0" : "%SystemRoot%\\System32\\shell32.dll,3";
                string driveIconsPath = "Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\DriveIcons\\" + letter;
                using (RegistryKey iconKey = Registry.CurrentUser.CreateSubKey(driveIconsPath + "\\DefaultIcon"))
                {
                    if (iconKey != null)
                    {
                        iconKey.SetValue("", iconValue, RegistryValueKind.String);
                    }
                }
                using (RegistryKey labelKey = Registry.CurrentUser.CreateSubKey(driveIconsPath + "\\DefaultLabel"))
                {
                    if (labelKey != null)
                    {
                        labelKey.SetValue("", "FileInNOut", RegistryValueKind.String);
                    }
                }
            }
            catch
            {
            }
        }

        private static void SaveDriveLetter(string configPath, Dictionary<string, object> configValues, string driveRoot, string driveLetter)
        {
            try
            {
                Dictionary<string, object> values = configValues ?? new Dictionary<string, object>();
                values["driveRoot"] = driveRoot;
                values["driveLetter"] = NormalizeDriveLetter(driveLetter);
                Directory.CreateDirectory(Path.GetDirectoryName(configPath));
                JavaScriptSerializer serializer = new JavaScriptSerializer();
                File.WriteAllText(configPath, serializer.Serialize(values));
            }
            catch
            {
            }
        }

        private static IEnumerable<string> DriveLetterCandidates(string preferredLetter)
        {
            return DesktopPathRules.DriveLetterCandidates(preferredLetter);
        }

        private static string CurrentSubstTarget(string driveLetter)
        {
            string letter = NormalizeDriveLetter(driveLetter);
            if (String.IsNullOrWhiteSpace(letter))
            {
                return "";
            }

            CommandResult result = RunHiddenProcess("cmd.exe", "/d /c subst");
            if (result.ExitCode != 0)
            {
                return "";
            }

            string prefix = letter + ":\\: => ";
            foreach (string rawLine in result.Output.Split(new[] { "\r\n", "\n" }, StringSplitOptions.RemoveEmptyEntries))
            {
                string line = rawLine.Trim();
                if (line.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
                {
                    return line.Substring(prefix.Length).Trim();
                }
            }
            return "";
        }

        private static CommandResult RunHiddenProcess(string fileName, string arguments)
        {
            return DesktopProcessRunner.RunHidden(fileName, arguments);
        }

        private static string NormalizeDriveLetter(string value)
        {
            return DesktopPathRules.NormalizeDriveLetter(value);
        }

        private static bool SamePath(string left, string right)
        {
            return DesktopPathRules.SamePath(left, right);
        }

        private static string ResolvePathIfPossible(string path)
        {
            return DesktopProcessRunner.ResolvePathIfPossible(path);
        }

        private static string Quote(string value)
        {
            return DesktopProcessRunner.Quote(value);
        }
    }
}
