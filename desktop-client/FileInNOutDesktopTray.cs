using System;
using System.Collections;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Windows.Forms;
using System.Web.Script.Serialization;
using Microsoft.Win32;

namespace FileInNOutDesktop
{
    internal static class Program
    {
        private const string MutexName = "FileInNOutDesktopTray";
        private const string ShowSettingsEventName = "FileInNOutDesktopShowSettings";

        [STAThread]
        private static void Main(string[] args)
        {
            if (HandleCommandLine(args))
            {
                return;
            }

            bool created;
            using (Mutex mutex = new Mutex(true, MutexName, out created))
            {
                if (!created)
                {
                    SignalExistingInstance();
                    return;
                }

                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);
                using (EventWaitHandle showSettingsEvent = new EventWaitHandle(false, EventResetMode.AutoReset, ShowSettingsEventName))
                using (TrayController controller = new TrayController(showSettingsEvent))
                {
                    controller.Start();
                    Application.Run();
                }
            }
        }

        private static bool HandleCommandLine(string[] args)
        {
            if (args == null || args.Length == 0)
            {
                return false;
            }

            string command = (args[0] ?? "").Trim().ToLowerInvariant();
            if (command == "--open-drive" || command == "--open-folder")
            {
                Environment.ExitCode = ExplorerDriveLauncher.OpenDriveRoot();
                return true;
            }

            if (command != "--register-sync-root" && command != "--unregister-sync-root")
            {
                return false;
            }

            string target = args.Length > 1 ? args[1] : "";
            try
            {
                if (command == "--register-sync-root")
                {
                    Environment.ExitCode = CloudFilesIntegration.RegisterSyncRoot(target);
                }
                else
                {
                    Environment.ExitCode = CloudFilesIntegration.UnregisterSyncRoot(target);
                }
            }
            catch (Exception error)
            {
                CloudFilesIntegration.WriteCommandLineFailure(command, target, error);
                Environment.ExitCode = 1;
            }
            return true;
        }

        private static void SignalExistingInstance()
        {
            try
            {
                using (EventWaitHandle existing = EventWaitHandle.OpenExisting(ShowSettingsEventName))
                {
                    existing.Set();
                }
            }
            catch
            {
            }
        }
    }

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
            Dictionary<string, string> desired = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            if (folders == null)
            {
                return desired;
            }

            foreach (SyncFolderConfig folder in folders)
            {
                if (folder == null || !folder.Enabled || String.IsNullOrWhiteSpace(folder.LocalPath) || !Directory.Exists(folder.LocalPath))
                {
                    continue;
                }

                string target = Path.GetFullPath(folder.LocalPath);
                string hubPath = myDriveHub;
                string name = SafeDriveLinkName(folder.Name, target);
                if (IsSharedRemotePath(folder.RemotePath))
                {
                    string owner = SharedRemoteOwner(folder.RemotePath);
                    hubPath = String.IsNullOrWhiteSpace(owner) ? sharedDriveHub : Path.Combine(sharedDriveHub, owner);
                    name = SharedDriveLinkName(folder, target);
                }

                string uniqueName = name;
                int suffix = 2;
                string linkPath = Path.Combine(hubPath, uniqueName);
                while (desired.ContainsKey(linkPath) && !SamePath(desired[linkPath], target))
                {
                    uniqueName = name + " " + suffix.ToString();
                    linkPath = Path.Combine(hubPath, uniqueName);
                    suffix++;
                }
                desired[linkPath] = target;
            }

            return desired;
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
            return SafeDriveLinkName(Path.GetFileName((localPath ?? "").TrimEnd('\\', '/')), localPath);
        }

        private static bool IsSharedRemotePath(string remotePath)
        {
            string[] parts = SharedRemotePathParts(remotePath);
            return parts.Length >= 3 && String.Equals(parts[0], "Shared", StringComparison.OrdinalIgnoreCase);
        }

        private static string[] SharedRemotePathParts(string remotePath)
        {
            string normalized = (remotePath ?? "").Trim().Replace('\\', '/').Trim('/');
            return normalized.Split(new char[] { '/' }, StringSplitOptions.RemoveEmptyEntries);
        }

        private static string SharedRemoteOwner(string remotePath)
        {
            string[] parts = SharedRemotePathParts(remotePath);
            if (parts.Length < 3 || !String.Equals(parts[0], "Shared", StringComparison.OrdinalIgnoreCase))
            {
                return "";
            }
            return SafeDriveLinkName(parts[1], parts[1]);
        }

        private static string SharedRemoteFolderName(string remotePath)
        {
            string[] parts = SharedRemotePathParts(remotePath);
            if (parts.Length < 3 || !String.Equals(parts[0], "Shared", StringComparison.OrdinalIgnoreCase))
            {
                return "";
            }
            return SafeDriveLinkName(parts[parts.Length - 1], parts[parts.Length - 1]);
        }

        private static string SharedDriveLinkName(SyncFolderConfig folder, string targetFolder)
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

        private static string SafeDriveLinkName(string preferredName, string targetFolder)
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
            HashSet<string> seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            string preferred = NormalizeDriveLetter(preferredLetter);
            if (!String.IsNullOrWhiteSpace(preferred))
            {
                for (char letter = preferred[0]; letter <= 'Z'; letter++)
                {
                    string value = letter.ToString();
                    if (seen.Add(value))
                    {
                        yield return value;
                    }
                }
            }

            for (char letter = 'G'; letter <= 'Z'; letter++)
            {
                string value = letter.ToString();
                if (seen.Add(value))
                {
                    yield return value;
                }
            }
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
            ProcessStartInfo info = new ProcessStartInfo();
            info.FileName = fileName;
            info.Arguments = arguments;
            info.UseShellExecute = false;
            info.RedirectStandardOutput = true;
            info.RedirectStandardError = true;
            info.CreateNoWindow = true;
            using (Process process = Process.Start(info))
            {
                string output = process.StandardOutput.ReadToEnd();
                string error = process.StandardError.ReadToEnd();
                process.WaitForExit();
                return new CommandResult(process.ExitCode, (output + Environment.NewLine + error).Trim());
            }
        }

        private static string NormalizeDriveLetter(string value)
        {
            string text = (value ?? "").Trim().TrimEnd(':').ToUpperInvariant();
            return Regex.IsMatch(text, "^[A-Z]$") ? text : "";
        }

        private static bool SamePath(string left, string right)
        {
            try
            {
                return String.Equals(
                    Path.GetFullPath(left).TrimEnd('\\', '/'),
                    Path.GetFullPath(right).TrimEnd('\\', '/'),
                    StringComparison.OrdinalIgnoreCase);
            }
            catch
            {
                return String.Equals((left ?? "").TrimEnd('\\', '/'), (right ?? "").TrimEnd('\\', '/'), StringComparison.OrdinalIgnoreCase);
            }
        }

        private static string ResolvePathIfPossible(string path)
        {
            try
            {
                return Path.GetFullPath(path);
            }
            catch
            {
                return path ?? "";
            }
        }

        private static string Quote(string value)
        {
            return "\"" + (value ?? "").Replace("\"", "") + "\"";
        }
    }

    internal sealed class TrayController : IDisposable
    {
        public const string DefaultServer = "http://192.168.35.151/api";
        private const int AutoSyncIntervalMs = 20000;
        private const string ExplorerNamespaceGuid = "{6F4F52E8-8E6F-4B94-A14D-8B22C50C13B9}";
        private const string DefaultDriveLetter = "G";
        private const string MyDriveHubName = "\uB0B4 \uB4DC\uB77C\uC774\uBE0C";
        private const string SharedDriveHubName = "\uACF5\uC720 \uBB38\uC11C\uD568";
        private const string DefaultExplorerFolderInfoTip = "FileInNOut 동기화 폴더";
        private const string DriveRootExplorerInfoTip = "FileInNOut 드라이브 - 내 드라이브와 공유 문서함";
        private const string MyDriveExplorerInfoTip = "내가 동기화하는 폴더";
        private const string SharedDriveExplorerInfoTip = "공유받은 동기화 폴더";
        private const string SharedDriveOwnerExplorerInfoTip = "FileInNOut 공유 문서함 소유자 폴더";

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
        private readonly List<FileSystemWatcher> watchers = new List<FileSystemWatcher>();
        private readonly HashSet<string> pendingChangePaths = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        private readonly object syncStateLock = new object();
        private SettingsForm settingsForm;
        private Thread signalThread;
        private volatile bool pendingShowSettings;
        private volatile bool pendingFileChange;
        private volatile bool disposed;
        private bool autoSyncEnabled = true;
        private bool notificationsEnabled = true;
        private bool syncRunning;
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

            LoadTrayConfig();

            notifyIcon = new NotifyIcon();
            notifyIcon.Icon = LoadTrayIcon();
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
                bool shouldSync = false;
                lock (syncStateLock)
                {
                    if (pendingFileChange && autoSyncEnabled && !syncRunning)
                    {
                        pendingFileChange = false;
                        shouldSync = true;
                    }
                }
                if (shouldSync)
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
            get
            {
                lock (syncStateLock)
                {
                    return pendingFileChange;
                }
            }
        }
        public bool AutoSyncEnabled { get { return autoSyncEnabled; } }
        public bool IsSyncPaused { get { return !autoSyncEnabled; } }
        public bool NotificationsEnabled { get { return notificationsEnabled; } }
        public string ConfigPath { get { return configPath; } }

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
            DisposeWatchers();
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

        private static string AccountKey(string email)
        {
            return (email ?? "").Trim().ToLowerInvariant();
        }

        private static void ApplyAccountProfile(Dictionary<string, object> values, DesktopConfig config)
        {
            string key = AccountKey(config.Email);
            if (String.IsNullOrWhiteSpace(key))
            {
                return;
            }

            Dictionary<string, object> accounts = ReadDictionary(values, "accounts");
            Dictionary<string, object> profile = ReadDictionary(accounts, key);
            if (profile.Count == 0)
            {
                return;
            }

            string value = ReadString(profile, "token");
            if (!String.IsNullOrWhiteSpace(value))
            {
                config.Token = value;
            }
            value = ReadString(profile, "refreshToken");
            if (!String.IsNullOrWhiteSpace(value))
            {
                config.RefreshToken = value;
            }
            value = ReadString(profile, "syncDir");
            if (!String.IsNullOrWhiteSpace(value))
            {
                config.SyncDir = value;
            }
            value = ReadString(profile, "driveLetter");
            if (!String.IsNullOrWhiteSpace(value))
            {
                config.DriveLetter = NormalizeDriveLetter(value);
            }

            object foldersValue;
            if (profile.TryGetValue("syncFolders", out foldersValue))
            {
                config.SyncFolders.Clear();
                LoadSyncFolders(foldersValue, config.SyncFolders);
            }
        }

        private static void SaveAccountProfile(Dictionary<string, object> values, DesktopConfig config, List<Dictionary<string, object>> folders)
        {
            string key = AccountKey(config.Email);
            if (String.IsNullOrWhiteSpace(key))
            {
                return;
            }

            Dictionary<string, object> accounts = ReadDictionary(values, "accounts");
            Dictionary<string, object> profile = ReadDictionary(accounts, key);
            accounts[key] = profile;
            values["accounts"] = accounts;

            if (!String.IsNullOrWhiteSpace(config.Token))
            {
                profile["token"] = config.Token;
            }
            else
            {
                profile.Remove("token");
            }

            if (!String.IsNullOrWhiteSpace(config.RefreshToken))
            {
                profile["refreshToken"] = config.RefreshToken;
            }
            else
            {
                profile.Remove("refreshToken");
            }

            profile["syncDir"] = !String.IsNullOrWhiteSpace(config.SyncDir) ? config.SyncDir : DefaultSyncDir();
            profile["driveLetter"] = NormalizeDriveLetter(config.DriveLetter);
            profile["syncFolders"] = folders;
        }

        public DesktopConfig LoadDesktopConfig()
        {
            DesktopConfig config = new DesktopConfig();
            config.Server = DefaultServer;
            config.SyncDir = DefaultSyncDir();
            config.DriveLetter = DefaultDriveLetter;

            if (!File.Exists(configPath))
            {
                config.SyncFolders.Add(DefaultFolderConfig(config.SyncDir));
                return config;
            }

            try
            {
                JavaScriptSerializer serializer = new JavaScriptSerializer();
                Dictionary<string, object> values = serializer.Deserialize<Dictionary<string, object>>(File.ReadAllText(configPath));
                if (values == null)
                {
                    config.SyncFolders.Add(DefaultFolderConfig(config.SyncDir));
                    return config;
                }

                object value;
                if (values.TryGetValue("server", out value) && value != null && !String.IsNullOrWhiteSpace(Convert.ToString(value)))
                {
                    config.Server = Convert.ToString(value);
                }
                if (values.TryGetValue("email", out value) && value != null)
                {
                    config.Email = Convert.ToString(value);
                }
                if (values.TryGetValue("token", out value) && value != null)
                {
                    config.Token = Convert.ToString(value);
                }
                if (values.TryGetValue("refreshToken", out value) && value != null)
                {
                    config.RefreshToken = Convert.ToString(value);
                }
                if (values.TryGetValue("syncDir", out value) && value != null && !String.IsNullOrWhiteSpace(Convert.ToString(value)))
                {
                    config.SyncDir = Convert.ToString(value);
                }
                if (values.TryGetValue("driveLetter", out value) && value != null)
                {
                    config.DriveLetter = NormalizeDriveLetter(Convert.ToString(value));
                }
                if (values.TryGetValue("syncFolders", out value))
                {
                    LoadSyncFolders(value, config.SyncFolders);
                }
                ApplyAccountProfile(values, config);
            }
            catch
            {
            }

            if (config.SyncFolders.Count == 0)
            {
                config.SyncFolders.Add(DefaultFolderConfig(config.SyncDir));
            }
            return config;
        }

        public void SaveDesktopConfig(DesktopConfig config)
        {
            Directory.CreateDirectory(configDir);
            JavaScriptSerializer serializer = new JavaScriptSerializer();
            Dictionary<string, object> existingValues = new Dictionary<string, object>();
            if (File.Exists(configPath))
            {
                try
                {
                    existingValues = serializer.Deserialize<Dictionary<string, object>>(File.ReadAllText(configPath)) ?? new Dictionary<string, object>();
                }
                catch
                {
                    existingValues = new Dictionary<string, object>();
                }
            }

            Dictionary<string, object> values = new Dictionary<string, object>();
            values["server"] = String.IsNullOrWhiteSpace(config.Server) ? DefaultServer : config.Server.TrimEnd('/');
            values["email"] = config.Email ?? "";
            if (!String.IsNullOrWhiteSpace(config.Token))
            {
                values["token"] = config.Token;
            }
            if (!String.IsNullOrWhiteSpace(config.RefreshToken))
            {
                values["refreshToken"] = config.RefreshToken;
            }
            values["syncDir"] = !String.IsNullOrWhiteSpace(config.SyncDir) ? config.SyncDir : DefaultSyncDir();
            values["driveLetter"] = NormalizeDriveLetter(config.DriveLetter);
            values["driveRoot"] = driveRootPath;

            List<Dictionary<string, object>> folders = new List<Dictionary<string, object>>();
            foreach (SyncFolderConfig folder in config.SyncFolders)
            {
                if (String.IsNullOrWhiteSpace(folder.LocalPath))
                {
                    continue;
                }
                Dictionary<string, object> item = new Dictionary<string, object>();
                item["name"] = String.IsNullOrWhiteSpace(folder.Name) ? Path.GetFileName(folder.LocalPath) : folder.Name;
                item["localPath"] = folder.LocalPath;
                item["remotePath"] = NormalizeRemotePath(folder.RemotePath, folder.LocalPath);
                item["direction"] = NormalizeDirection(folder.Direction);
                if (!String.IsNullOrWhiteSpace(folder.Permission))
                {
                    item["permission"] = NormalizePermission(folder.Permission);
                }
                item["enabled"] = folder.Enabled;
                folders.Add(item);
            }
            values["syncFolders"] = folders;
            values["accounts"] = ReadDictionary(existingValues, "accounts");
            SaveAccountProfile(values, config, folders);

            File.WriteAllText(configPath, serializer.Serialize(values));
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

            string driveLetter = NormalizeDriveLetter(config.DriveLetter);
            string drivePath = driveLetter + ":\\";
            string mappedTarget = CurrentSubstTarget(driveLetter);
            if (
                !String.IsNullOrWhiteSpace(driveLetter) &&
                Directory.Exists(drivePath) &&
                !String.IsNullOrWhiteSpace(mappedTarget) &&
                SamePath(ResolvePathIfPossible(mappedTarget), driveRootPath)
            )
            {
                Process.Start("explorer.exe", Quote(drivePath));
                return;
            }

            Directory.CreateDirectory(driveRootPath);
            Process.Start("explorer.exe", Quote(driveRootPath));
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
                Process.Start("explorer.exe", Quote(driveHubPath));
                return;
            }
            Process.Start("explorer.exe", Quote(localPath));
        }

        public void OpenWeb()
        {
            DesktopConfig config = LoadDesktopConfig();
            string url = (String.IsNullOrWhiteSpace(config.Server) ? DefaultServer : config.Server).Replace("/api", "").TrimEnd('/');
            Process.Start(url);
        }

        public void ToggleAutoSync()
        {
            if (UseKoreanLabels())
            {
                ToggleAutoSyncKorean();
                return;
            }
            autoSyncEnabled = !autoSyncEnabled;
            SaveTrayConfig();
            notifyIcon.ContextMenuStrip = BuildMenu();
            lastStatus = autoSyncEnabled ? "동기화 재개됨" : "동기화 일시정지됨";
            lastOutput = autoSyncEnabled ? "파일 변경 감지와 20초 자동 동기화가 다시 실행됩니다." : "파일 변경 감지와 20초 자동 동기화를 잠시 멈췄습니다. 지금 동기화는 계속 사용할 수 있습니다.";
            UpdateSettingsForm(false);
            ShowNotification("동기화 상태", autoSyncEnabled ? "동기화를 재개했습니다." : "동기화를 일시정지했습니다.", ToolTipIcon.Info);
        }

        public void SetNotifications(bool enabled)
        {
            notificationsEnabled = enabled;
            SaveTrayConfig();
            notifyIcon.ContextMenuStrip = BuildMenu();
        }

        private void ToggleAutoSyncKorean()
        {
            autoSyncEnabled = !autoSyncEnabled;
            SaveTrayConfig();
            notifyIcon.ContextMenuStrip = BuildMenu();
            lastStatus = autoSyncEnabled ? "\uB3D9\uAE30\uD654 \uC7AC\uAC1C\uB428" : "\uB3D9\uAE30\uD654 \uC77C\uC2DC\uC815\uC9C0\uB428";
            lastOutput = autoSyncEnabled
                ? "\uD30C\uC77C \uBCC0\uACBD \uAC10\uC9C0\uC640 20\uCD08 \uC790\uB3D9 \uB3D9\uAE30\uD654\uAC00 \uB2E4\uC2DC \uC2E4\uD589\uB429\uB2C8\uB2E4."
                : "\uD30C\uC77C \uBCC0\uACBD \uAC10\uC9C0\uC640 20\uCD08 \uC790\uB3D9 \uB3D9\uAE30\uD654\uB97C \uC7A0\uC2DC \uBA48\uCD94\uC5C8\uC2B5\uB2C8\uB2E4. \uC9C0\uAE08 \uB3D9\uAE30\uD654\uB294 \uACC4\uC18D \uC0AC\uC6A9\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.";
            UpdateSettingsForm(false);
            ShowNotification("\uB3D9\uAE30\uD654 \uC0C1\uD0DC", autoSyncEnabled ? "\uB3D9\uAE30\uD654\uB97C \uC7AC\uAC1C\uD588\uC2B5\uB2C8\uB2E4." : "\uB3D9\uAE30\uD654\uB97C \uC77C\uC2DC\uC815\uC9C0\uD588\uC2B5\uB2C8\uB2E4.", ToolTipIcon.Info);
        }

        private void LoginKorean(string email, string password)
        {
            if (String.IsNullOrWhiteSpace(email))
            {
                throw new InvalidOperationException("\uC774\uBA54\uC77C\uC744 \uC785\uB825\uD558\uC138\uC694.");
            }

            DesktopConfig config = LoadDesktopConfig();
            string server = String.IsNullOrWhiteSpace(config.Server) ? DefaultServer : config.Server;
            string args = "login --server " + Quote(server) + " --email " + Quote(email.Trim());
            if (!String.IsNullOrEmpty(password))
            {
                args += " --password " + Quote(password);
            }
            CommandResult result = RunCommand(args);
            if (result.ExitCode != 0)
            {
                throw new InvalidOperationException(result.Output);
            }

            config = LoadDesktopConfig();
            config.Server = server.TrimEnd('/');
            config.Email = email.Trim();
            if (config.SyncFolders.Count == 0)
            {
                config.SyncFolders.Add(DefaultFolderConfig(config.SyncDir));
            }
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
            Directory.CreateDirectory(folder.LocalPath);
            folder.LocalPath = Path.GetFullPath(folder.LocalPath);
            folder.RemotePath = NormalizeRemotePath(folder.RemotePath, folder.LocalPath);
            folder.Direction = NormalizeDirection(folder.Direction);
            folder.Name = String.IsNullOrWhiteSpace(folder.Name) ? Path.GetFileName(folder.LocalPath) : folder.Name;
            folder.Enabled = true;
            ApplyExplorerFolderBranding(folder.LocalPath, ExplorerDisplayNameForFolder(folder), ExplorerStatusInfoTipForFolder(folder));

            DesktopConfig config = LoadDesktopConfig();
            config.SyncDir = folder.LocalPath;
            int existing = config.SyncFolders.FindIndex(x => SamePath(x.LocalPath, folder.LocalPath));
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
            SaveDesktopConfig(config);
            EnsureDriveHubMapping(config);
            RegisterExplorerNamespace(driveRootPath);
            CloudFilesIntegration.TryRegisterSyncRoot(driveRootPath);

            CommandResult result = RunCommand("init --dir " + Quote(folder.LocalPath));
            lastStatus = "\uB3D9\uAE30\uD654 \uD3F4\uB354 \uC800\uC7A5\uB428";
            lastOutput = result.Output;
            RefreshWatchers();
            RefreshExplorerStatusHints();
        }

        private void RemoveFolderProfileKorean(string localPath)
        {
            DesktopConfig config = LoadDesktopConfig();
            List<SyncFolderConfig> removedShared = config.SyncFolders
                .Where(x => SamePath(x.LocalPath, localPath) && IsSharedRemotePath(x.RemotePath))
                .ToList();
            config.SyncFolders.RemoveAll(x => SamePath(x.LocalPath, localPath));
            foreach (SyncFolderConfig folder in removedShared)
            {
                folder.Enabled = false;
                config.SyncFolders.Add(folder);
            }
            if (!config.SyncFolders.Any(x => x.Enabled))
            {
                config.SyncFolders.Add(DefaultFolderConfig(config.SyncDir));
            }
            SaveDesktopConfig(config);
            EnsureDriveHubMapping(config);
            RefreshWatchers();
            bool stillConfigured = config.SyncFolders.Any(x => SamePath(x.LocalPath, localPath));
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
            string args = "share-scope --local-path " + Quote(localPath) +
                " --remote-path " + Quote(NormalizeRemotePath(remotePath, localPath)) +
                " --email " + Quote(emails.Trim()) +
                " --permission " + Quote(String.IsNullOrWhiteSpace(permission) ? "WRITE" : permission) +
                " --push-first";
            CommandResult result = RunCommand(args);
            if (result.ExitCode != 0)
            {
                throw new InvalidOperationException(result.Output);
            }
            lastStatus = "\uD3F4\uB354 \uACF5\uC720 \uC644\uB8CC";
            lastOutput = result.Output;
            ShowNotification("\uD3F4\uB354 \uACF5\uC720 \uC644\uB8CC", TrimForBalloon(result.Output), ToolTipIcon.Info);
            UpdateSettingsForm(false);
        }

        public void OpenSharedAddress(string address)
        {
            if (UseKoreanLabels())
            {
                OpenSharedAddressKorean(address);
                return;
            }
            if (String.IsNullOrWhiteSpace(address))
            {
                throw new InvalidOperationException("Enter a shared folder address.");
            }

            CommandResult result = RunCommand("open-address --address " + Quote(address.Trim()));
            if (result.ExitCode != 0)
            {
                throw new InvalidOperationException(result.Output);
            }
            lastStatus = "Shared folder connected";
            lastOutput = result.Output;
            EnsureDriveHubMapping(LoadDesktopConfig());
            RefreshWatchers();
            ShowNotification("Shared folder connected", TrimForBalloon(result.Output), ToolTipIcon.Info);
            UpdateSettingsForm(true);
        }

        private void OpenSharedAddressKorean(string address)
        {
            if (String.IsNullOrWhiteSpace(address))
            {
                throw new InvalidOperationException("\uACF5\uC720 \uC8FC\uC18C\uB97C \uC785\uB825\uD558\uC138\uC694.");
            }

            CommandResult result = RunCommand("open-address --address " + Quote(address.Trim()));
            if (result.ExitCode != 0)
            {
                throw new InvalidOperationException(result.Output);
            }
            lastStatus = "\uACF5\uC720 \uD3F4\uB354 \uC5F0\uACB0 \uC644\uB8CC";
            lastOutput = result.Output;
            EnsureDriveHubMapping(LoadDesktopConfig());
            RefreshWatchers();
            ShowNotification("\uACF5\uC720 \uD3F4\uB354 \uC5F0\uACB0 \uC644\uB8CC", TrimForBalloon(result.Output), ToolTipIcon.Info);
            UpdateSettingsForm(true);
        }

        public void Login(string email, string password)
        {
            if (UseKoreanLabels())
            {
                LoginKorean(email, password);
                return;
            }
            if (String.IsNullOrWhiteSpace(email))
            {
                throw new InvalidOperationException("이메일을 입력하세요.");
            }

            DesktopConfig config = LoadDesktopConfig();
            string server = String.IsNullOrWhiteSpace(config.Server) ? DefaultServer : config.Server;
            string args = "login --server " + Quote(server) + " --email " + Quote(email.Trim());
            if (!String.IsNullOrEmpty(password))
            {
                args += " --password " + Quote(password);
            }
            CommandResult result = RunCommand(args);
            if (result.ExitCode != 0)
            {
                throw new InvalidOperationException(result.Output);
            }

            config = LoadDesktopConfig();
            config.Server = server.TrimEnd('/');
            config.Email = email.Trim();
            if (config.SyncFolders.Count == 0)
            {
                config.SyncFolders.Add(DefaultFolderConfig(config.SyncDir));
            }
            SaveDesktopConfig(config);

            lastStatus = email.Trim() + " 계정으로 로그인됨";
            lastOutput = result.Output;
            ShowNotification("로그인 완료", email.Trim() + " 계정으로 로그인했습니다.", ToolTipIcon.Info);
        }

        public void Logout()
        {
            if (UseKoreanLabels())
            {
                LogoutKorean();
                return;
            }
            CommandResult result = RunCommand("logout");
            DesktopConfig config = LoadDesktopConfig();
            config.Token = "";
            config.RefreshToken = "";
            SaveDesktopConfig(config);
            lastStatus = "로그아웃됨";
            lastOutput = result.Output;
            UpdateSettingsForm(true);
            ShowNotification("로그아웃", "FileInNOut 데스크톱에서 로그아웃했습니다.", ToolTipIcon.Info);
        }

        public void SaveFolderProfile(SyncFolderConfig folder)
        {
            if (UseKoreanLabels())
            {
                SaveFolderProfileKorean(folder);
                return;
            }
            if (String.IsNullOrWhiteSpace(folder.LocalPath))
            {
                throw new InvalidOperationException("먼저 내 폴더를 선택하세요.");
            }
            Directory.CreateDirectory(folder.LocalPath);
            folder.LocalPath = Path.GetFullPath(folder.LocalPath);
            folder.RemotePath = NormalizeRemotePath(folder.RemotePath, folder.LocalPath);
            folder.Direction = NormalizeDirection(folder.Direction);
            folder.Name = String.IsNullOrWhiteSpace(folder.Name) ? Path.GetFileName(folder.LocalPath) : folder.Name;
            folder.Enabled = true;
            ApplyExplorerFolderBranding(folder.LocalPath, ExplorerDisplayNameForFolder(folder), ExplorerStatusInfoTipForFolder(folder));

            DesktopConfig config = LoadDesktopConfig();
            config.SyncDir = folder.LocalPath;
            int existing = config.SyncFolders.FindIndex(x => SamePath(x.LocalPath, folder.LocalPath));
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
            SaveDesktopConfig(config);
            EnsureDriveHubMapping(config);
            RegisterExplorerNamespace(driveRootPath);
            CloudFilesIntegration.TryRegisterSyncRoot(driveRootPath);

            CommandResult result = RunCommand("init --dir " + Quote(folder.LocalPath));
            lastStatus = "동기화 폴더 저장됨";
            lastOutput = result.Output;
            RefreshWatchers();
            RefreshExplorerStatusHints();
        }

        public void RemoveFolderProfile(string localPath)
        {
            if (UseKoreanLabels())
            {
                RemoveFolderProfileKorean(localPath);
                return;
            }
            DesktopConfig config = LoadDesktopConfig();
            List<SyncFolderConfig> removedShared = config.SyncFolders
                .Where(x => SamePath(x.LocalPath, localPath) && IsSharedRemotePath(x.RemotePath))
                .ToList();
            config.SyncFolders.RemoveAll(x => SamePath(x.LocalPath, localPath));
            foreach (SyncFolderConfig folder in removedShared)
            {
                folder.Enabled = false;
                config.SyncFolders.Add(folder);
            }
            if (!config.SyncFolders.Any(x => x.Enabled))
            {
                config.SyncFolders.Add(DefaultFolderConfig(config.SyncDir));
            }
            SaveDesktopConfig(config);
            EnsureDriveHubMapping(config);
            RefreshWatchers();
            bool stillConfigured = config.SyncFolders.Any(x => SamePath(x.LocalPath, localPath));
            if (!stillConfigured)
            {
                ClearExplorerFolderBranding(localPath);
                UpdateExplorerNamespaceToConfiguredFolder();
            }
            lastStatus = "동기화 폴더 설정에서 제거됨";
            lastOutput = localPath;
        }

        public void ShareFolder(string localPath, string remotePath, string emails, string permission)
        {
            if (UseKoreanLabels())
            {
                ShareFolderKorean(localPath, remotePath, emails, permission);
                return;
            }
            if (String.IsNullOrWhiteSpace(emails))
            {
                throw new InvalidOperationException("공유할 이메일을 하나 이상 입력하세요.");
            }
            string args = "share-scope --local-path " + Quote(localPath) +
                " --remote-path " + Quote(NormalizeRemotePath(remotePath, localPath)) +
                " --email " + Quote(emails.Trim()) +
                " --permission " + Quote(String.IsNullOrWhiteSpace(permission) ? "WRITE" : permission) +
                " --push-first";
            CommandResult result = RunCommand(args);
            if (result.ExitCode != 0)
            {
                throw new InvalidOperationException(result.Output);
            }
            lastStatus = "폴더 공유 완료";
            lastOutput = result.Output;
            ShowNotification("폴더 공유 완료", TrimForBalloon(result.Output), ToolTipIcon.Info);
            UpdateSettingsForm(false);
        }

        public void SyncNow(bool userRequested)
        {
            SyncNow(userRequested, false);
        }

        private void SyncNow(bool userRequested, bool preferPendingTargets)
        {
            if (UseKoreanLabels())
            {
                SyncNowKorean(userRequested, preferPendingTargets);
                return;
            }
            if (IsSyncRunning())
            {
                if (userRequested)
                {
                    ShowNotification("동기화 진행 중", "이미 동기화가 실행 중입니다.", ToolTipIcon.Info);
                }
                return;
            }

            DesktopConfig config = LoadDesktopConfig();
            if (String.IsNullOrWhiteSpace(config.RefreshToken))
            {
                lastStatus = "로그인 필요";
                lastOutput = "FileInNOut 데스크톱을 열고 로그인하세요.";
                if (userRequested)
                {
                    ShowSettings();
                }
                return;
            }

            EnsureDefaultSyncFolderSaved();
            string folderSignatureBefore = FolderProfileSignature(LoadDesktopConfig());
            List<string> pendingTargets = TakePendingChangePaths();
            if (!TryBeginSyncRun())
            {
                RestorePendingChangePaths(pendingTargets);
                return;
            }
            lastStatus = "동기화 중...";
            UpdateSettingsForm(false);

            ThreadPool.QueueUserWorkItem(delegate
            {
                CommandResult result = RunSyncCommand(preferPendingTargets, pendingTargets);
                EndSyncRun();
                lastOutput = TranslateCommandOutput(result.Output);
                bool rebuildSettings = false;
                if (result.ExitCode == 0)
                {
                    EnsureDriveHubMapping(LoadDesktopConfig());
                    RefreshWatchers();
                    rebuildSettings = !String.Equals(
                        folderSignatureBefore,
                        FolderProfileSignature(LoadDesktopConfig()),
                        StringComparison.Ordinal);
                    lastStatus = "마지막 동기화 성공: " + DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss");
                    if (userRequested || (notificationsEnabled && HasSyncChanges(result.Output)))
                    {
                        ShowNotification("동기화 완료", SummarizeSync(result.Output), ToolTipIcon.Info);
                    }
                }
                else
                {
                    RestorePendingChangePaths(pendingTargets);
                    lastStatus = "동기화 실패: " + DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss");
                    ShowNotification("동기화 실패", TrimForBalloon(result.Output), ToolTipIcon.Warning);
                }
                RefreshExplorerStatusHints();
                UpdateSettingsForm(rebuildSettings);
            });
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
            string folderSignatureBefore = FolderProfileSignature(LoadDesktopConfig());
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
                lastOutput = TranslateCommandOutput(result.Output);
                bool rebuildSettings = false;
                if (result.ExitCode == 0)
                {
                    EnsureDriveHubMapping(LoadDesktopConfig());
                    RefreshWatchers();
                    rebuildSettings = !String.Equals(
                        folderSignatureBefore,
                        FolderProfileSignature(LoadDesktopConfig()),
                        StringComparison.Ordinal);
                    lastStatus = "\uB9C8\uC9C0\uB9C9 \uB3D9\uAE30\uD654 \uC131\uACF5: " + DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss");
                    if (userRequested || (notificationsEnabled && HasSyncChanges(result.Output)))
                    {
                        ShowNotification("\uB3D9\uAE30\uD654 \uC644\uB8CC", SummarizeSync(result.Output), ToolTipIcon.Info);
                    }
                }
                else
                {
                    RestorePendingChangePaths(pendingTargets);
                    lastStatus = "\uB3D9\uAE30\uD654 \uC2E4\uD328: " + DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss");
                    ShowNotification("\uB3D9\uAE30\uD654 \uC2E4\uD328", TrimForBalloon(result.Output), ToolTipIcon.Warning);
                }
                RefreshExplorerStatusHints();
                UpdateSettingsForm(rebuildSettings);
            });
        }

        private CommandResult RunSyncCommand(bool preferPendingTargets, List<string> pendingTargets)
        {
            if (!preferPendingTargets)
            {
                return RunCommand("sync-configured");
            }

            List<string> targets = BuildTargetSyncPaths(pendingTargets);
            if (targets.Count == 0)
            {
                return RunCommand("sync-configured");
            }

            CommandResult targeted = RunTargetedSyncCommands(targets);
            if (targeted.ExitCode == 0)
            {
                return targeted;
            }

            CommandResult fallback = RunCommand("sync-configured");
            return new CommandResult(
                fallback.ExitCode,
                (targeted.Output + Environment.NewLine + Environment.NewLine +
                 "fallback sync-configured:" + Environment.NewLine +
                 fallback.Output).Trim());
        }

        private List<string> BuildTargetSyncPaths(List<string> pendingTargets)
        {
            List<string> targets = new List<string>();
            if (pendingTargets == null || pendingTargets.Count == 0 || pendingTargets.Count > 24)
            {
                return targets;
            }

            DesktopConfig config = LoadDesktopConfig();
            HashSet<string> seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (string rawPath in pendingTargets)
            {
                if (String.IsNullOrWhiteSpace(rawPath))
                {
                    continue;
                }

                string path;
                try
                {
                    path = Path.GetFullPath(rawPath);
                }
                catch
                {
                    continue;
                }

                string target = ResolvePendingChangeSyncTarget(config, path);
                if (String.IsNullOrWhiteSpace(target))
                {
                    return new List<string>();
                }

                string key = target.TrimEnd('\\');
                if (!seen.Add(key))
                {
                    continue;
                }
                targets.Add(target);
                if (targets.Count > 12)
                {
                    return new List<string>();
                }
            }
            return targets;
        }

        private string ResolvePendingChangeSyncTarget(DesktopConfig config, string path)
        {
            if (String.IsNullOrWhiteSpace(path))
            {
                return "";
            }

            if (PathIsInsideOrSame(driveRootPath, path))
            {
                string myDriveHubPath = Path.Combine(driveRootPath, MyDriveHubName);
                string sharedDriveHubPath = Path.Combine(driveRootPath, SharedDriveHubName);

                if (PathIsInsideOrSame(sharedDriveHubPath, path))
                {
                    string ownerPath = FirstChildPathUnder(sharedDriveHubPath, path);
                    return String.IsNullOrWhiteSpace(ownerPath) ? sharedDriveHubPath : ownerPath;
                }

                if (PathIsInsideOrSame(myDriveHubPath, path))
                {
                    return myDriveHubPath;
                }

                return driveRootPath;
            }

            if (config == null || config.SyncFolders == null)
            {
                return "";
            }

            foreach (SyncFolderConfig folder in config.SyncFolders)
            {
                if (folder == null || !folder.Enabled || String.IsNullOrWhiteSpace(folder.LocalPath))
                {
                    continue;
                }
                if (PathIsInsideOrSame(folder.LocalPath, path))
                {
                    return Path.GetFullPath(folder.LocalPath);
                }
            }

            return "";
        }

        private static bool PathIsInsideOrSame(string root, string path)
        {
            if (String.IsNullOrWhiteSpace(root) || String.IsNullOrWhiteSpace(path))
            {
                return false;
            }

            try
            {
                string fullRoot = Path.GetFullPath(root).TrimEnd('\\');
                string fullPath = Path.GetFullPath(path).TrimEnd('\\');
                if (fullPath.Equals(fullRoot, StringComparison.OrdinalIgnoreCase))
                {
                    return true;
                }
                return fullPath.StartsWith(fullRoot + "\\", StringComparison.OrdinalIgnoreCase);
            }
            catch
            {
                return false;
            }
        }

        private static string FirstChildPathUnder(string root, string path)
        {
            try
            {
                string fullRoot = Path.GetFullPath(root).TrimEnd('\\') + "\\";
                string fullPath = Path.GetFullPath(path).TrimEnd('\\');
                if (!fullPath.StartsWith(fullRoot, StringComparison.OrdinalIgnoreCase))
                {
                    return "";
                }

                string relative = fullPath.Substring(fullRoot.Length).Trim('\\');
                if (String.IsNullOrWhiteSpace(relative))
                {
                    return "";
                }

                string firstSegment = relative.Split(new[] { '\\' }, StringSplitOptions.RemoveEmptyEntries).FirstOrDefault();
                return String.IsNullOrWhiteSpace(firstSegment) ? "" : Path.Combine(root, firstSegment);
            }
            catch
            {
                return "";
            }
        }

        private CommandResult RunTargetedSyncCommands(List<string> targets)
        {
            StringBuilder output = new StringBuilder();
            int exitCode = 0;

            foreach (string target in targets)
            {
                CommandResult result = RunCommand("sync-target --target " + Quote(target));
                output.AppendLine("target sync: " + target);
                if (!String.IsNullOrWhiteSpace(result.Output))
                {
                    output.AppendLine(result.Output.Trim());
                }
                if (result.ExitCode != 0)
                {
                    exitCode = result.ExitCode;
                    break;
                }
            }

            return new CommandResult(exitCode, output.ToString().Trim());
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
            CommandResult result = RunCommand("doctor --dir " + Quote(localPath) + " --local-only");
            return result.Output;
        }

        public StorageSummary GetStorageSummary()
        {
            CommandResult result = RunCommand("storage");
            StorageSummary summary = new StorageSummary();
            summary.Available = result.ExitCode == 0;
            summary.RawOutput = result.Output;
            Dictionary<string, string> values = ParseKeyValueOutput(result.Output);
            summary.PlanLabel = GetValue(values, "planLabel");
            summary.UsedBytes = ParseLong(GetValue(values, "usedBytes"));
            summary.QuotaBytes = ParseLong(GetValue(values, "quotaBytes"));
            summary.RemainingBytes = ParseLong(GetValue(values, "remainingBytes"));
            summary.UsagePercent = (int)ParseLong(GetValue(values, "usagePercent"));
            summary.FileCount = (int)ParseLong(GetValue(values, "activeFileCount"));
            summary.FolderCount = (int)ParseLong(GetValue(values, "activeFolderCount"));
            return summary;
        }

        public List<SyncActivityItem> ListRecentSyncActivity()
        {
            List<SyncActivityItem> items = new List<SyncActivityItem>();
            DesktopConfig config = LoadDesktopConfig();
            foreach (SyncFolderConfig folder in config.SyncFolders)
            {
                if (!folder.Enabled || String.IsNullOrWhiteSpace(folder.LocalPath) || !Directory.Exists(folder.LocalPath))
                {
                    continue;
                }

                string folderName = String.IsNullOrWhiteSpace(folder.Name) ? folder.RemotePath : folder.Name;
                string statePath = Path.Combine(folder.LocalPath, ".fileinnout", "state.json");
                if (!File.Exists(statePath))
                {
                    continue;
                }

                try
                {
                    JavaScriptSerializer serializer = new JavaScriptSerializer();
                    Dictionary<string, object> state = serializer.Deserialize<Dictionary<string, object>>(File.ReadAllText(statePath));
                    if (state == null)
                    {
                        continue;
                    }

                    bool added = false;
                    IEnumerable activity = ReadEnumerable(state, "syncActivity");
                    foreach (object rawActivity in activity)
                    {
                        Dictionary<string, object> entry = rawActivity as Dictionary<string, object>;
                        if (entry == null)
                        {
                            continue;
                        }
                        items.Add(BuildSyncActivityItem(folderName, entry));
                        added = true;
                    }

                    if (!added)
                    {
                        Dictionary<string, object> syncStatus = ReadDictionary(state, "syncStatus");
                        if (syncStatus.Count > 0)
                        {
                            items.Add(BuildSyncActivityItem(folderName, syncStatus));
                        }
                    }
                }
                catch
                {
                }
            }

            return items.OrderByDescending(x => x.UpdatedAt).Take(200).ToList();
        }

        public List<SearchResultItem> ListSyncIssues()
        {
            List<SearchResultItem> items = new List<SearchResultItem>();
            DesktopConfig config = LoadDesktopConfig();
            foreach (SyncFolderConfig folder in config.SyncFolders)
            {
                if (!folder.Enabled)
                {
                    continue;
                }

                string folderName = String.IsNullOrWhiteSpace(folder.Name) ? folder.RemotePath : folder.Name;
                if (String.IsNullOrWhiteSpace(folder.LocalPath) || !Directory.Exists(folder.LocalPath))
                {
                    items.Add(new SearchResultItem(
                        "[" + folderName + "] \uD3F4\uB354 \uC5C6\uC74C",
                        "\uB85C\uCEEC \uB3D9\uAE30\uD654 \uD3F4\uB354\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC74C",
                        DateTime.MinValue,
                        folder.LocalPath));
                    continue;
                }

                Dictionary<string, object> state = LoadFolderState(folder.LocalPath);
                Dictionary<string, object> syncStatus = ReadDictionary(state, "syncStatus");
                string status = ReadString(syncStatus, "status").Trim().ToLowerInvariant();
                if (status == "error")
                {
                    string error = TrimText(ReadString(syncStatus, "error"), 42);
                    if (String.IsNullOrWhiteSpace(error))
                    {
                        error = "\uCD5C\uADFC \uB3D9\uAE30\uD654 \uC624\uB958";
                    }
                    items.Add(new SearchResultItem(
                        "[" + folderName + "] \uB3D9\uAE30\uD654 \uC624\uB958",
                        error,
                        UnixTimeToLocal(ReadLong(syncStatus, "updatedAt")),
                        folder.LocalPath));
                }

                int conflicts = ConflictCount(syncStatus);
                int skipped = SkippedDirtyCount(syncStatus);
                if (conflicts > 0 || skipped > 0)
                {
                    int issueCount = conflicts > 0 ? conflicts : skipped;
                    string issueDetail = conflicts > 0
                        ? "\uC9C0\uB09C \uB3D9\uAE30\uD654\uC5D0\uC11C " + issueCount.ToString() + "\uAC1C \uCDA9\uB3CC \uC0AC\uBCF8\uC774 \uC0DD\uC131\uB428"
                        : "\uC9C0\uB09C \uB3D9\uAE30\uD654\uC5D0\uC11C " + issueCount.ToString() + "\uAC1C \uD56D\uBAA9\uC774 \uBCF4\uD638\uB428";
                    items.Add(new SearchResultItem(
                        "[" + folderName + "] \uCDA9\uB3CC \uD655\uC778 \uD544\uC694",
                        issueDetail,
                        UnixTimeToLocal(ReadLong(syncStatus, "updatedAt")),
                        folder.LocalPath));
                }

                int downloadFailed = DownloadFailedCount(syncStatus);
                if (downloadFailed > 0)
                {
                    items.Add(new SearchResultItem(
                        "[" + folderName + "] \uB2E4\uC6B4\uB85C\uB4DC \uC2E4\uD328",
                        "\uC9C0\uB09C \uB3D9\uAE30\uD654\uC5D0\uC11C " + downloadFailed.ToString() + "\uAC1C \uD30C\uC77C\uC744 \uB0B4\uB824\uBC1B\uC9C0 \uBABB\uD568",
                        UnixTimeToLocal(ReadLong(syncStatus, "updatedAt")),
                        folder.LocalPath));
                }

                foreach (string path in EnumerateSearchablePaths(folder.LocalPath))
                {
                    if (!File.Exists(path) || !IsConflictCopyPath(path))
                    {
                        continue;
                    }
                    string relative = MakeRelative(folder.LocalPath, path);
                    items.Add(new SearchResultItem(
                        "[" + folderName + "] " + relative,
                        "\uCDA9\uB3CC \uC0AC\uBCF8",
                        File.GetLastWriteTime(path),
                        path));
                    if (items.Count >= 200)
                    {
                        return items.OrderByDescending(x => x.UpdatedAt).Take(200).ToList();
                    }
                }
            }

            return items.OrderByDescending(x => x.UpdatedAt).Take(200).ToList();
        }

        public string FolderStatusLabel(SyncFolderConfig folder)
        {
            if (folder == null || !folder.Enabled)
            {
                return "\uBE44\uD65C\uC131";
            }
            if (String.IsNullOrWhiteSpace(folder.LocalPath) || !Directory.Exists(folder.LocalPath))
            {
                return "\uD3F4\uB354 \uC5C6\uC74C";
            }

            Dictionary<string, object> state = LoadFolderState(folder.LocalPath);
            if (state.Count == 0)
            {
                return "\uB3D9\uAE30\uD654 \uC804";
            }

            Dictionary<string, object> syncStatus = ReadDictionary(state, "syncStatus");
            string status = ReadString(syncStatus, "status").Trim().ToLowerInvariant();
            if (status == "error")
            {
                return "\uC624\uB958";
            }
            int downloadFailed = DownloadFailedCount(syncStatus);
            if (downloadFailed > 0)
            {
                return "\uB2E4\uC6B4\uB85C\uB4DC \uC2E4\uD328 " + downloadFailed.ToString();
            }
            int conflicts = ConflictCount(syncStatus);
            if (conflicts > 0)
            {
                return "\uCDA9\uB3CC \uC0AC\uBCF8 " + conflicts.ToString();
            }
            int skipped = SkippedDirtyCount(syncStatus);
            if (skipped > 0)
            {
                return "\uCDA9\uB3CC \uD655\uC778 " + skipped.ToString();
            }

            int pendingChanges = CountPendingLocalChanges(folder.LocalPath, state);
            if (pendingChanges > 0)
            {
                return "\uBCC0\uACBD \uB300\uAE30 " + pendingChanges.ToString();
            }
            if (status == "success")
            {
                return "\uC815\uC0C1";
            }
            return "\uB3D9\uAE30\uD654 \uC804";
        }

        public string FolderPermissionLabel(SyncFolderConfig folder)
        {
            if (folder == null)
            {
                return "";
            }

            string remotePath = NormalizeRemotePath(folder.RemotePath, folder.LocalPath);
            if (!IsSharedRemotePath(remotePath))
            {
                return "\uB0B4 \uB4DC\uB77C\uC774\uBE0C";
            }

            string permission = FolderPermission(folder);
            if (String.IsNullOrWhiteSpace(permission))
            {
                return "\uAD8C\uD55C \uD655\uC778 \uC804";
            }
            return PermissionLabel(permission);
        }

        private static string FolderPermission(SyncFolderConfig folder)
        {
            if (folder == null)
            {
                return "";
            }

            string configured = NormalizePermission(folder.Permission);
            if (!String.IsNullOrWhiteSpace(configured))
            {
                return configured;
            }

            if (String.IsNullOrWhiteSpace(folder.LocalPath) || !Directory.Exists(folder.LocalPath))
            {
                return "";
            }

            Dictionary<string, object> state = LoadFolderState(folder.LocalPath);
            Dictionary<string, object> remote = ReadDictionary(state, "remote");
            foreach (object rawItem in remote.Values)
            {
                Dictionary<string, object> item = rawItem as Dictionary<string, object>;
                if (item == null)
                {
                    continue;
                }
                string permission = NormalizePermission(ReadString(item, "permission"));
                if (!String.IsNullOrWhiteSpace(permission))
                {
                    return permission;
                }
            }
            return "";
        }

        private static int SkippedDirtyCount(Dictionary<string, object> syncStatus)
        {
            Dictionary<string, object> push = ReadDictionary(syncStatus, "push");
            Dictionary<string, object> pull = ReadDictionary(syncStatus, "pull");
            return ReadInt(push, "skippedDirty") + ReadInt(pull, "skippedDirty");
        }

        private static int ConflictCount(Dictionary<string, object> syncStatus)
        {
            Dictionary<string, object> push = ReadDictionary(syncStatus, "push");
            Dictionary<string, object> pull = ReadDictionary(syncStatus, "pull");
            return ConflictListCount(push) + ConflictListCount(pull);
        }

        private static int ConflictListCount(Dictionary<string, object> stats)
        {
            int count = 0;
            foreach (object ignored in ReadEnumerable(stats, "conflicts"))
            {
                count += 1;
            }
            return count;
        }

        private static int DownloadFailedCount(Dictionary<string, object> syncStatus)
        {
            Dictionary<string, object> push = ReadDictionary(syncStatus, "push");
            Dictionary<string, object> pull = ReadDictionary(syncStatus, "pull");
            return ReadInt(push, "downloadFailed") + ReadInt(pull, "downloadFailed");
        }

        private static bool IsConflictCopyPath(string path)
        {
            string name = Path.GetFileNameWithoutExtension(path) ?? "";
            return name.IndexOf(" (conflict ", StringComparison.OrdinalIgnoreCase) >= 0;
        }

        private static Dictionary<string, object> LoadFolderState(string localPath)
        {
            string statePath = Path.Combine(localPath, ".fileinnout", "state.json");
            if (!File.Exists(statePath))
            {
                return new Dictionary<string, object>();
            }
            try
            {
                JavaScriptSerializer serializer = new JavaScriptSerializer();
                Dictionary<string, object> state = serializer.Deserialize<Dictionary<string, object>>(File.ReadAllText(statePath));
                return state ?? new Dictionary<string, object>();
            }
            catch
            {
                return new Dictionary<string, object>();
            }
        }

        private static int CountPendingLocalChanges(string localPath, Dictionary<string, object> state)
        {
            Dictionary<string, object> previousFiles = ReadDictionary(state, "local");
            HashSet<string> previousFolders = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (object rawFolder in ReadEnumerable(state, "localFolders"))
            {
                string rel = NormalizeStateRel(Convert.ToString(rawFolder));
                if (!String.IsNullOrWhiteSpace(rel))
                {
                    previousFolders.Add(rel);
                }
            }

            HashSet<string> currentFiles = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            HashSet<string> currentFolders = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            int pending = 0;
            foreach (string path in EnumerateSearchablePaths(localPath))
            {
                string rel = NormalizeStateRel(MakeRelative(localPath, path));
                if (String.IsNullOrWhiteSpace(rel))
                {
                    continue;
                }

                if (Directory.Exists(path))
                {
                    currentFolders.Add(rel);
                    if (!previousFolders.Contains(rel))
                    {
                        pending++;
                    }
                }
                else if (File.Exists(path))
                {
                    currentFiles.Add(rel);
                    object rawPrevious;
                    Dictionary<string, object> previous = previousFiles.TryGetValue(rel, out rawPrevious)
                        ? rawPrevious as Dictionary<string, object>
                        : null;
                    if (previous == null || !LocalSignatureMatches(path, previous))
                    {
                        pending++;
                    }
                }

                if (pending > 999)
                {
                    return pending;
                }
            }

            foreach (string rel in previousFiles.Keys)
            {
                if (!currentFiles.Contains(NormalizeStateRel(rel)))
                {
                    pending++;
                }
            }
            foreach (string rel in previousFolders)
            {
                if (!currentFolders.Contains(rel))
                {
                    pending++;
                }
            }
            return pending;
        }

        private static bool LocalSignatureMatches(string path, Dictionary<string, object> previous)
        {
            try
            {
                FileInfo info = new FileInfo(path);
                if (info.Length != ReadLong(previous, "size"))
                {
                    return false;
                }
                if (previous.ContainsKey("mtimeMs"))
                {
                    return FileMtimeMilliseconds(path) == ReadLong(previous, "mtimeMs");
                }
                return FileMtimeSeconds(path) == ReadLong(previous, "mtime");
            }
            catch
            {
                return false;
            }
        }

        private static long FileMtimeMilliseconds(string path)
        {
            DateTime epoch = new DateTime(1970, 1, 1, 0, 0, 0, DateTimeKind.Utc);
            return (File.GetLastWriteTimeUtc(path) - epoch).Ticks / TimeSpan.TicksPerMillisecond;
        }

        private static long FileMtimeSeconds(string path)
        {
            DateTime epoch = new DateTime(1970, 1, 1, 0, 0, 0, DateTimeKind.Utc);
            return (long)(File.GetLastWriteTimeUtc(path) - epoch).TotalSeconds;
        }

        private static string NormalizeStateRel(string rel)
        {
            return (rel ?? "").Replace("\\", "/").Trim('/');
        }

        public List<SearchResultItem> SearchLocalFiles(string query)
        {
            List<SearchResultItem> items = new List<SearchResultItem>();
            string[] terms = (query ?? "")
                .Split(new[] { ' ', '\t', '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries)
                .Select(x => x.Trim().ToLowerInvariant())
                .Where(x => x.Length > 0)
                .ToArray();
            if (terms.Length == 0)
            {
                return items;
            }

            DesktopConfig config = LoadDesktopConfig();
            foreach (SyncFolderConfig folder in config.SyncFolders)
            {
                if (!folder.Enabled || String.IsNullOrWhiteSpace(folder.LocalPath) || !Directory.Exists(folder.LocalPath))
                {
                    continue;
                }

                string folderName = String.IsNullOrWhiteSpace(folder.Name) ? folder.RemotePath : folder.Name;
                foreach (string path in EnumerateSearchablePaths(folder.LocalPath))
                {
                    string relative = MakeRelative(folder.LocalPath, path);
                    string searchable = (relative + " " + Path.GetFileName(path)).ToLowerInvariant();
                    if (!terms.All(term => searchable.Contains(term)))
                    {
                        continue;
                    }

                    try
                    {
                        FileAttributes attributes = File.GetAttributes(path);
                        bool directory = (attributes & FileAttributes.Directory) != 0;
                        long bytes = directory ? 0 : new FileInfo(path).Length;
                        DateTime updated = directory ? Directory.GetLastWriteTime(path) : File.GetLastWriteTime(path);
                        string detail = directory ? "폴더" : FormatByteCount(bytes);
                        items.Add(new SearchResultItem("[" + folderName + "] " + relative, detail, updated, path));
                    }
                    catch
                    {
                    }

                    if (items.Count >= 500)
                    {
                        break;
                    }
                }
            }

            return items.OrderByDescending(x => x.UpdatedAt).Take(200).ToList();
        }

        public List<SearchResultItem> SearchFiles(string query)
        {
            List<SearchResultItem> items = SearchLocalFiles(query);
            items.AddRange(SearchCloudFiles(query));
            return items
                .OrderByDescending(x => x.UpdatedAt)
                .ThenBy(x => x.Title, StringComparer.CurrentCultureIgnoreCase)
                .Take(200)
                .ToList();
        }

        public List<SearchResultItem> SearchCloudFiles(string query)
        {
            List<SearchResultItem> items = new List<SearchResultItem>();
            string[] terms = (query ?? "")
                .Split(new[] { ' ', '\t', '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries)
                .Where(x => x.Trim().Length > 0)
                .ToArray();
            if (terms.Length == 0)
            {
                return items;
            }

            DesktopConfig config = LoadDesktopConfig();
            if (String.IsNullOrWhiteSpace(config.RefreshToken) && String.IsNullOrWhiteSpace(config.Token))
            {
                return items;
            }

            CommandResult result = RunCommand("search --query " + Quote(query) + " --limit 100");
            if (result.ExitCode != 0)
            {
                return items;
            }

            foreach (string line in (result.Output ?? "").Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries))
            {
                string[] columns = line.Split('\t');
                if (columns.Length < 6 || !String.Equals(columns[0], "cloud", StringComparison.OrdinalIgnoreCase))
                {
                    continue;
                }

                string cloudPath = columns[1];
                string type = columns[2].Trim().ToUpperInvariant();
                long bytes = ParseLong(columns[3]);
                DateTime updated = ParseDateTimeOrMin(columns[4]);
                string webUrl = columns[5];
                string detail = String.Equals(type, "FOLDER", StringComparison.OrdinalIgnoreCase)
                    ? "\uD074\uB77C\uC6B0\uB4DC \uD3F4\uB354"
                    : "\uD074\uB77C\uC6B0\uB4DC " + FormatByteCount(bytes);
                items.Add(new SearchResultItem("\u005B\uD074\uB77C\uC6B0\uB4DC\u005D " + cloudPath, detail, updated, "", webUrl));
            }

            return items;
        }

        private static IEnumerable<string> EnumerateSearchablePaths(string root)
        {
            Queue<string> pending = new Queue<string>();
            pending.Enqueue(root);
            while (pending.Count > 0)
            {
                string current = pending.Dequeue();
                string[] directories = new string[0];
                string[] files = new string[0];
                try
                {
                    directories = Directory.GetDirectories(current);
                    files = Directory.GetFiles(current);
                }
                catch
                {
                }

                foreach (string directory in directories)
                {
                    string name = Path.GetFileName(directory);
                    if (String.Equals(name, ".fileinnout", StringComparison.OrdinalIgnoreCase))
                    {
                        continue;
                    }
                    yield return directory;
                    pending.Enqueue(directory);
                }

                foreach (string file in files)
                {
                    string name = Path.GetFileName(file);
                    if (String.Equals(name, "desktop.ini", StringComparison.OrdinalIgnoreCase) ||
                        String.Equals(name, "Thumbs.db", StringComparison.OrdinalIgnoreCase))
                    {
                        continue;
                    }
                    yield return file;
                }
            }
        }

        private static string FormatByteCount(long bytes)
        {
            if (bytes >= 1024L * 1024L * 1024L * 1024L)
            {
                return (bytes / 1024d / 1024d / 1024d / 1024d).ToString("0.0 TB");
            }
            if (bytes >= 1024L * 1024L * 1024L)
            {
                return (bytes / 1024d / 1024d / 1024d).ToString("0.0 GB");
            }
            if (bytes >= 1024L * 1024L)
            {
                return (bytes / 1024d / 1024d).ToString("0.0 MB");
            }
            if (bytes >= 1024L)
            {
                return (bytes / 1024d).ToString("0.0 KB");
            }
            return bytes + " B";
        }

        private static DateTime ParseDateTimeOrMin(string value)
        {
            DateTime parsed;
            return DateTime.TryParse(value, out parsed) ? parsed : DateTime.MinValue;
        }

        public List<PendingShareItem> ListPendingShares()
        {
            List<PendingShareItem> items = new List<PendingShareItem>();
            if (!IsLoggedIn())
            {
                return items;
            }

            CommandResult result = RunCommand("pending-shares");
            if (result.ExitCode != 0)
            {
                return items;
            }

            foreach (string rawLine in result.Output.Split(new[] { "\r\n", "\n" }, StringSplitOptions.RemoveEmptyEntries))
            {
                string line = rawLine.Trim();
                if (line.StartsWith("pending shares:", StringComparison.OrdinalIgnoreCase))
                {
                    continue;
                }

                string[] parts = line.Split('\t');
                if (parts.Length < 2)
                {
                    continue;
                }

                int id;
                if (!Int32.TryParse(parts[0], out id))
                {
                    continue;
                }

                string owner = "";
                string permission = "";
                for (int index = 2; index < parts.Length; index++)
                {
                    if (parts[index].StartsWith("owner=", StringComparison.OrdinalIgnoreCase))
                    {
                        owner = parts[index].Substring("owner=".Length);
                    }
                    else if (parts[index].StartsWith("permission=", StringComparison.OrdinalIgnoreCase))
                    {
                        permission = parts[index].Substring("permission=".Length);
                    }
                }

                items.Add(new PendingShareItem(id, parts[1], owner, permission));
            }

            return items;
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
            if (config.SyncFolders.Count > 0)
            {
                return;
            }
            config.SyncFolders.Add(DefaultFolderConfig(config.SyncDir));
            SaveDesktopConfig(config);
        }

        private SyncFolderConfig FirstEnabledFolder()
        {
            DesktopConfig config = LoadDesktopConfig();
            foreach (SyncFolderConfig folder in config.SyncFolders)
            {
                if (folder.Enabled)
                {
                    return folder;
                }
            }
            return DefaultFolderConfig(config.SyncDir);
        }

        private static bool IsSharedRemotePath(string remotePath)
        {
            string normalized = (remotePath ?? "").Trim().Replace('\\', '/').Trim('/');
            return normalized.StartsWith("Shared/", StringComparison.OrdinalIgnoreCase);
        }

        private static string FolderProfileSignature(DesktopConfig config)
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
                builder.Append(NormalizeRemotePath(folder.RemotePath, folder.LocalPath)).Append('|');
                builder.Append(NormalizeDirection(folder.Direction)).Append('|');
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

        private ContextMenuStrip BuildMenu()
        {
            if (UseKoreanLabels())
            {
                return BuildMenuKorean();
            }
            ContextMenuStrip menu = new ContextMenuStrip();
            menu.Items.Add("FileInNOut 데스크톱 열기", null, delegate { ShowSettings(); });
            menu.Items.Add("동기화 폴더 열기", null, delegate { OpenSyncFolder(); });
            menu.Items.Add("지금 동기화", null, delegate { SyncNow(true); });
            menu.Items.Add("FileInNOut 웹 열기", null, delegate { OpenWeb(); });
            menu.Items.Add(new ToolStripSeparator());
            ToolStripMenuItem autoSync = new ToolStripMenuItem(autoSyncEnabled ? "동기화 일시정지" : "동기화 재개");
            autoSync.Click += delegate { ToggleAutoSync(); };
            menu.Items.Add(autoSync);
            ToolStripMenuItem notifications = new ToolStripMenuItem("파일 변경 시 알림");
            notifications.Checked = notificationsEnabled;
            notifications.Click += delegate { SetNotifications(!notificationsEnabled); };
            menu.Items.Add(notifications);
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add("종료", null, delegate { Application.Exit(); });
            return menu;
        }

        private ContextMenuStrip BuildMenuKorean()
        {
            ContextMenuStrip menu = new ContextMenuStrip();
            menu.Items.Add("FileInNOut \uB370\uC2A4\uD06C\uD1B1 \uC5F4\uAE30", null, delegate { ShowSettings(); });
            menu.Items.Add("\uB3D9\uAE30\uD654 \uD3F4\uB354 \uC5F4\uAE30", null, delegate { OpenSyncFolder(); });
            menu.Items.Add("\uC9C0\uAE08 \uB3D9\uAE30\uD654", null, delegate { SyncNow(true); });
            menu.Items.Add("FileInNOut \uC6F9 \uC5F4\uAE30", null, delegate { OpenWeb(); });
            menu.Items.Add(new ToolStripSeparator());
            ToolStripMenuItem autoSync = new ToolStripMenuItem(autoSyncEnabled ? "\uB3D9\uAE30\uD654 \uC77C\uC2DC\uC815\uC9C0" : "\uB3D9\uAE30\uD654 \uC7AC\uAC1C");
            autoSync.Click += delegate { ToggleAutoSync(); };
            menu.Items.Add(autoSync);
            ToolStripMenuItem notifications = new ToolStripMenuItem("\uD30C\uC77C \uBCC0\uACBD \uC2DC \uC54C\uB9BC");
            notifications.Checked = notificationsEnabled;
            notifications.Click += delegate { SetNotifications(!notificationsEnabled); };
            menu.Items.Add(notifications);
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add("\uC885\uB8CC", null, delegate { Application.Exit(); });
            return menu;
        }

        private Icon LoadTrayIcon()
        {
            string iconPath = Path.Combine(installDir, "FileInNOutDesktop.ico");
            if (File.Exists(iconPath))
            {
                try
                {
                    return new Icon(iconPath);
                }
                catch
                {
                }
            }
            return CreateGreenFolderIcon();
        }

        private Icon CreateGreenFolderIcon()
        {
            Bitmap bitmap = new Bitmap(32, 32);
            using (Graphics g = Graphics.FromImage(bitmap))
            {
                g.Clear(Color.Transparent);
                g.SmoothingMode = SmoothingMode.AntiAlias;
                using (SolidBrush tab = new SolidBrush(AppColors.PrimaryDark))
                using (SolidBrush body = new SolidBrush(AppColors.Primary))
                using (SolidBrush shine = new SolidBrush(AppColors.Sky))
                using (Pen border = new Pen(Color.FromArgb(21, 128, 61), 1))
                {
                    g.FillRectangle(tab, 5, 7, 11, 6);
                    g.FillRectangle(body, 3, 11, 26, 17);
                    g.DrawRectangle(border, 3, 11, 26, 17);
                    g.FillRectangle(shine, 6, 14, 20, 3);
                }
            }
            IntPtr handle = bitmap.GetHicon();
            return Icon.FromHandle(handle);
        }

        private CommandResult RunCommand(string arguments)
        {
            bool canRunBundledPython = File.Exists(bundledPythonPath) && File.Exists(clientScriptPath);
            if (!canRunBundledPython && !File.Exists(commandPath))
            {
                return new CommandResult(1, "Missing command: " + commandPath);
            }
            ProcessStartInfo info = new ProcessStartInfo();
            if (canRunBundledPython)
            {
                info.FileName = bundledPythonPath;
                info.Arguments = Quote(clientScriptPath) + " " + arguments;
            }
            else
            {
                info.FileName = "cmd.exe";
                info.Arguments = "/d /s /c " + Quote(Quote(commandPath) + " " + arguments);
            }
            info.WorkingDirectory = installDir;
            info.UseShellExecute = false;
            info.RedirectStandardOutput = true;
            info.RedirectStandardError = true;
            info.CreateNoWindow = true;

            using (Process process = Process.Start(info))
            {
                string output = process.StandardOutput.ReadToEnd();
                string error = process.StandardError.ReadToEnd();
                process.WaitForExit();
                string combined = (output + Environment.NewLine + error).Trim();
                return new CommandResult(process.ExitCode, combined);
            }
        }

        private void ShowNotification(string title, string body, ToolTipIcon icon)
        {
            if (!notificationsEnabled && icon != ToolTipIcon.Warning)
            {
                return;
            }
            notifyIcon.ShowBalloonTip(3500, title, TrimForBalloon(body), icon);
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
            DisposeWatchers();
            DesktopConfig config = LoadDesktopConfig();
            AddWatcher(driveRootPath, false);
            AddWatcher(Path.Combine(driveRootPath, MyDriveHubName), false);
            AddWatcher(Path.Combine(driveRootPath, SharedDriveHubName), false);
            AddSharedOwnerDriveHubWatchers(config);
            foreach (SyncFolderConfig folder in config.SyncFolders)
            {
                if (!folder.Enabled || String.IsNullOrWhiteSpace(folder.LocalPath) || !Directory.Exists(folder.LocalPath))
                {
                    continue;
                }
                AddWatcher(folder.LocalPath, true);
            }
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

        private void AddSharedOwnerDriveHubWatchers(DesktopConfig config)
        {
            string sharedDriveHubPath = Path.Combine(driveRootPath, SharedDriveHubName);
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

                    string owner = SharedRemoteOwner(folder.RemotePath);
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

        private bool IsSyncRunning()
        {
            lock (syncStateLock)
            {
                return syncRunning;
            }
        }

        private bool TryBeginSyncRun()
        {
            lock (syncStateLock)
            {
                if (syncRunning)
                {
                    return false;
                }
                syncRunning = true;
                return true;
            }
        }

        private void EndSyncRun()
        {
            lock (syncStateLock)
            {
                syncRunning = false;
            }
        }

        private void QueueFileChange(string path)
        {
            if (ShouldIgnoreWatcherPath(path))
            {
                return;
            }
            lock (syncStateLock)
            {
                pendingFileChange = true;
                if (pendingChangePaths.Count < 128)
                {
                    pendingChangePaths.Add(path);
                }
            }
            RefreshExplorerStatusHints();
        }

        private void QueueFullSyncAfterWatcherError(string watchedPath, Exception error)
        {
            lock (syncStateLock)
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
            lastStatus = message;
            RefreshExplorerStatusHints();
        }

        private void SyncPendingChanges()
        {
            SyncNow(false, true);
        }

        private List<string> TakePendingChangePaths()
        {
            lock (syncStateLock)
            {
                List<string> paths = pendingChangePaths.ToList();
                pendingChangePaths.Clear();
                pendingFileChange = false;
                return paths;
            }
        }

        private void RestorePendingChangePaths(IEnumerable<string> paths)
        {
            if (paths == null)
            {
                return;
            }

            lock (syncStateLock)
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

        private static bool ShouldIgnoreWatcherPath(string path)
        {
            if (String.IsNullOrWhiteSpace(path))
            {
                return true;
            }
            string normalized = path.Replace('/', '\\');
            if (normalized.EndsWith("\\.fileinnout", StringComparison.OrdinalIgnoreCase) ||
                normalized.IndexOf("\\.fileinnout\\", StringComparison.OrdinalIgnoreCase) >= 0)
            {
                return true;
            }

            string name = Path.GetFileName(normalized);
            if (String.IsNullOrWhiteSpace(name))
            {
                return false;
            }
            if (String.Equals(name, "desktop.ini", StringComparison.OrdinalIgnoreCase) ||
                String.Equals(name, "Thumbs.db", StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }
            if (name.StartsWith("~$") || name.StartsWith(".~"))
            {
                return true;
            }
            string lower = name.ToLowerInvariant();
            return lower.EndsWith(".download") ||
                lower.EndsWith(".tmp") ||
                lower.EndsWith(".temp") ||
                lower.EndsWith(".crdownload") ||
                lower.EndsWith(".part") ||
                lower.EndsWith(".partial") ||
                lower.EndsWith(".swp") ||
                lower.EndsWith(".swx");
        }

        private void LoadTrayConfig()
        {
            if (!File.Exists(trayConfigPath))
            {
                return;
            }
            try
            {
                JavaScriptSerializer serializer = new JavaScriptSerializer();
                Dictionary<string, object> values = serializer.Deserialize<Dictionary<string, object>>(File.ReadAllText(trayConfigPath));
                if (values == null)
                {
                    return;
                }
                if (values.ContainsKey("autoSyncEnabled"))
                {
                    autoSyncEnabled = Convert.ToBoolean(values["autoSyncEnabled"]);
                }
                if (values.ContainsKey("notificationsEnabled"))
                {
                    notificationsEnabled = Convert.ToBoolean(values["notificationsEnabled"]);
                }
            }
            catch
            {
            }
        }

        private void SaveTrayConfig()
        {
            Directory.CreateDirectory(configDir);
            Dictionary<string, object> values = new Dictionary<string, object>();
            values["autoSyncEnabled"] = autoSyncEnabled;
            values["notificationsEnabled"] = notificationsEnabled;
            JavaScriptSerializer serializer = new JavaScriptSerializer();
            File.WriteAllText(trayConfigPath, serializer.Serialize(values));
        }

        private static void LoadSyncFolders(object rawValue, List<SyncFolderConfig> folders)
        {
            IEnumerable values = rawValue as IEnumerable;
            if (values == null || rawValue is string)
            {
                return;
            }

            foreach (object item in values)
            {
                Dictionary<string, object> data = item as Dictionary<string, object>;
                if (data == null)
                {
                    continue;
                }

                SyncFolderConfig folder = new SyncFolderConfig();
                folder.Name = ReadString(data, "name");
                folder.LocalPath = ReadString(data, "localPath");
                folder.RemotePath = ReadString(data, "remotePath");
                folder.Direction = NormalizeDirection(ReadString(data, "direction"));
                folder.Permission = NormalizePermission(ReadString(data, "permission"));
                folder.Enabled = !data.ContainsKey("enabled") || Convert.ToBoolean(data["enabled"]);
                if (!String.IsNullOrWhiteSpace(folder.LocalPath))
                {
                    folder.RemotePath = NormalizeRemotePath(folder.RemotePath, folder.LocalPath);
                    folders.Add(folder);
                }
            }
        }

        private static SyncFolderConfig DefaultFolderConfig(string localPath)
        {
            SyncFolderConfig folder = new SyncFolderConfig();
            folder.Name = Path.GetFileName(localPath);
            folder.LocalPath = localPath;
            folder.RemotePath = NormalizeRemotePath("", localPath);
            folder.Direction = "two-way";
            folder.Enabled = true;
            return folder;
        }

        private static string DefaultSyncDir()
        {
            return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "FileInNOut");
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
            if (String.IsNullOrWhiteSpace(folderPath))
            {
                return;
            }

            try
            {
                Directory.CreateDirectory(folderPath);
                string iconPath = Path.Combine(installDir, "FileInNOutDesktop.ico");
                string desktopIniPath = Path.Combine(folderPath, "desktop.ini");
                List<string> lines = new List<string>();
                lines.Add("[.ShellClassInfo]");
                lines.Add("LocalizedResourceName=" + SafeDesktopIniValue(displayName, "FileInNOut"));
                lines.Add("InfoTip=" + SafeDesktopIniValue(infoTip, DefaultExplorerFolderInfoTip));
                if (File.Exists(iconPath))
                {
                    lines.Add("IconResource=" + iconPath + ",0");
                    lines.Add("IconFile=" + iconPath);
                    lines.Add("IconIndex=0");
                }
                lines.Add("");
                File.WriteAllText(desktopIniPath, String.Join(Environment.NewLine, lines.ToArray()), Encoding.Unicode);
                File.SetAttributes(desktopIniPath, FileAttributes.Hidden | FileAttributes.System | FileAttributes.Archive);

                DirectoryInfo directory = new DirectoryInfo(folderPath);
                directory.Attributes = directory.Attributes | FileAttributes.System | FileAttributes.ReadOnly;
            }
            catch
            {
            }
        }

        private static string ExplorerDisplayNameForFolder(SyncFolderConfig folder)
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

        private static string ExplorerInfoTipForFolder(SyncFolderConfig folder)
        {
            if (folder == null)
            {
                return DefaultExplorerFolderInfoTip;
            }

            string remotePath = NormalizeRemotePath(folder.RemotePath, folder.LocalPath);
            string direction = DirectionLabel(folder.Direction);
            if (UseKoreanLabels())
            {
                if (IsSharedRemotePath(remotePath))
                {
                    return "\uACF5\uC720\uBC1B\uC740 FileInNOut \uB3D9\uAE30\uD654 \uD3F4\uB354 - " + direction;
                }
                return "FileInNOut \uB3D9\uAE30\uD654 \uD3F4\uB354 - " + direction;
            }
            string sharedPrefix = IsSharedRemotePath(remotePath) ? "공유받은 " : "";
            return sharedPrefix + "FileInNOut 동기화 폴더 - " + direction;
        }

        private string ExplorerStatusInfoTipForFolder(SyncFolderConfig folder)
        {
            string baseTip = ExplorerInfoTipForFolder(folder);
            string status = FolderStatusLabel(folder);
            string remotePath = folder == null ? "" : NormalizeRemotePath(folder.RemotePath, folder.LocalPath);
            string detail = baseTip + " | \uC0C1\uD0DC: " + status;
            if (folder != null && IsSharedRemotePath(remotePath))
            {
                string permission = FolderPermissionLabel(folder);
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

        private void ClearExplorerFolderBranding(string folderPath)
        {
            if (String.IsNullOrWhiteSpace(folderPath) || !Directory.Exists(folderPath))
            {
                return;
            }

            try
            {
                string desktopIniPath = Path.Combine(folderPath, "desktop.ini");
                if (File.Exists(desktopIniPath))
                {
                    string content = File.ReadAllText(desktopIniPath);
                    if (content.Contains("LocalizedResourceName=FileInNOut") || content.Contains("FileInNOutDesktop.ico"))
                    {
                        File.SetAttributes(desktopIniPath, FileAttributes.Normal);
                        File.Delete(desktopIniPath);
                    }
                }

                DirectoryInfo directory = new DirectoryInfo(folderPath);
                directory.Attributes = directory.Attributes & ~FileAttributes.System & ~FileAttributes.ReadOnly;
            }
            catch
            {
            }
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
            if (String.IsNullOrWhiteSpace(targetFolder))
            {
                return;
            }

            try
            {
                Directory.CreateDirectory(targetFolder);
                string resolvedTarget = Path.GetFullPath(targetFolder);
                string iconPath = Path.Combine(installDir, "FileInNOutDesktop.ico");
                string displayIcon = File.Exists(iconPath) ? iconPath + ",0" : "%SystemRoot%\\System32\\shell32.dll,3";
                string clsidPath = "Software\\Classes\\CLSID\\" + ExplorerNamespaceGuid;

                using (RegistryKey key = Registry.CurrentUser.CreateSubKey(clsidPath))
                {
                    if (key == null)
                    {
                        return;
                    }
                    key.SetValue("", "FileInNOut", RegistryValueKind.String);
                    key.SetValue("System.IsPinnedToNameSpaceTree", 1, RegistryValueKind.DWord);
                    key.SetValue("SortOrderIndex", 66, RegistryValueKind.DWord);
                    key.SetValue("ThisPCPolicy", "Show", RegistryValueKind.String);
                }

                using (RegistryKey key = Registry.CurrentUser.CreateSubKey(clsidPath + "\\DefaultIcon"))
                {
                    if (key != null)
                    {
                        key.SetValue("", displayIcon, RegistryValueKind.String);
                    }
                }

                using (RegistryKey key = Registry.CurrentUser.CreateSubKey(clsidPath + "\\InProcServer32"))
                {
                    if (key != null)
                    {
                        key.SetValue("", "%SystemRoot%\\System32\\shell32.dll", RegistryValueKind.String);
                        key.SetValue("ThreadingModel", "Both", RegistryValueKind.String);
                    }
                }

                using (RegistryKey key = Registry.CurrentUser.CreateSubKey(clsidPath + "\\Instance"))
                {
                    if (key != null)
                    {
                        key.SetValue("CLSID", "{0E5AAE11-A475-4C5B-AB00-C66DE400274E}", RegistryValueKind.String);
                    }
                }

                using (RegistryKey key = Registry.CurrentUser.CreateSubKey(clsidPath + "\\Instance\\InitPropertyBag"))
                {
                    if (key != null)
                    {
                        key.SetValue("Attributes", 17, RegistryValueKind.DWord);
                        key.SetValue("TargetFolderPath", resolvedTarget, RegistryValueKind.String);
                    }
                }

                using (RegistryKey key = Registry.CurrentUser.CreateSubKey(clsidPath + "\\ShellFolder"))
                {
                    if (key != null)
                    {
                        key.SetValue("FolderValueFlags", 40, RegistryValueKind.DWord);
                        key.SetValue("Attributes", unchecked((int)0xF080004D), RegistryValueKind.DWord);
                    }
                }

                RegisterExplorerNamespaceLink("Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Desktop\\NameSpace\\" + ExplorerNamespaceGuid);
                RegisterExplorerNamespaceLink("Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\MyComputer\\NameSpace\\" + ExplorerNamespaceGuid);
            }
            catch
            {
            }
        }

        private void RegisterExplorerNamespaceLink(string registryPath)
        {
            using (RegistryKey key = Registry.CurrentUser.CreateSubKey(registryPath))
            {
                if (key != null)
                {
                    key.SetValue("", "FileInNOut", RegistryValueKind.String);
                }
            }
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

                Dictionary<string, string> desired = BuildDriveHubLinks(config, myDriveHubPath, sharedDriveHubPath);

                RemoveStaleDriveHubLinks(driveRootPath, desired, false);
                RemoveStaleDriveHubLinks(myDriveHubPath, desired, false);
                RemoveStaleDriveHubLinks(sharedDriveHubPath, desired, true);
                foreach (KeyValuePair<string, string> item in desired)
                {
                    EnsureDriveHubJunction(item.Key, item.Value);
                }
                PruneEmptySharedOwnerFolders(sharedDriveHubPath, desired);
                ApplySharedOwnerFolderBranding(sharedDriveHubPath, desired);

                string mappedLetter = EnsureDriveMapping(config.DriveLetter, driveRootPath);
                if (!String.IsNullOrWhiteSpace(mappedLetter) && !String.Equals(mappedLetter, NormalizeDriveLetter(config.DriveLetter), StringComparison.OrdinalIgnoreCase))
                {
                    config.DriveLetter = mappedLetter;
                    SaveDesktopConfig(config);
                }
                if (!String.IsNullOrWhiteSpace(mappedLetter))
                {
                    RegisterDriveAppearance(mappedLetter);
                }
            }
            catch
            {
            }
        }

        private void ApplySharedOwnerFolderBranding(string sharedDriveHubPath, Dictionary<string, string> desired)
        {
            if (String.IsNullOrWhiteSpace(sharedDriveHubPath) || desired == null)
            {
                return;
            }

            HashSet<string> brandedOwners = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (string linkPath in desired.Keys)
            {
                try
                {
                    string ownerPath = Path.GetDirectoryName(linkPath);
                    if (String.IsNullOrWhiteSpace(ownerPath) || SamePath(ownerPath, sharedDriveHubPath))
                    {
                        continue;
                    }

                    string ownerParent = Path.GetDirectoryName(ownerPath);
                    if (String.IsNullOrWhiteSpace(ownerParent) || !SamePath(ownerParent, sharedDriveHubPath))
                    {
                        continue;
                    }

                    if (brandedOwners.Add(ownerPath))
                    {
                        ApplyExplorerFolderBranding(ownerPath, Path.GetFileName(ownerPath), SharedDriveOwnerExplorerInfoTip);
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
                    if (String.IsNullOrWhiteSpace(ownerPath) || SamePath(ownerPath, sharedDriveHubPath))
                    {
                        continue;
                    }

                    string ownerParent = Path.GetDirectoryName(ownerPath);
                    if (!String.IsNullOrWhiteSpace(ownerParent) && SamePath(ownerParent, sharedDriveHubPath))
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

                    ClearExplorerFolderBranding(ownerPath);
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

        private Dictionary<string, string> BuildDriveHubLinks(DesktopConfig config, string myDriveHubPath, string sharedDriveHubPath)
        {
            Dictionary<string, string> desired = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            if (config == null || config.SyncFolders == null)
            {
                return desired;
            }

            foreach (SyncFolderConfig folder in config.SyncFolders)
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
                string name = SafeDriveLinkName(folder.Name, target);
                if (IsSharedRemotePath(folder.RemotePath))
                {
                    string owner = SharedRemoteOwner(folder.RemotePath);
                    if (!String.IsNullOrWhiteSpace(owner))
                    {
                        hubPath = Path.Combine(sharedDriveHubPath, owner);
                    }
                    else
                    {
                        hubPath = sharedDriveHubPath;
                    }
                    name = SharedDriveLinkName(folder, target);
                }
                string uniqueName = name;
                int suffix = 2;
                string linkPath = Path.Combine(hubPath, uniqueName);
                while (desired.ContainsKey(linkPath) && !SamePath(desired[linkPath], target))
                {
                    uniqueName = name + " " + suffix.ToString();
                    linkPath = Path.Combine(hubPath, uniqueName);
                    suffix++;
                }
                desired[linkPath] = target;
            }

            return desired;
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
                Dictionary<string, string> desired = BuildDriveHubLinks(config, myDriveHubPath, sharedDriveHubPath);
                string target = Path.GetFullPath(localPath);
                foreach (KeyValuePair<string, string> item in desired.OrderByDescending(x => Path.GetFullPath(x.Value).Length))
                {
                    if (SamePath(item.Value, target))
                    {
                        return item.Key;
                    }
                    if (PathIsInsideOrSame(item.Value, target))
                    {
                        string relative = MakeRelative(item.Value, target);
                        return Path.Combine(item.Key, relative);
                    }
                }
            }
            catch
            {
            }

            return "";
        }

        private void RemoveStaleDriveHubLinks(string rootPath, Dictionary<string, string> desired, bool recurse)
        {
            if (!Directory.Exists(rootPath))
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

        private static string SafeDriveLinkName(string preferredName, string targetFolder)
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

        private static string[] SharedRemotePathParts(string remotePath)
        {
            string normalized = (remotePath ?? "").Trim().Replace('\\', '/').Trim('/');
            return normalized.Split(new char[] { '/' }, StringSplitOptions.RemoveEmptyEntries);
        }

        private static string SharedRemoteOwner(string remotePath)
        {
            string[] parts = SharedRemotePathParts(remotePath);
            if (parts.Length < 3 || !String.Equals(parts[0], "Shared", StringComparison.OrdinalIgnoreCase))
            {
                return "";
            }
            return SafeDriveLinkName(parts[1], parts[1]);
        }

        private static string SharedRemoteFolderName(string remotePath)
        {
            string[] parts = SharedRemotePathParts(remotePath);
            if (parts.Length < 3 || !String.Equals(parts[0], "Shared", StringComparison.OrdinalIgnoreCase))
            {
                return "";
            }
            return SafeDriveLinkName(parts[parts.Length - 1], parts[parts.Length - 1]);
        }

        private static string SharedDriveLinkName(SyncFolderConfig folder, string targetFolder)
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

        private string EnsureDriveMapping(string driveLetter, string targetFolder)
        {
            string letter = NormalizeDriveLetter(driveLetter);
            if (String.IsNullOrWhiteSpace(letter) || String.IsNullOrWhiteSpace(targetFolder))
            {
                return "";
            }

            try
            {
                Directory.CreateDirectory(targetFolder);
                string target = Path.GetFullPath(targetFolder);
                foreach (string candidate in DriveLetterCandidates(letter))
                {
                    string driveName = candidate + ":";
                    string driveRoot = driveName + "\\";
                    string currentTarget = CurrentSubstTarget(candidate);

                    if (!String.IsNullOrWhiteSpace(currentTarget))
                    {
                        string resolvedCurrent = ResolvePathIfPossible(currentTarget);
                        if (SamePath(resolvedCurrent, target))
                        {
                            return candidate;
                        }
                        if (!IsFileInNOutExplorerFolder(resolvedCurrent))
                        {
                            continue;
                        }
                        RunHiddenProcess("cmd.exe", "/d /c subst " + driveName + " /D");
                    }
                    else if (Directory.Exists(driveRoot))
                    {
                        continue;
                    }

                    RunHiddenProcess("cmd.exe", "/d /c subst " + driveName + " " + Quote(target));
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

        private void RegisterDriveAppearance(string driveLetter)
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

        private string CurrentSubstTarget(string driveLetter)
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

            string[] lines = result.Output.Split(new[] { "\r\n", "\n" }, StringSplitOptions.RemoveEmptyEntries);
            string prefix = letter + ":\\: => ";
            foreach (string rawLine in lines)
            {
                string line = rawLine.Trim();
                if (line.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
                {
                    return line.Substring(prefix.Length).Trim();
                }
            }
            return "";
        }

        private CommandResult RunHiddenProcess(string fileName, string arguments)
        {
            ProcessStartInfo info = new ProcessStartInfo();
            info.FileName = fileName;
            info.Arguments = arguments;
            info.WorkingDirectory = installDir;
            info.UseShellExecute = false;
            info.RedirectStandardOutput = true;
            info.RedirectStandardError = true;
            info.CreateNoWindow = true;
            using (Process process = Process.Start(info))
            {
                string output = process.StandardOutput.ReadToEnd();
                string error = process.StandardError.ReadToEnd();
                process.WaitForExit();
                return new CommandResult(process.ExitCode, (output + Environment.NewLine + error).Trim());
            }
        }

        private static string ResolvePathIfPossible(string path)
        {
            try
            {
                return Path.GetFullPath(path);
            }
            catch
            {
                return path ?? "";
            }
        }

        private static bool IsFileInNOutExplorerFolder(string folderPath)
        {
            if (String.IsNullOrWhiteSpace(folderPath))
            {
                return false;
            }

            try
            {
                string desktopIni = Path.Combine(folderPath, "desktop.ini");
                if (!File.Exists(desktopIni))
                {
                    return false;
                }
                string content = File.ReadAllText(desktopIni);
                return content.IndexOf("LocalizedResourceName=FileInNOut", StringComparison.OrdinalIgnoreCase) >= 0 ||
                    content.IndexOf("FileInNOutDesktop.ico", StringComparison.OrdinalIgnoreCase) >= 0;
            }
            catch
            {
                return false;
            }
        }

        private static string NormalizeDriveLetter(string value)
        {
            string text = (value ?? "").Trim().TrimEnd(':').ToUpperInvariant();
            return Regex.IsMatch(text, "^[A-Z]$") ? text : "";
        }

        private static IEnumerable<string> DriveLetterCandidates(string preferredLetter)
        {
            HashSet<string> seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            string preferred = NormalizeDriveLetter(preferredLetter);
            if (!String.IsNullOrWhiteSpace(preferred))
            {
                for (char letter = preferred[0]; letter <= 'Z'; letter++)
                {
                    string value = letter.ToString();
                    if (seen.Add(value))
                    {
                        yield return value;
                    }
                }
            }

            for (char letter = 'G'; letter <= 'Z'; letter++)
            {
                string value = letter.ToString();
                if (seen.Add(value))
                {
                    yield return value;
                }
            }
        }

        public static string NormalizeDirection(string value)
        {
            value = (value ?? "").Trim().ToLowerInvariant().Replace("_", "-");
            if (value == "upload" || value == "push" || value == "local-to-cloud")
            {
                return "upload";
            }
            if (value == "download" || value == "pull" || value == "cloud-to-local")
            {
                return "download";
            }
            return "two-way";
        }

        private static bool UseKoreanLabels()
        {
            return true;
        }

        public static bool UseKoreanLabelsForUi()
        {
            return UseKoreanLabels();
        }

        public static string DirectionLabel(string value)
        {
            value = NormalizeDirection(value);
            if (UseKoreanLabels())
            {
                if (value == "upload")
                {
                    return "\uD3F4\uB354 -> \uD074\uB77C\uC6B0\uB4DC";
                }
                if (value == "download")
                {
                    return "\uD074\uB77C\uC6B0\uB4DC -> \uD3F4\uB354";
                }
                return "\uC591\uBC29\uD5A5";
            }
            if (value == "upload")
            {
                return "내 폴더 -> 클라우드";
            }
            if (value == "download")
            {
                return "클라우드 -> 내 폴더";
            }
            return "양방향";
        }

        public static string NormalizePermission(string value)
        {
            value = (value ?? "").Trim().ToUpperInvariant();
            if (value == "READ" || value == "DOWNLOAD" || value == "UPLOAD" || value == "WRITE")
            {
                return value;
            }
            return "";
        }

        public static string PermissionLabel(string value)
        {
            value = NormalizePermission(value);
            if (value == "READ")
            {
                return "\uBCF4\uAE30\uB9CC";
            }
            if (value == "DOWNLOAD")
            {
                return "\uBCF4\uAE30 + \uB2E4\uC6B4\uB85C\uB4DC";
            }
            if (value == "UPLOAD")
            {
                return "\uC5C5\uB85C\uB4DC\uB9CC";
            }
            if (value == "WRITE")
            {
                return "\uC804\uCCB4 \uD5C8\uC6A9";
            }
            return "\uACF5\uC720";
        }

        public static string NormalizeRemotePath(string remotePath, string localPath)
        {
            string text = (remotePath ?? "").Replace("\\", "/").Trim().Trim('/');
            if (String.IsNullOrWhiteSpace(text))
            {
                text = Path.GetFileName((localPath ?? "").TrimEnd('\\', '/'));
            }
            if (String.IsNullOrWhiteSpace(text))
            {
                text = "FileInNOut";
            }
            string[] parts = text.Split(new[] { '/' }, StringSplitOptions.RemoveEmptyEntries);
            for (int i = 0; i < parts.Length; i++)
            {
                parts[i] = SafeSegment(parts[i]);
            }
            return String.Join("/", parts);
        }

        private static string SafeSegment(string value)
        {
            string cleaned = Regex.Replace(value ?? "", "[<>:\"\\\\|?*]", "_").Trim();
            cleaned = cleaned.TrimEnd('.', ' ');
            return String.IsNullOrWhiteSpace(cleaned) ? "Folder" : cleaned;
        }

        private static SyncActivityItem BuildSyncActivityItem(string folderName, Dictionary<string, object> entry)
        {
            if (UseKoreanLabels())
            {
                string normalizedStatus = ReadString(entry, "status").Trim().ToLowerInvariant();
                string koreanLabel;
                if (normalizedStatus == "success")
                {
                    koreanLabel = "\uC131\uACF5";
                }
                else if (normalizedStatus == "error")
                {
                    koreanLabel = "\uC2E4\uD328";
                }
                else
                {
                    koreanLabel = String.IsNullOrWhiteSpace(normalizedStatus) ? "\uC0C1\uD0DC \uC5C6\uC74C" : normalizedStatus;
                }

                string koreanTitle = "[" + (String.IsNullOrWhiteSpace(folderName) ? "\uB3D9\uAE30\uD654 \uD3F4\uB354" : folderName) + "] " + koreanLabel;
                string koreanDetail = BuildSyncActivityDetail(entry);
                DateTime koreanUpdatedAt = UnixTimeToLocal(ReadLong(entry, "updatedAt"));
                return new SyncActivityItem(koreanTitle, koreanDetail, koreanUpdatedAt);
            }
            string status = ReadString(entry, "status").Trim().ToLowerInvariant();
            string label;
            if (status == "success")
            {
                label = "성공";
            }
            else if (status == "error")
            {
                label = "실패";
            }
            else
            {
                label = String.IsNullOrWhiteSpace(status) ? "상태 없음" : status;
            }

            string title = "[" + (String.IsNullOrWhiteSpace(folderName) ? "동기화 폴더" : folderName) + "] " + label;
            string detail = BuildSyncActivityDetail(entry);
            DateTime updatedAt = UnixTimeToLocal(ReadLong(entry, "updatedAt"));
            return new SyncActivityItem(title, detail, updatedAt);
        }

        private static string BuildSyncActivityDetail(Dictionary<string, object> entry)
        {
            if (UseKoreanLabels())
            {
                string koreanError = ReadString(entry, "error");
                if (!String.IsNullOrWhiteSpace(koreanError))
                {
                    return TrimText(koreanError, 42);
                }

                Dictionary<string, object> koreanPush = ReadDictionary(entry, "push");
                Dictionary<string, object> koreanPull = ReadDictionary(entry, "pull");
                int koreanPushed = ReadInt(koreanPush, "pushed");
                int koreanPulled = ReadInt(koreanPull, "pulled");
                int koreanDeleted = ReadInt(koreanPush, "deleted") + ReadInt(koreanPull, "deleted");
                int koreanFolders = ReadInt(koreanPush, "foldersCreated") + ReadInt(koreanPull, "foldersCreated");
                int koreanSkipped = ReadInt(koreanPush, "skippedDirty") + ReadInt(koreanPull, "skippedDirty");
                int koreanConflicts = ConflictCount(entry);
                int koreanDownloadFailed = ReadInt(koreanPush, "downloadFailed") + ReadInt(koreanPull, "downloadFailed");

                List<string> koreanParts = new List<string>();
                if (koreanPushed > 0) { koreanParts.Add("\uC5C5\uB85C\uB4DC " + koreanPushed); }
                if (koreanPulled > 0) { koreanParts.Add("\uB2E4\uC6B4\uB85C\uB4DC " + koreanPulled); }
                if (koreanDeleted > 0) { koreanParts.Add("\uC0AD\uC81C " + koreanDeleted); }
                if (koreanFolders > 0) { koreanParts.Add("\uD3F4\uB354 " + koreanFolders); }
                if (koreanDownloadFailed > 0) { koreanParts.Add("\uB2E4\uC6B4\uB85C\uB4DC \uC2E4\uD328 " + koreanDownloadFailed); }
                if (koreanConflicts > 0) { koreanParts.Add("\uCDA9\uB3CC " + koreanConflicts); }
                else if (koreanSkipped > 0) { koreanParts.Add("\uBCF4\uD638 " + koreanSkipped); }
                return koreanParts.Count == 0 ? "\uBCC0\uACBD \uC5C6\uC74C" : String.Join(", ", koreanParts.ToArray());
            }
            string error = ReadString(entry, "error");
            if (!String.IsNullOrWhiteSpace(error))
            {
                return TrimText(error, 42);
            }

            Dictionary<string, object> push = ReadDictionary(entry, "push");
            Dictionary<string, object> pull = ReadDictionary(entry, "pull");
            int pushed = ReadInt(push, "pushed");
            int pulled = ReadInt(pull, "pulled");
            int deleted = ReadInt(push, "deleted") + ReadInt(pull, "deleted");
            int folders = ReadInt(push, "foldersCreated") + ReadInt(pull, "foldersCreated");
            int skipped = ReadInt(push, "skippedDirty") + ReadInt(pull, "skippedDirty");
            int downloadFailed = ReadInt(push, "downloadFailed") + ReadInt(pull, "downloadFailed");

            List<string> parts = new List<string>();
            if (downloadFailed > 0) { parts.Add("download failed " + downloadFailed); }
            if (pushed > 0) { parts.Add("업로드 " + pushed); }
            if (pulled > 0) { parts.Add("다운로드 " + pulled); }
            if (deleted > 0) { parts.Add("삭제 " + deleted); }
            if (folders > 0) { parts.Add("폴더 " + folders); }
            if (skipped > 0) { parts.Add("건너뜀 " + skipped); }
            return parts.Count == 0 ? "변경 없음" : String.Join(", ", parts.ToArray());
        }

        private static Dictionary<string, object> ReadDictionary(Dictionary<string, object> data, string key)
        {
            object value;
            if (!data.TryGetValue(key, out value) || value == null)
            {
                return new Dictionary<string, object>();
            }
            Dictionary<string, object> dictionary = value as Dictionary<string, object>;
            return dictionary ?? new Dictionary<string, object>();
        }

        private static IEnumerable ReadEnumerable(Dictionary<string, object> data, string key)
        {
            object value;
            if (!data.TryGetValue(key, out value) || value == null || value is string)
            {
                return new object[0];
            }
            IEnumerable enumerable = value as IEnumerable;
            return enumerable ?? new object[0];
        }

        private static string ReadString(Dictionary<string, object> data, string key)
        {
            object value;
            if (!data.TryGetValue(key, out value) || value == null)
            {
                return "";
            }
            return Convert.ToString(value);
        }

        private static int ReadInt(Dictionary<string, object> data, string key)
        {
            object value;
            if (!data.TryGetValue(key, out value) || value == null)
            {
                return 0;
            }
            try
            {
                return Convert.ToInt32(value);
            }
            catch
            {
                return 0;
            }
        }

        private static long ReadLong(Dictionary<string, object> data, string key)
        {
            object value;
            if (!data.TryGetValue(key, out value) || value == null)
            {
                return 0;
            }
            try
            {
                return Convert.ToInt64(value);
            }
            catch
            {
                return 0;
            }
        }

        private static DateTime UnixTimeToLocal(long seconds)
        {
            if (seconds <= 0)
            {
                return DateTime.MinValue;
            }
            try
            {
                return new DateTime(1970, 1, 1, 0, 0, 0, DateTimeKind.Utc).AddSeconds(seconds).ToLocalTime();
            }
            catch
            {
                return DateTime.MinValue;
            }
        }

        private static string TrimText(string text, int maxLength)
        {
            string value = (text ?? "").Trim();
            if (value.Length <= maxLength)
            {
                return value;
            }
            return value.Substring(0, Math.Max(0, maxLength - 3)) + "...";
        }

        private static bool SamePath(string left, string right)
        {
            try
            {
                return Path.GetFullPath(left ?? "").TrimEnd('\\').Equals(
                    Path.GetFullPath(right ?? "").TrimEnd('\\'),
                    StringComparison.OrdinalIgnoreCase);
            }
            catch
            {
                return String.Equals(left, right, StringComparison.OrdinalIgnoreCase);
            }
        }

        private static Dictionary<string, string> ParseKeyValueOutput(string output)
        {
            Dictionary<string, string> values = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            foreach (string rawLine in (output ?? "").Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries))
            {
                int index = rawLine.IndexOf(':');
                if (index <= 0)
                {
                    continue;
                }
                values[rawLine.Substring(0, index).Trim()] = rawLine.Substring(index + 1).Trim();
            }
            return values;
        }

        private static string GetValue(Dictionary<string, string> values, string key)
        {
            string value;
            return values.TryGetValue(key, out value) ? value : "";
        }

        private static long ParseLong(string value)
        {
            long parsed;
            return long.TryParse(value, out parsed) ? parsed : 0;
        }

        private static string Quote(string value)
        {
            return "\"" + (value ?? "").Replace("\"", "\\\"") + "\"";
        }

        private static string MakeRelative(string root, string path)
        {
            string fullRoot = Path.GetFullPath(root).TrimEnd('\\') + "\\";
            string fullPath = Path.GetFullPath(path);
            if (fullPath.StartsWith(fullRoot, StringComparison.OrdinalIgnoreCase))
            {
                return fullPath.Substring(fullRoot.Length);
            }
            return fullPath;
        }

        private static string SummarizeSync(string output)
        {
            if (UseKoreanLabels())
            {
                output = TranslateCommandOutputKorean(output);
                if (String.IsNullOrWhiteSpace(output))
                {
                    return "\uBCC0\uACBD \uC0AC\uD56D \uC5C6\uC74C.";
                }
                return TrimForBalloon(output.Replace("\r", " ").Replace("\n", " "));
            }
            output = TranslateCommandOutput(output);
            if (String.IsNullOrWhiteSpace(output))
            {
                return "변경 사항 없음.";
            }
            Match match = Regex.Match(output, @"업로드:.*?다운로드:.*", RegexOptions.Singleline);
            if (match.Success)
            {
                return TrimForBalloon(match.Value.Replace("\r", " ").Replace("\n", " "));
            }
            return TrimForBalloon(output);
        }

        private static string TranslateCommandOutput(string output)
        {
            if (UseKoreanLabels())
            {
                return TranslateCommandOutputKorean(output);
            }
            if (String.IsNullOrWhiteSpace(output))
            {
                return "";
            }
            string text = output.Trim();
            text = Regex.Replace(text, @"(?m)^(.+?) push:", "$1 업로드:");
            text = Regex.Replace(text, @"(?m)^(.+?) pull:", "$1 다운로드:");
            text = Regex.Replace(text, @"(?m)^push:", "업로드:");
            text = Regex.Replace(text, @"(?m)^pull:", "다운로드:");
            text = text.Replace("pulled=", "받음=");
            text = text.Replace("pushed=", "올림=");
            text = text.Replace("deleted=", "삭제=");
            text = text.Replace("folders_created=", "폴더생성=");
            text = text.Replace("skipped_dirty=", "충돌건너뜀=");
            return text;
        }

        private static string TranslateCommandOutputKorean(string output)
        {
            if (String.IsNullOrWhiteSpace(output))
            {
                return "";
            }
            string text = output.Trim();
            text = Regex.Replace(text, @"(?m)^(.+?) push:", "$1 \uC5C5\uB85C\uB4DC:");
            text = Regex.Replace(text, @"(?m)^(.+?) pull:", "$1 \uB2E4\uC6B4\uB85C\uB4DC:");
            text = Regex.Replace(text, @"(?m)^push:", "\uC5C5\uB85C\uB4DC:");
            text = Regex.Replace(text, @"(?m)^pull:", "\uB2E4\uC6B4\uB85C\uB4DC:");
            text = text.Replace("pulled=", "\uBC1B\uC74C=");
            text = text.Replace("pushed=", "\uC62C\uB9BC=");
            text = text.Replace("deleted=", "\uC0AD\uC81C=");
            text = text.Replace("folders_created=", "\uD3F4\uB354\uC0DD\uC131=");
            text = text.Replace("skipped_dirty=", "\uCDA9\uB3CC\uAC74\uB108\uB700=");
            text = text.Replace("download_failed=", "\uB2E4\uC6B4\uB85C\uB4DC\uC2E4\uD328=");
            return text;
        }

        private static bool HasSyncChanges(string output)
        {
            if (String.IsNullOrWhiteSpace(output))
            {
                return false;
            }

            MatchCollection matches = Regex.Matches(output, @"(?:pulled|pushed|deleted|folders_created|download_failed)=(\d+)", RegexOptions.IgnoreCase);
            foreach (Match match in matches)
            {
                int value;
                if (Int32.TryParse(match.Groups[1].Value, out value) && value > 0)
                {
                    return true;
                }
            }
            return false;
        }

        private static string TrimForBalloon(string value)
        {
            if (String.IsNullOrWhiteSpace(value))
            {
                return "";
            }
            value = value.Trim();
            if (value.Length <= 220)
            {
                return value;
            }
            return value.Substring(0, 217) + "...";
        }
    }

    internal sealed class SettingsForm : Form
    {
        private readonly TrayController controller;
        private readonly Panel contentPanel;
        private Label subtitleLabel;
        private Label storageUsageLabel;
        private Label storageRemainLabel;
        private Label storagePlanLabel;
        private SmoothProgress storageProgress;
        private TextBox emailText;
        private TextBox passwordText;
        private TextBox localFolderText;
        private TextBox cloudFolderText;
        private TextBox shareEmailText;
        private TextBox sharedAddressText;
        private TextBox searchText;
        private ComboBox directionCombo;
        private ComboBox permissionCombo;
        private TextBox statusText;
        private ListView folderList;
        private ListView pendingShareList;
        private ListView fileList;
        private System.Windows.Forms.Timer searchRefreshTimer;
        private CheckBox notificationsCheck;
        private CheckBox autoSyncCheck;
        private bool rebuilding;

        public SettingsForm(TrayController controller)
        {
            this.controller = controller;
            Text = "FileInNOut 데스크톱";
            AutoScaleMode = AutoScaleMode.Dpi;
            Text = "FileInNOut \uB370\uC2A4\uD06C\uD1B1";
            Width = 980;
            Height = 780;
            MinimumSize = new Size(900, 700);
            StartPosition = FormStartPosition.CenterScreen;
            BackColor = AppColors.Background;
            Font = new Font("Malgun Gothic", 9F, FontStyle.Regular);
            DoubleBuffered = true;
            string iconPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "FileInNOutDesktop.ico");
            if (File.Exists(iconPath))
            {
                Icon = new Icon(iconPath);
            }

            searchRefreshTimer = new System.Windows.Forms.Timer();
            searchRefreshTimer.Interval = 450;
            searchRefreshTimer.Tick += delegate
            {
                searchRefreshTimer.Stop();
                RefreshRecentFiles();
            };
            Disposed += delegate
            {
                if (searchRefreshTimer != null)
                {
                    searchRefreshTimer.Dispose();
                }
            };

            contentPanel = new BufferedPanel();
            contentPanel.Dock = DockStyle.Fill;
            contentPanel.BackColor = AppColors.Background;
            contentPanel.AutoScroll = true;
            Controls.Add(contentPanel);

            FormClosing += delegate(object sender, FormClosingEventArgs e)
            {
                if (e.CloseReason == CloseReason.UserClosing)
                {
                    e.Cancel = true;
                    Hide();
                }
            };
        }

        public void RefreshAll()
        {
            if (rebuilding)
            {
                return;
            }
            rebuilding = true;
            try
            {
                contentPanel.SuspendLayout();
                contentPanel.Controls.Clear();
                ResetDashboardReferences();
                DesktopConfig config = controller.LoadDesktopConfig();
            if (String.IsNullOrWhiteSpace(config.RefreshToken))
            {
                BuildLogin(config);
            }
                else
                {
                    BuildDashboard(config);
                }
            }
            finally
            {
                contentPanel.ResumeLayout(true);
                rebuilding = false;
            }
        }

        public void RefreshLiveData()
        {
            if (rebuilding || IsDisposed)
            {
                return;
            }
            if (InvokeRequired)
            {
                BeginInvoke(new MethodInvoker(RefreshLiveData));
                return;
            }

            DesktopConfig config = controller.LoadDesktopConfig();
            if (String.IsNullOrWhiteSpace(config.RefreshToken) || statusText == null || fileList == null)
            {
                RefreshAll();
                return;
            }

            UpdateHeader(config);
            RefreshStorage();
            RefreshPendingShares();
            RefreshStatus();
            RefreshFolderStatuses();
            RefreshRecentFiles();
            if (autoSyncCheck != null && autoSyncCheck.Checked != controller.AutoSyncEnabled)
            {
                autoSyncCheck.Checked = controller.AutoSyncEnabled;
            }
            if (notificationsCheck != null && notificationsCheck.Checked != controller.NotificationsEnabled)
            {
                notificationsCheck.Checked = controller.NotificationsEnabled;
            }
        }

        private void BuildLogin(DesktopConfig config)
        {
            Panel shell = new Panel();
            shell.Dock = DockStyle.Fill;
            shell.BackColor = AppColors.Background;
            contentPanel.Controls.Add(shell);

            RoundedPanel card = new RoundedPanel();
            card.BackColor = Color.White;
            card.Radius = 8;
            card.Width = 430;
            card.Height = 320;
            card.Anchor = AnchorStyles.None;
            card.Left = (shell.Width - card.Width) / 2;
            card.Top = (shell.Height - card.Height) / 2;
            card.Resize += delegate
            {
                card.Left = (shell.Width - card.Width) / 2;
                card.Top = (shell.Height - card.Height) / 2;
            };
            shell.Resize += delegate
            {
                card.Left = (shell.Width - card.Width) / 2;
                card.Top = (shell.Height - card.Height) / 2;
            };
            shell.Controls.Add(card);

            Label title = CreateLabel("FileInNOut Desktop", 18, FontStyle.Bold, AppColors.Text);
            title.SetBounds(28, 26, 360, 32);
            card.Controls.Add(title);

            Label cloud = CreateLabel("FileInNOut Cloud에 로그인", 9, FontStyle.Regular, AppColors.Muted);
            cloud.SetBounds(30, 60, 250, 24);
            cloud.Text = "FileInNOut Cloud\uC5D0 \uB85C\uADF8\uC778";
            card.Controls.Add(cloud);

            Label emailLabel = CreateLabel("아이디 또는 이메일", 9, FontStyle.Bold, AppColors.Muted);
            emailLabel.SetBounds(30, 90, 360, 20);
            emailLabel.Text = "\uC544\uC774\uB514 \uB610\uB294 \uC774\uBA54\uC77C";
            card.Controls.Add(emailLabel);

            emailText = CreateTextBox();
            emailText.Text = config.Email;
            emailText.SetBounds(30, 112, 370, 34);
            card.Controls.Add(emailText);

            Label passwordLabel = CreateLabel("비밀번호", 9, FontStyle.Bold, AppColors.Muted);
            passwordLabel.SetBounds(30, 156, 360, 20);
            passwordLabel.Text = "\uBE44\uBC00\uBC88\uD638";
            card.Controls.Add(passwordLabel);

            passwordText = CreateTextBox();
            passwordText.UseSystemPasswordChar = true;
            passwordText.SetBounds(30, 178, 330, 34);
            card.Controls.Add(passwordText);

            RoundedButton showButton = new RoundedButton();
            showButton.Text = "보기";
            showButton.SetBounds(366, 178, 54, 34);
            showButton.Text = "\uBCF4\uAE30";
            showButton.Click += delegate { passwordText.UseSystemPasswordChar = !passwordText.UseSystemPasswordChar; };
            card.Controls.Add(showButton);

            CheckBox keepLogin = new CheckBox();
            keepLogin.Text = "로그인 상태 유지";
            keepLogin.Checked = true;
            keepLogin.Text = "\uB85C\uADF8\uC778 \uC0C1\uD0DC \uC720\uC9C0";
            keepLogin.AutoSize = true;
            keepLogin.ForeColor = AppColors.Muted;
            keepLogin.SetBounds(30, 226, 180, 24);
            card.Controls.Add(keepLogin);

            Label ipSecurity = CreateLabel("IP보안 OFF", 9, FontStyle.Bold, AppColors.Muted);
            ipSecurity.TextAlign = ContentAlignment.MiddleRight;
            ipSecurity.Text = "IP\uBCF4\uC548 OFF";
            ipSecurity.SetBounds(285, 226, 115, 24);
            card.Controls.Add(ipSecurity);

            RoundedButton loginButton = new RoundedButton();
            loginButton.Text = "로그인";
            loginButton.Primary = true;
            loginButton.Text = "\uB85C\uADF8\uC778";
            loginButton.SetBounds(30, 260, 370, 44);
            loginButton.Click += delegate { DoLogin(); };
            card.Controls.Add(loginButton);
            AcceptButton = loginButton;
        }

        private void BuildDashboard(DesktopConfig config)
        {
            TableLayoutPanel main = new TableLayoutPanel();
            main.Dock = DockStyle.Fill;
            main.Padding = new Padding(18);
            main.BackColor = AppColors.Background;
            main.ColumnCount = 1;
            main.RowCount = 5;
            main.RowStyles.Add(new RowStyle(SizeType.Absolute, 72));
            main.RowStyles.Add(new RowStyle(SizeType.Absolute, 112));
            main.RowStyles.Add(new RowStyle(SizeType.Absolute, 138));
            main.RowStyles.Add(new RowStyle(SizeType.Absolute, 300));
            main.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
            contentPanel.Controls.Add(main);

            main.Controls.Add(BuildHeader(config), 0, 0);
            main.Controls.Add(BuildStorageCard(), 0, 1);
            main.Controls.Add(BuildPendingShareCard(), 0, 2);
            main.Controls.Add(BuildFolderCard(config), 0, 3);
            main.Controls.Add(BuildBottomArea(), 0, 4);
        }

        private Control BuildHeader(DesktopConfig config)
        {
            TableLayoutPanel header = new TableLayoutPanel();
            header.Dock = DockStyle.Fill;
            header.BackColor = AppColors.Background;
            header.ColumnCount = 2;
            header.RowCount = 1;
            header.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
            header.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 380));

            TableLayoutPanel copy = new TableLayoutPanel();
            copy.Dock = DockStyle.Fill;
            copy.RowCount = 2;
            copy.ColumnCount = 1;
            copy.RowStyles.Add(new RowStyle(SizeType.Absolute, 38));
            copy.RowStyles.Add(new RowStyle(SizeType.Absolute, 24));

            Label title = CreateLabel("FileInNOut Desktop", 20, FontStyle.Bold, AppColors.Text);
            title.Dock = DockStyle.Fill;
            copy.Controls.Add(title, 0, 0);
            subtitleLabel = CreateLabel("", 9, FontStyle.Regular, AppColors.Muted);
            subtitleLabel.Dock = DockStyle.Fill;
            copy.Controls.Add(subtitleLabel, 0, 1);
            UpdateHeader(config);
            header.Controls.Add(copy, 0, 0);

            FlowLayoutPanel buttons = new FlowLayoutPanel();
            buttons.Dock = DockStyle.Fill;
            buttons.FlowDirection = FlowDirection.RightToLeft;
            buttons.WrapContents = false;
            buttons.Padding = new Padding(0, 13, 0, 0);

            RoundedButton webButton = new RoundedButton();
            webButton.Text = "웹 열기";
            webButton.Size = new Size(102, 36);
            webButton.Text = "\uC6F9 \uC5F4\uAE30";
            webButton.Margin = new Padding(8, 0, 0, 0);
            webButton.Click += delegate { controller.OpenWeb(); };

            RoundedButton pauseButton = new RoundedButton();
            pauseButton.Text = controller.AutoSyncEnabled ? "동기화 일시정지" : "동기화 재개";
            pauseButton.Size = new Size(132, 36);
            pauseButton.Text = controller.AutoSyncEnabled ? "\uB3D9\uAE30\uD654 \uC77C\uC2DC\uC815\uC9C0" : "\uB3D9\uAE30\uD654 \uC7AC\uAC1C";
            pauseButton.Margin = new Padding(8, 0, 0, 0);
            pauseButton.Click += delegate { controller.ToggleAutoSync(); RefreshLiveData(); };

            RoundedButton logoutButton = new RoundedButton();
            logoutButton.Text = "로그아웃";
            logoutButton.Size = new Size(96, 36);
            logoutButton.Text = "\uB85C\uADF8\uC544\uC6C3";
            logoutButton.Margin = new Padding(8, 0, 0, 0);
            logoutButton.Click += delegate { controller.Logout(); RefreshAll(); };
            buttons.Controls.Add(logoutButton);
            buttons.Controls.Add(webButton);
            buttons.Controls.Add(pauseButton);
            header.Controls.Add(buttons, 1, 0);

            return header;
        }

        private Control BuildStorageCard()
        {
            RoundedPanel card = new RoundedPanel();
            card.Dock = DockStyle.Fill;
            card.Margin = new Padding(0, 0, 0, 14);
            card.Radius = 8;
            card.BackColor = Color.White;
            card.Padding = new Padding(20, 16, 20, 16);

            StorageSummary summary = controller.GetStorageSummary();
            string used = FormatBytes(summary.UsedBytes);
            string total = FormatBytes(summary.QuotaBytes);
            string remain = FormatBytes(summary.RemainingBytes);
            if (!summary.Available)
            {
                used = "-";
                total = "-";
                remain = "-";
            }

            TableLayoutPanel layout = new TableLayoutPanel();
            layout.Dock = DockStyle.Fill;
            layout.ColumnCount = 2;
            layout.RowCount = 3;
            layout.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 300));
            layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
            layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 28));
            layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 36));
            layout.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
            card.Controls.Add(layout);

            Label title = CreateLabel("드라이브 용량", 12, FontStyle.Bold, AppColors.Text);
            title.Dock = DockStyle.Fill;
            layout.Controls.Add(title, 0, 0);

            storageUsageLabel = CreateLabel(used + " / " + total, 18, FontStyle.Bold, AppColors.PrimaryDark);
            storageUsageLabel.Dock = DockStyle.Fill;
            layout.Controls.Add(storageUsageLabel, 0, 1);
            layout.SetRowSpan(storageUsageLabel, 2);

            storageRemainLabel = CreateLabel("남은 용량 " + remain + "  |  파일 " + summary.FileCount + "개, 폴더 " + summary.FolderCount + "개", 9, FontStyle.Regular, AppColors.Muted);
            storageRemainLabel.Dock = DockStyle.Fill;
            layout.Controls.Add(storageRemainLabel, 1, 0);

            storageProgress = new SmoothProgress();
            storageProgress.Value = summary.UsagePercent;
            storageProgress.Dock = DockStyle.Fill;
            storageProgress.Margin = new Padding(0, 12, 0, 12);
            layout.Controls.Add(storageProgress, 1, 1);
            storagePlanLabel = CreateLabel(String.IsNullOrWhiteSpace(summary.PlanLabel) ? "" : summary.PlanLabel, 9, FontStyle.Regular, AppColors.Muted);
            storagePlanLabel.Dock = DockStyle.Fill;
            layout.Controls.Add(storagePlanLabel, 1, 2);
            ApplyStorageSummary(summary);

            return card;
        }

        private Control BuildPendingShareCard()
        {
            RoundedPanel card = new RoundedPanel();
            card.Dock = DockStyle.Fill;
            card.Margin = new Padding(0, 0, 0, 14);
            card.Radius = 8;
            card.BackColor = Color.White;
            card.Padding = new Padding(20, 14, 20, 14);

            TableLayoutPanel layout = new TableLayoutPanel();
            layout.Dock = DockStyle.Fill;
            layout.ColumnCount = 2;
            layout.RowCount = 3;
            layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
            layout.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 190));
            layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 30));
            layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 40));
            layout.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
            card.Controls.Add(layout);

            Label title = CreateLabel("공유 초대", 12, FontStyle.Bold, AppColors.Text);
            title.Dock = DockStyle.Fill;
            layout.Controls.Add(title, 0, 0);

            Label hint = CreateLabel("수락하면 공유 폴더가 동기화 대상에 포함됩니다.", 8, FontStyle.Regular, AppColors.Muted);
            hint.Dock = DockStyle.Fill;
            hint.TextAlign = ContentAlignment.MiddleRight;
            layout.Controls.Add(hint, 1, 0);

            sharedAddressText = CreateTextBox();
            sharedAddressText.Dock = DockStyle.Fill;
            sharedAddressText.Margin = new Padding(0, 2, 8, 6);
            layout.Controls.Add(sharedAddressText, 0, 1);

            RoundedButton openAddressButton = new RoundedButton();
            openAddressButton.Text = "\uC8FC\uC18C \uC5F4\uAE30";
            openAddressButton.Dock = DockStyle.Fill;
            openAddressButton.Margin = new Padding(12, 2, 0, 6);
            openAddressButton.Click += delegate { OpenSharedAddress(); };
            layout.Controls.Add(openAddressButton, 1, 1);

            pendingShareList = new ListView();
            pendingShareList.View = View.Details;
            pendingShareList.FullRowSelect = true;
            pendingShareList.HideSelection = false;
            pendingShareList.BorderStyle = BorderStyle.None;
            pendingShareList.Dock = DockStyle.Fill;
            pendingShareList.Columns.Add("공유 폴더/파일", 340);
            pendingShareList.Columns.Add("보낸 사람", 230);
            pendingShareList.Columns.Add("권한", 120);
            layout.Controls.Add(pendingShareList, 0, 2);

            TableLayoutPanel actions = new TableLayoutPanel();
            actions.Dock = DockStyle.Fill;
            actions.ColumnCount = 1;
            actions.RowCount = 3;
            actions.RowStyles.Add(new RowStyle(SizeType.Percent, 50));
            actions.RowStyles.Add(new RowStyle(SizeType.Absolute, 36));
            actions.RowStyles.Add(new RowStyle(SizeType.Absolute, 36));
            actions.Margin = new Padding(12, 0, 0, 0);
            layout.Controls.Add(actions, 1, 2);

            RoundedButton acceptButton = new RoundedButton();
            acceptButton.Text = "수락";
            acceptButton.Primary = true;
            acceptButton.Dock = DockStyle.Fill;
            acceptButton.Margin = new Padding(0, 0, 0, 6);
            acceptButton.Click += delegate { AcceptSelectedPendingShare(); };
            actions.Controls.Add(acceptButton, 0, 1);

            RoundedButton rejectButton = new RoundedButton();
            rejectButton.Text = "거절";
            rejectButton.Dock = DockStyle.Fill;
            rejectButton.Margin = new Padding(0);
            rejectButton.Click += delegate { RejectSelectedPendingShare(); };
            actions.Controls.Add(rejectButton, 0, 2);

            RefreshPendingShares();
            return card;
        }

        private Control BuildFolderCard(DesktopConfig config)
        {
            RoundedPanel card = new RoundedPanel();
            card.Dock = DockStyle.Fill;
            card.Margin = new Padding(0, 0, 0, 14);
            card.Radius = 8;
            card.BackColor = Color.White;
            card.Padding = new Padding(20, 16, 20, 16);

            TableLayoutPanel root = new TableLayoutPanel();
            root.Dock = DockStyle.Fill;
            root.ColumnCount = 2;
            root.RowCount = 2;
            root.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 44));
            root.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 56));
            root.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
            root.RowStyles.Add(new RowStyle(SizeType.Absolute, 34));
            card.Controls.Add(root);

            TableLayoutPanel left = new TableLayoutPanel();
            left.Dock = DockStyle.Fill;
            left.ColumnCount = 1;
            left.RowCount = 2;
            left.RowStyles.Add(new RowStyle(SizeType.Absolute, 28));
            left.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
            left.Margin = new Padding(0, 0, 16, 0);
            root.Controls.Add(left, 0, 0);

            Label title = CreateLabel("동기화 폴더", 12, FontStyle.Bold, AppColors.Text);
            title.Dock = DockStyle.Fill;
            title.Text = "\uB3D9\uAE30\uD654 \uD3F4\uB354";
            left.Controls.Add(title, 0, 0);

            folderList = new ListView();
            folderList.View = View.Details;
            folderList.FullRowSelect = true;
            folderList.HideSelection = false;
            folderList.BorderStyle = BorderStyle.None;
            folderList.Dock = DockStyle.Fill;
            folderList.Columns.Add("내 폴더", 145);
            folderList.Columns.Add("클라우드", 95);
            folderList.Columns.Add("방식", 95);
            folderList.Columns.Add("\uAD8C\uD55C", 92);
            folderList.Columns.Add("\uC0C1\uD0DC", 76);
            folderList.Columns[0].Text = "\uD3F4\uB354";
            folderList.Columns[1].Text = "\uD074\uB77C\uC6B0\uB4DC";
            folderList.Columns[2].Text = "\uBC29\uC2DD";
            foreach (SyncFolderConfig folder in config.SyncFolders)
            {
                if (!folder.Enabled)
                {
                    continue;
                }
                ListViewItem row = new ListViewItem(folder.LocalPath);
                row.Tag = folder;
                row.SubItems.Add(folder.RemotePath);
                row.SubItems.Add(TrayController.DirectionLabel(folder.Direction));
                row.SubItems.Add(controller.FolderPermissionLabel(folder));
                row.SubItems.Add(controller.FolderStatusLabel(folder));
                folderList.Items.Add(row);
            }
            folderList.SelectedIndexChanged += delegate { LoadSelectedFolder(); };
            left.Controls.Add(folderList, 0, 1);

            TableLayoutPanel form = new TableLayoutPanel();
            form.Dock = DockStyle.Fill;
            form.ColumnCount = 4;
            form.RowCount = 7;
            form.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
            form.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 112));
            form.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 90));
            form.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 88));
            form.RowStyles.Add(new RowStyle(SizeType.Absolute, 22));
            form.RowStyles.Add(new RowStyle(SizeType.Absolute, 36));
            form.RowStyles.Add(new RowStyle(SizeType.Absolute, 22));
            form.RowStyles.Add(new RowStyle(SizeType.Absolute, 36));
            form.RowStyles.Add(new RowStyle(SizeType.Absolute, 38));
            form.RowStyles.Add(new RowStyle(SizeType.Absolute, 22));
            form.RowStyles.Add(new RowStyle(SizeType.Absolute, 38));
            root.Controls.Add(form, 1, 0);

            Label localLabel = CreateLabel("내 폴더", 8, FontStyle.Bold, AppColors.Muted);
            localLabel.Dock = DockStyle.Fill;
            localLabel.Text = "\uD3F4\uB354";
            form.Controls.Add(localLabel, 0, 0);
            form.SetColumnSpan(localLabel, 4);

            localFolderText = CreateTextBox();
            localFolderText.Dock = DockStyle.Fill;
            localFolderText.Margin = new Padding(0, 2, 8, 4);
            form.Controls.Add(localFolderText, 0, 1);
            form.SetColumnSpan(localFolderText, 3);

            RoundedButton browseButton = new RoundedButton();
            browseButton.Text = "찾아보기";
            browseButton.Dock = DockStyle.Fill;
            browseButton.Text = "\uCC3E\uC544\uBCF4\uAE30";
            browseButton.Margin = new Padding(0, 0, 0, 4);
            browseButton.Click += delegate { BrowseFolder(); };
            form.Controls.Add(browseButton, 3, 1);

            Label cloudLabel = CreateLabel("클라우드 폴더", 8, FontStyle.Bold, AppColors.Muted);
            cloudLabel.Dock = DockStyle.Fill;
            cloudLabel.Text = "\uD074\uB77C\uC6B0\uB4DC \uD3F4\uB354";
            form.Controls.Add(cloudLabel, 0, 2);

            Label directionLabel = CreateLabel("동기화 방식", 8, FontStyle.Bold, AppColors.Muted);
            directionLabel.Dock = DockStyle.Fill;
            directionLabel.Text = "\uB3D9\uAE30\uD654 \uBC29\uC2DD";
            form.Controls.Add(directionLabel, 1, 2);
            form.SetColumnSpan(directionLabel, 2);

            cloudFolderText = CreateTextBox();
            cloudFolderText.Dock = DockStyle.Fill;
            cloudFolderText.Margin = new Padding(0, 2, 8, 4);
            form.Controls.Add(cloudFolderText, 0, 3);

            directionCombo = new ComboBox();
            directionCombo.DropDownStyle = ComboBoxStyle.DropDownList;
            directionCombo.Items.Add("양방향");
            directionCombo.Items.Add("내 폴더 -> 클라우드");
            directionCombo.Items.Add("클라우드 -> 내 폴더");
            directionCombo.Items.Clear();
            directionCombo.Items.Add("\uC591\uBC29\uD5A5");
            directionCombo.Items.Add("\uD3F4\uB354 -> \uD074\uB77C\uC6B0\uB4DC");
            directionCombo.Items.Add("\uD074\uB77C\uC6B0\uB4DC -> \uD3F4\uB354");
            directionCombo.Dock = DockStyle.Fill;
            directionCombo.Margin = new Padding(0, 2, 8, 4);
            directionCombo.SelectedIndex = 0;
            form.Controls.Add(directionCombo, 1, 3);
            form.SetColumnSpan(directionCombo, 2);

            RoundedButton saveButton = new RoundedButton();
            saveButton.Text = "저장";
            saveButton.Primary = true;
            saveButton.Text = "\uC800\uC7A5";
            saveButton.Dock = DockStyle.Fill;
            saveButton.Margin = new Padding(0, 0, 0, 4);
            saveButton.Click += delegate { SaveFolder(); };
            form.Controls.Add(saveButton, 3, 3);

            RoundedButton syncButton = new RoundedButton();
            syncButton.Text = "지금 동기화";
            syncButton.Primary = true;
            syncButton.Text = "\uC9C0\uAE08 \uB3D9\uAE30\uD654";
            syncButton.Dock = DockStyle.Fill;
            syncButton.Margin = new Padding(0, 6, 8, 4);
            syncButton.Click += delegate { controller.SyncNow(true); };
            form.Controls.Add(syncButton, 0, 4);

            RoundedButton openButton = new RoundedButton();
            openButton.Text = "열기";
            openButton.Dock = DockStyle.Fill;
            openButton.Text = "\uC5F4\uAE30";
            openButton.Margin = new Padding(0, 6, 8, 4);
            openButton.Click += delegate { controller.OpenFolder(localFolderText.Text.Trim()); };
            form.Controls.Add(openButton, 1, 4);

            RoundedButton removeButton = new RoundedButton();
            removeButton.Text = "제거";
            removeButton.Dock = DockStyle.Fill;
            removeButton.Text = "\uC81C\uAC70";
            removeButton.Margin = new Padding(0, 6, 8, 4);
            removeButton.Click += delegate { RemoveFolder(); };
            form.Controls.Add(removeButton, 2, 4);

            RoundedButton newButton = new RoundedButton();
            newButton.Text = "새 폴더";
            newButton.Dock = DockStyle.Fill;
            newButton.Text = "\uC0C8 \uD3F4\uB354";
            newButton.Margin = new Padding(0, 6, 0, 4);
            newButton.Click += delegate { NewFolder(); };
            form.Controls.Add(newButton, 3, 4);

            Label shareLabel = CreateLabel("이메일로 공유", 8, FontStyle.Bold, AppColors.Muted);
            shareLabel.Dock = DockStyle.Fill;
            shareLabel.Text = "\uC774\uBA54\uC77C\uB85C \uACF5\uC720";
            form.Controls.Add(shareLabel, 0, 5);
            form.SetColumnSpan(shareLabel, 4);

            shareEmailText = CreateTextBox();
            shareEmailText.Dock = DockStyle.Fill;
            shareEmailText.Margin = new Padding(0, 2, 8, 0);
            form.Controls.Add(shareEmailText, 0, 6);
            form.SetColumnSpan(shareEmailText, 2);

            permissionCombo = new ComboBox();
            permissionCombo.DropDownStyle = ComboBoxStyle.DropDownList;
            permissionCombo.Items.Add("전체 허용");
            permissionCombo.Items.Add("보기만");
            permissionCombo.Items.Add("보기 + 다운로드");
            permissionCombo.Items.Add("업로드만");
            permissionCombo.Items.Clear();
            permissionCombo.Items.Add("\uC804\uCCB4 \uD5C8\uC6A9");
            permissionCombo.Items.Add("\uBCF4\uAE30\uB9CC");
            permissionCombo.Items.Add("\uBCF4\uAE30 + \uB2E4\uC6B4\uB85C\uB4DC");
            permissionCombo.Items.Add("\uC5C5\uB85C\uB4DC\uB9CC");
            permissionCombo.SelectedIndex = 0;
            permissionCombo.Dock = DockStyle.Fill;
            permissionCombo.Margin = new Padding(0, 2, 8, 0);
            form.Controls.Add(permissionCombo, 2, 6);

            RoundedButton shareButton = new RoundedButton();
            shareButton.Text = "공유";
            shareButton.Dock = DockStyle.Fill;
            shareButton.Text = "\uACF5\uC720";
            shareButton.Margin = new Padding(0, 0, 0, 0);
            shareButton.Click += delegate { ShareFolder(); };
            form.Controls.Add(shareButton, 3, 6);

            FlowLayoutPanel options = new FlowLayoutPanel();
            options.Dock = DockStyle.Fill;
            options.FlowDirection = FlowDirection.LeftToRight;
            options.WrapContents = false;
            options.Margin = new Padding(0);
            options.Padding = new Padding(0, 4, 0, 0);
            root.Controls.Add(options, 0, 1);
            root.SetColumnSpan(options, 2);

            autoSyncCheck = new CheckBox();
            autoSyncCheck.Text = "파일 변경 및 20초마다 자동 동기화";
            autoSyncCheck.AutoSize = true;
            autoSyncCheck.Text = "\uD30C\uC77C \uBCC0\uACBD \uBC0F 20\uCD08\uB9C8\uB2E4 \uC790\uB3D9 \uB3D9\uAE30\uD654";
            autoSyncCheck.Checked = controller.AutoSyncEnabled;
            autoSyncCheck.ForeColor = AppColors.Muted;
            autoSyncCheck.Margin = new Padding(0, 0, 22, 0);
            autoSyncCheck.CheckedChanged += delegate
            {
                if (autoSyncCheck.Checked != controller.AutoSyncEnabled)
                {
                    controller.ToggleAutoSync();
                }
            };
            options.Controls.Add(autoSyncCheck);

            notificationsCheck = new CheckBox();
            notificationsCheck.Text = "파일 변경이 있을 때만 알림";
            notificationsCheck.AutoSize = true;
            notificationsCheck.Text = "\uD30C\uC77C \uBCC0\uACBD\uC774 \uC788\uC744 \uB54C\uB9CC \uC54C\uB9BC";
            notificationsCheck.Checked = controller.NotificationsEnabled;
            notificationsCheck.ForeColor = AppColors.Muted;
            notificationsCheck.CheckedChanged += delegate { controller.SetNotifications(notificationsCheck.Checked); };
            options.Controls.Add(notificationsCheck);

            if (folderList.Items.Count > 0)
            {
                folderList.Items[0].Selected = true;
                LoadSelectedFolder();
            }

            return card;
        }

        private Control BuildBottomArea()
        {
            TableLayoutPanel area = new TableLayoutPanel();
            area.Dock = DockStyle.Fill;
            area.ColumnCount = 2;
            area.RowCount = 1;
            area.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 52));
            area.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 48));

            RoundedPanel statusCard = new RoundedPanel();
            statusCard.Dock = DockStyle.Fill;
            statusCard.Margin = new Padding(0, 0, 7, 0);
            statusCard.Radius = 8;
            statusCard.BackColor = Color.White;
            statusCard.Padding = new Padding(18, 14, 18, 18);

            TableLayoutPanel statusLayout = new TableLayoutPanel();
            statusLayout.Dock = DockStyle.Fill;
            statusLayout.ColumnCount = 2;
            statusLayout.RowCount = 2;
            statusLayout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
            statusLayout.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 112));
            statusLayout.RowStyles.Add(new RowStyle(SizeType.Absolute, 38));
            statusLayout.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
            statusCard.Controls.Add(statusLayout);

            Label statusLabel = CreateLabel("상태", 12, FontStyle.Bold, AppColors.Text);
            statusLabel.Dock = DockStyle.Fill;
            statusLabel.Text = "\uC0C1\uD0DC";
            statusLayout.Controls.Add(statusLabel, 0, 0);

            RoundedButton diagnosticButton = new RoundedButton();
            diagnosticButton.Text = "진단";
            diagnosticButton.Dock = DockStyle.Fill;
            diagnosticButton.Text = "\uC9C4\uB2E8";
            diagnosticButton.Margin = new Padding(0, 0, 0, 6);
            diagnosticButton.Click += delegate { statusText.Text = controller.DoctorLocal(localFolderText == null ? "" : localFolderText.Text.Trim()); };
            statusLayout.Controls.Add(diagnosticButton, 1, 0);

            statusText = new TextBox();
            statusText.Multiline = true;
            statusText.ScrollBars = ScrollBars.Vertical;
            statusText.ReadOnly = true;
            statusText.BorderStyle = BorderStyle.None;
            statusText.BackColor = Color.White;
            statusText.ForeColor = AppColors.Text;
            statusText.Dock = DockStyle.Fill;
            RefreshStatus();
            statusLayout.Controls.Add(statusText, 0, 1);
            statusLayout.SetColumnSpan(statusText, 2);

            RoundedPanel filesCard = new RoundedPanel();
            filesCard.Dock = DockStyle.Fill;
            filesCard.Margin = new Padding(7, 0, 0, 0);
            filesCard.Radius = 8;
            filesCard.BackColor = Color.White;
            filesCard.Padding = new Padding(18, 14, 18, 18);

            TableLayoutPanel filesLayout = new TableLayoutPanel();
            filesLayout.Dock = DockStyle.Fill;
            filesLayout.ColumnCount = 1;
            filesLayout.RowCount = 3;
            filesLayout.RowStyles.Add(new RowStyle(SizeType.Absolute, 38));
            filesLayout.RowStyles.Add(new RowStyle(SizeType.Absolute, 40));
            filesLayout.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
            filesCard.Controls.Add(filesLayout);

            Label filesLabel = CreateLabel("\uBB38\uC81C \uBC0F \uB3D9\uAE30\uD654 \uD65C\uB3D9", 12, FontStyle.Bold, AppColors.Text);
            filesLabel.Dock = DockStyle.Fill;
            filesLayout.Controls.Add(filesLabel, 0, 0);

            TableLayoutPanel searchRow = new TableLayoutPanel();
            searchRow.Dock = DockStyle.Fill;
            searchRow.ColumnCount = 2;
            searchRow.RowCount = 1;
            searchRow.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 72));
            searchRow.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
            searchRow.Margin = new Padding(0, 0, 0, 6);
            filesLayout.Controls.Add(searchRow, 0, 1);

            Label searchLabel = CreateLabel("파일 검색", 8, FontStyle.Bold, AppColors.Muted);
            searchLabel.Dock = DockStyle.Fill;
            searchLabel.Text = "\uD30C\uC77C \uAC80\uC0C9";
            searchRow.Controls.Add(searchLabel, 0, 0);

            searchText = CreateTextBox();
            searchText.Dock = DockStyle.Fill;
            searchText.Margin = new Padding(0, 0, 0, 4);
            searchText.TextChanged += delegate { QueueSearchRefresh(); };
            searchRow.Controls.Add(searchText, 1, 0);

            fileList = new ListView();
            fileList.View = View.Details;
            fileList.FullRowSelect = true;
            fileList.BorderStyle = BorderStyle.None;
            fileList.Dock = DockStyle.Fill;
            fileList.Columns.Add("대상/결과", 185);
            fileList.Columns.Add("변경", 88);
            fileList.Columns.Add("시간", 105);
            fileList.Columns[0].Text = "\uAC80\uC0C9 \uACB0\uACFC";
            fileList.Columns[1].Text = "\uBCC0\uACBD";
            fileList.Columns[2].Text = "\uC2DC\uAC04";
            fileList.DoubleClick += delegate { OpenSelectedSearchResult(); };
            RefreshRecentFiles();
            filesLayout.Controls.Add(fileList, 0, 2);

            area.Controls.Add(statusCard, 0, 0);
            area.Controls.Add(filesCard, 1, 0);
            return area;
        }

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
            if (TrayController.UseKoreanLabelsForUi())
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
            if (TrayController.UseKoreanLabelsForUi())
            {
                ApplyStorageSummaryKorean(summary);
                return;
            }
            string used = FormatBytes(summary.UsedBytes);
            string total = FormatBytes(summary.QuotaBytes);
            string remain = FormatBytes(summary.RemainingBytes);
            if (!summary.Available)
            {
                used = "-";
                total = "-";
                remain = "-";
            }
            storageUsageLabel.Text = used + " / " + total;
            storageRemainLabel.Text = "남은 용량 " + remain + "  |  파일 " + summary.FileCount + "개, 폴더 " + summary.FolderCount + "개";
            storageProgress.Value = summary.Available ? summary.UsagePercent : 0;
            storageProgress.Invalidate();
            storagePlanLabel.Text = String.IsNullOrWhiteSpace(summary.PlanLabel) ? "" : summary.PlanLabel;
        }

        private void ApplyStorageSummaryKorean(StorageSummary summary)
        {
            string used = FormatBytes(summary.UsedBytes);
            string total = FormatBytes(summary.QuotaBytes);
            string remain = FormatBytes(summary.RemainingBytes);
            if (!summary.Available)
            {
                used = "-";
                total = "-";
                remain = "-";
            }
            storageUsageLabel.Text = used + " / " + total;
            storageRemainLabel.Text = "\uB0A8\uC740 \uC6A9\uB7C9 " + remain + "  |  \uD30C\uC77C " + summary.FileCount + "\uAC1C, \uD3F4\uB354 " + summary.FolderCount + "\uAC1C";
            storageProgress.Value = summary.Available ? summary.UsagePercent : 0;
            storageProgress.Invalidate();
            storagePlanLabel.Text = String.IsNullOrWhiteSpace(summary.PlanLabel) ? "" : summary.PlanLabel;
        }

        private void RefreshStatus()
        {
            if (TrayController.UseKoreanLabelsForUi())
            {
                RefreshStatusKorean();
                return;
            }
            if (statusText != null)
            {
                string text = (controller.LastStatus + Environment.NewLine + Environment.NewLine + controller.LastOutput).Trim();
                if (controller.IsSyncActive)
                {
                    text = "\uB3D9\uAE30\uD654 \uC9C4\uD589 \uC911" + Environment.NewLine + Environment.NewLine + text;
                }
                else if (controller.IsSyncPaused)
                {
                    text = "동기화 일시정지됨" + Environment.NewLine + Environment.NewLine + text;
                }
                else if (controller.HasPendingFileChange)
                {
                    text = "\uBCC0\uACBD\uC774 \uAC10\uC9C0\uB418\uC5B4 \uB2E4\uC74C \uB3D9\uAE30\uD654\uB97C \uB300\uAE30 \uC911\uC785\uB2C8\uB2E4." + Environment.NewLine + Environment.NewLine + text;
                }
                statusText.Text = text.Trim();
            }
        }

        private void RefreshStatusKorean()
        {
            if (statusText != null)
            {
                string text = (controller.LastStatus + Environment.NewLine + Environment.NewLine + controller.LastOutput).Trim();
                if (controller.IsSyncActive)
                {
                    text = "\uB3D9\uAE30\uD654 \uC9C4\uD589 \uC911" + Environment.NewLine + Environment.NewLine + text;
                }
                else if (controller.IsSyncPaused)
                {
                    text = "\uB3D9\uAE30\uD654 \uC77C\uC2DC\uC815\uC9C0\uB428" + Environment.NewLine + Environment.NewLine + text;
                }
                else if (controller.HasPendingFileChange)
                {
                    text = "\uBCC0\uACBD\uC774 \uAC10\uC9C0\uB418\uC5B4 \uB2E4\uC74C \uB3D9\uAE30\uD654\uB97C \uB300\uAE30 \uC911\uC785\uB2C8\uB2E4." + Environment.NewLine + Environment.NewLine + text;
                }
                statusText.Text = text.Trim();
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
            string direction = TrayController.NormalizeDirection(folder.Direction);
            directionCombo.SelectedIndex = direction == "upload" ? 1 : direction == "download" ? 2 : 0;
        }

        private void DoLogin()
        {
            if (TrayController.UseKoreanLabelsForUi())
            {
                DoLoginKorean();
                return;
            }
            try
            {
                controller.Login(emailText.Text.Trim(), passwordText.Text);
                passwordText.Text = "";
                RefreshAll();
            }
            catch (Exception ex)
            {
                MessageBox.Show(ex.Message, "로그인 실패", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            }
        }

        private void SaveFolder()
        {
            if (TrayController.UseKoreanLabelsForUi())
            {
                SaveFolderKorean();
                return;
            }
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
                MessageBox.Show(ex.Message, "폴더 저장 실패", MessageBoxButtons.OK, MessageBoxIcon.Warning);
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
            if (TrayController.UseKoreanLabelsForUi())
            {
                ShareFolderKoreanUi();
                return;
            }
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
                MessageBox.Show(ex.Message, "공유 실패", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            }
        }

        private void OpenSharedAddress()
        {
            if (TrayController.UseKoreanLabelsForUi())
            {
                OpenSharedAddressKoreanUi();
                return;
            }
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
                MessageBox.Show(ex.Message, "Open shared address failed", MessageBoxButtons.OK, MessageBoxIcon.Warning);
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
            if (TrayController.UseKoreanLabelsForUi())
            {
                AcceptSelectedPendingShareKorean();
                return;
            }
            try
            {
                controller.AcceptPendingShare(SelectedPendingShare());
                RefreshPendingShares();
                RefreshLiveData();
            }
            catch (Exception ex)
            {
                MessageBox.Show(ex.Message, "공유 초대 수락 실패", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            }
        }

        private void RejectSelectedPendingShare()
        {
            if (TrayController.UseKoreanLabelsForUi())
            {
                RejectSelectedPendingShareKorean();
                return;
            }
            try
            {
                controller.RejectPendingShare(SelectedPendingShare());
                RefreshPendingShares();
                RefreshLiveData();
            }
            catch (Exception ex)
            {
                MessageBox.Show(ex.Message, "공유 초대 거절 실패", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            }
        }

        private void BrowseFolder()
        {
            if (TrayController.UseKoreanLabelsForUi())
            {
                BrowseFolderKorean();
                return;
            }
            using (FolderBrowserDialog dialog = new FolderBrowserDialog())
            {
                dialog.Description = "FileInNOut 동기화에 사용할 폴더를 선택하세요";
                dialog.SelectedPath = localFolderText.Text;
                if (dialog.ShowDialog(this) == DialogResult.OK)
                {
                    localFolderText.Text = dialog.SelectedPath;
                    if (String.IsNullOrWhiteSpace(cloudFolderText.Text))
                    {
                        cloudFolderText.Text = TrayController.NormalizeRemotePath("", dialog.SelectedPath);
                    }
                }
            }
        }

        private void DoLoginKorean()
        {
            try
            {
                controller.Login(emailText.Text.Trim(), passwordText.Text);
                passwordText.Text = "";
                RefreshAll();
            }
            catch (Exception ex)
            {
                MessageBox.Show(ex.Message, "\uB85C\uADF8\uC778 \uC2E4\uD328", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            }
        }

        private void SaveFolderKorean()
        {
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
                MessageBox.Show(ex.Message, "\uD3F4\uB354 \uC800\uC7A5 \uC2E4\uD328", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            }
        }

        private void ShareFolderKoreanUi()
        {
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
                MessageBox.Show(ex.Message, "\uACF5\uC720 \uC2E4\uD328", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            }
        }

        private void OpenSharedAddressKoreanUi()
        {
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
                MessageBox.Show(ex.Message, "\uACF5\uC720 \uC8FC\uC18C \uC5F4\uAE30 \uC2E4\uD328", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            }
        }

        private void AcceptSelectedPendingShareKorean()
        {
            try
            {
                controller.AcceptPendingShare(SelectedPendingShare());
                RefreshPendingShares();
                RefreshLiveData();
            }
            catch (Exception ex)
            {
                MessageBox.Show(ex.Message, "\uACF5\uC720 \uCD08\uB300 \uC218\uB77D \uC2E4\uD328", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            }
        }

        private void RejectSelectedPendingShareKorean()
        {
            try
            {
                controller.RejectPendingShare(SelectedPendingShare());
                RefreshPendingShares();
                RefreshLiveData();
            }
            catch (Exception ex)
            {
                MessageBox.Show(ex.Message, "\uACF5\uC720 \uCD08\uB300 \uAC70\uC808 \uC2E4\uD328", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            }
        }

        private void BrowseFolderKorean()
        {
            using (FolderBrowserDialog dialog = new FolderBrowserDialog())
            {
                dialog.Description = "FileInNOut \uB3D9\uAE30\uD654\uC5D0 \uC0AC\uC6A9\uD560 \uD3F4\uB354\uB97C \uC120\uD0DD\uD558\uC138\uC694.";
                dialog.SelectedPath = localFolderText.Text;
                if (dialog.ShowDialog(this) == DialogResult.OK)
                {
                    localFolderText.Text = dialog.SelectedPath;
                    if (String.IsNullOrWhiteSpace(cloudFolderText.Text))
                    {
                        cloudFolderText.Text = TrayController.NormalizeRemotePath("", dialog.SelectedPath);
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

        private static TextBox CreateTextBox()
        {
            TextBox text = new TextBox();
            text.BorderStyle = BorderStyle.FixedSingle;
            text.Font = new Font("Malgun Gothic", 10F, FontStyle.Regular);
            text.BackColor = Color.White;
            text.ForeColor = AppColors.Text;
            return text;
        }

        private static Label CreateLabel(string text, float size, FontStyle style, Color color)
        {
            Label label = new Label();
            label.Text = text;
            label.Font = new Font("Malgun Gothic", size, style);
            label.ForeColor = color;
            label.AutoSize = false;
            label.TextAlign = ContentAlignment.MiddleLeft;
            return label;
        }

        private static string FormatBytes(long bytes)
        {
            if (bytes >= 1024L * 1024L * 1024L * 1024L)
            {
                return (bytes / 1024d / 1024d / 1024d / 1024d).ToString("0.0 TB");
            }
            if (bytes >= 1024L * 1024L * 1024L)
            {
                return (bytes / 1024d / 1024d / 1024d).ToString("0.0 GB");
            }
            if (bytes >= 1024L * 1024L)
            {
                return (bytes / 1024d / 1024d).ToString("0.0 MB");
            }
            if (bytes >= 1024L)
            {
                return (bytes / 1024d).ToString("0.0 KB");
            }
            return bytes + " B";
        }
    }

    internal static class AppColors
    {
        public static readonly Color Background = Color.FromArgb(244, 250, 246);
        public static readonly Color Primary = Color.FromArgb(22, 163, 74);
        public static readonly Color PrimaryDark = Color.FromArgb(21, 128, 61);
        public static readonly Color Sky = Color.FromArgb(52, 211, 153);
        public static readonly Color Text = Color.FromArgb(15, 23, 42);
        public static readonly Color Muted = Color.FromArgb(87, 102, 97);
        public static readonly Color Border = Color.FromArgb(205, 232, 213);
    }

    internal sealed class BufferedPanel : Panel
    {
        public BufferedPanel()
        {
            SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.ResizeRedraw, true);
            UpdateStyles();
        }
    }

    internal sealed class RoundedPanel : Panel
    {
        public int Radius = 8;

        public RoundedPanel()
        {
            SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.ResizeRedraw, true);
            UpdateStyles();
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
            using (GraphicsPath path = RoundedRect(new Rectangle(0, 0, Width - 1, Height - 1), Radius))
            using (SolidBrush brush = new SolidBrush(BackColor))
            using (Pen pen = new Pen(AppColors.Border))
            {
                e.Graphics.FillPath(brush, path);
                e.Graphics.DrawPath(pen, path);
            }
        }

        private static GraphicsPath RoundedRect(Rectangle bounds, int radius)
        {
            int diameter = radius * 2;
            GraphicsPath path = new GraphicsPath();
            path.AddArc(bounds.X, bounds.Y, diameter, diameter, 180, 90);
            path.AddArc(bounds.Right - diameter, bounds.Y, diameter, diameter, 270, 90);
            path.AddArc(bounds.Right - diameter, bounds.Bottom - diameter, diameter, diameter, 0, 90);
            path.AddArc(bounds.X, bounds.Bottom - diameter, diameter, diameter, 90, 90);
            path.CloseFigure();
            return path;
        }
    }

    internal sealed class RoundedButton : Button
    {
        public bool Primary;
        private bool pressed;

        public RoundedButton()
        {
            SetStyle(ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.ResizeRedraw, true);
            FlatStyle = FlatStyle.Flat;
            FlatAppearance.BorderSize = 0;
            Cursor = Cursors.Hand;
            Font = new Font("Malgun Gothic", 9F, FontStyle.Bold);
            ForeColor = AppColors.PrimaryDark;
            BackColor = Color.Transparent;
        }

        protected override void OnMouseDown(MouseEventArgs mevent)
        {
            pressed = true;
            Invalidate();
            base.OnMouseDown(mevent);
        }

        protected override void OnMouseUp(MouseEventArgs mevent)
        {
            pressed = false;
            Invalidate();
            base.OnMouseUp(mevent);
        }

        protected override void OnPaint(PaintEventArgs pevent)
        {
            pevent.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
            using (SolidBrush parentBrush = new SolidBrush(Parent != null ? Parent.BackColor : SystemColors.Control))
            {
                pevent.Graphics.FillRectangle(parentBrush, ClientRectangle);
            }

            Color fill;
            Color border;
            Color text;
            if (Primary)
            {
                fill = pressed ? AppColors.PrimaryDark : AppColors.Primary;
                border = fill;
                text = Color.White;
            }
            else
            {
                fill = pressed ? Color.FromArgb(209, 250, 229) : Color.FromArgb(240, 253, 244);
                border = AppColors.Border;
                text = AppColors.PrimaryDark;
            }

            using (GraphicsPath path = RoundedRect(new Rectangle(0, 0, Width - 1, Height - 1), 8))
            using (SolidBrush brush = new SolidBrush(fill))
            using (Pen pen = new Pen(border))
            using (SolidBrush textBrush = new SolidBrush(text))
            {
                pevent.Graphics.FillPath(brush, path);
                pevent.Graphics.DrawPath(pen, path);
                StringFormat format = new StringFormat();
                format.Alignment = StringAlignment.Center;
                format.LineAlignment = StringAlignment.Center;
                Rectangle textRect = ClientRectangle;
                if (pressed)
                {
                    textRect.Offset(0, 1);
                }
                pevent.Graphics.DrawString(Text, Font, textBrush, textRect, format);
            }
        }

        private static GraphicsPath RoundedRect(Rectangle bounds, int radius)
        {
            int diameter = radius * 2;
            GraphicsPath path = new GraphicsPath();
            path.AddArc(bounds.X, bounds.Y, diameter, diameter, 180, 90);
            path.AddArc(bounds.Right - diameter, bounds.Y, diameter, diameter, 270, 90);
            path.AddArc(bounds.Right - diameter, bounds.Bottom - diameter, diameter, diameter, 0, 90);
            path.AddArc(bounds.X, bounds.Bottom - diameter, diameter, diameter, 90, 90);
            path.CloseFigure();
            return path;
        }
    }

    internal sealed class SmoothProgress : Control
    {
        public int Value;

        public SmoothProgress()
        {
            Height = 18;
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
            Rectangle bounds = new Rectangle(0, 0, Width - 1, Height - 1);
            using (GraphicsPath background = RoundedRect(bounds, 8))
            using (SolidBrush backgroundBrush = new SolidBrush(Color.FromArgb(220, 252, 231)))
            {
                e.Graphics.FillPath(backgroundBrush, background);
            }

            int width = Math.Max(4, (int)((Width - 1) * Math.Max(0, Math.Min(100, Value)) / 100d));
            Rectangle fillBounds = new Rectangle(0, 0, width, Height - 1);
            using (GraphicsPath fill = RoundedRect(fillBounds, 8))
            using (LinearGradientBrush brush = new LinearGradientBrush(fillBounds, AppColors.Primary, AppColors.Sky, LinearGradientMode.Horizontal))
            {
                e.Graphics.FillPath(brush, fill);
            }
        }

        private static GraphicsPath RoundedRect(Rectangle bounds, int radius)
        {
            int diameter = radius * 2;
            GraphicsPath path = new GraphicsPath();
            path.AddArc(bounds.X, bounds.Y, diameter, diameter, 180, 90);
            path.AddArc(bounds.Right - diameter, bounds.Y, diameter, diameter, 270, 90);
            path.AddArc(bounds.Right - diameter, bounds.Bottom - diameter, diameter, diameter, 0, 90);
            path.AddArc(bounds.X, bounds.Bottom - diameter, diameter, diameter, 90, 90);
            path.CloseFigure();
            return path;
        }
    }

    internal sealed class DesktopConfig
    {
        public string Server = "";
        public string Email = "";
        public string Token = "";
        public string RefreshToken = "";
        public string SyncDir = "";
        public string DriveLetter = "G";
        public List<SyncFolderConfig> SyncFolders = new List<SyncFolderConfig>();
    }

    internal sealed class SyncFolderConfig
    {
        public string Name = "";
        public string LocalPath = "";
        public string RemotePath = "";
        public string Direction = "two-way";
        public string Permission = "";
        public bool Enabled = true;
    }

    internal sealed class StorageSummary
    {
        public bool Available;
        public string RawOutput = "";
        public string PlanLabel = "";
        public long UsedBytes;
        public long QuotaBytes;
        public long RemainingBytes;
        public int UsagePercent;
        public int FileCount;
        public int FolderCount;
    }

    internal sealed class CommandResult
    {
        public readonly int ExitCode;
        public readonly string Output;

        public CommandResult(int exitCode, string output)
        {
            ExitCode = exitCode;
            Output = output ?? "";
        }
    }

    internal sealed class SyncActivityItem
    {
        public readonly string Title;
        public readonly string Detail;
        public readonly DateTime UpdatedAt;

        public SyncActivityItem(string title, string detail, DateTime updatedAt)
        {
            Title = title;
            Detail = detail;
            UpdatedAt = updatedAt;
        }
    }

    internal sealed class SearchResultItem
    {
        public readonly string Title;
        public readonly string Detail;
        public readonly DateTime UpdatedAt;
        public readonly string LocalPath;
        public readonly string WebUrl;

        public SearchResultItem(string title, string detail, DateTime updatedAt, string localPath)
            : this(title, detail, updatedAt, localPath, "")
        {
        }

        public SearchResultItem(string title, string detail, DateTime updatedAt, string localPath, string webUrl)
        {
            Title = title;
            Detail = detail;
            UpdatedAt = updatedAt;
            LocalPath = localPath;
            WebUrl = webUrl;
        }
    }

    internal sealed class PendingShareItem
    {
        public readonly int Id;
        public readonly string Path;
        public readonly string Owner;
        public readonly string Permission;

        public PendingShareItem(int id, string path, string owner, string permission)
        {
            Id = id;
            Path = String.IsNullOrWhiteSpace(path) ? "(이름 없음)" : path;
            Owner = String.IsNullOrWhiteSpace(owner) ? "-" : owner;
            Permission = String.IsNullOrWhiteSpace(permission) ? "READ" : permission.Trim().ToUpperInvariant();
        }

        public string PermissionLabel
        {
            get
            {
                if (Permission == "WRITE")
                {
                    return "전체 허용";
                }
                if (Permission == "DOWNLOAD")
                {
                    return "보기 + 다운로드";
                }
                if (Permission == "UPLOAD")
                {
                    return "업로드만";
                }
                return "보기만";
            }
        }
    }

    internal static class CloudFilesIntegration
    {
        private const int S_OK = 0;
        private const uint CF_REGISTER_FLAG_UPDATE = 0x00000001;
        private const uint CF_REGISTER_FLAG_MARK_IN_SYNC_ON_ROOT = 0x00000004;
        private const ushort CF_HYDRATION_POLICY_ALWAYS_FULL = 3;
        private const ushort CF_POPULATION_POLICY_ALWAYS_FULL = 3;
        private static readonly Guid ProviderId = new Guid("5C66E909-B8D2-4E16-AF7E-EC8F8892D4D3");

        public static void TryRegisterSyncRoot(string syncRootPath)
        {
            try
            {
                RegisterSyncRoot(syncRootPath);
            }
            catch
            {
            }
        }

        public static int RegisterSyncRoot(string syncRootPath)
        {
            if (String.IsNullOrWhiteSpace(syncRootPath))
            {
                return 1;
            }

            try
            {
                Directory.CreateDirectory(syncRootPath);
                string root = Path.GetFullPath(syncRootPath);
                CF_SYNC_REGISTRATION registration = new CF_SYNC_REGISTRATION();
                registration.StructSize = (uint)Marshal.SizeOf(typeof(CF_SYNC_REGISTRATION));
                registration.ProviderName = "FileInNOut";
                registration.ProviderVersion = "1.0";
                registration.SyncRootIdentity = IntPtr.Zero;
                registration.SyncRootIdentityLength = 0;
                registration.FileIdentity = IntPtr.Zero;
                registration.FileIdentityLength = 0;
                registration.ProviderId = ProviderId;
                string diagnostic = BuildSyncRootDiagnostic(root);

                CF_SYNC_POLICIES policies = new CF_SYNC_POLICIES();
                policies.StructSize = (uint)Marshal.SizeOf(typeof(CF_SYNC_POLICIES));
                policies.Hydration = new CF_HYDRATION_POLICY
                {
                    Primary = CF_HYDRATION_POLICY_ALWAYS_FULL,
                    Modifier = 0
                };
                policies.Population = new CF_POPULATION_POLICY
                {
                    Primary = CF_POPULATION_POLICY_ALWAYS_FULL,
                    Modifier = 0
                };
                policies.InSync = 0;
                policies.HardLink = 0;
                policies.PlaceholderManagement = 0;

                int hr = CfRegisterSyncRoot(
                    root,
                    ref registration,
                    ref policies,
                    CF_REGISTER_FLAG_UPDATE | CF_REGISTER_FLAG_MARK_IN_SYNC_ON_ROOT);
                WriteIntegrationLog("CfRegisterSyncRoot", root, hr, diagnostic);
                return hr == S_OK ? 0 : hr;
            }
            catch (DllNotFoundException error)
            {
                WriteIntegrationLog("CfRegisterSyncRoot", syncRootPath, 1, error.Message);
                return 1;
            }
            catch (EntryPointNotFoundException error)
            {
                WriteIntegrationLog("CfRegisterSyncRoot", syncRootPath, 1, error.Message);
                return 1;
            }
            catch (Exception error)
            {
                WriteIntegrationLog("CfRegisterSyncRoot", syncRootPath, 1, error.Message);
                return 1;
            }
        }

        public static int UnregisterSyncRoot(string syncRootPath)
        {
            if (String.IsNullOrWhiteSpace(syncRootPath))
            {
                return 1;
            }

            try
            {
                string root = Path.GetFullPath(syncRootPath);
                string diagnostic = BuildSyncRootDiagnostic(root);
                int hr = CfUnregisterSyncRoot(root);
                WriteIntegrationLog("CfUnregisterSyncRoot", root, hr, diagnostic);
                return hr == S_OK ? 0 : hr;
            }
            catch (DllNotFoundException error)
            {
                WriteIntegrationLog("CfUnregisterSyncRoot", syncRootPath, 1, error.Message);
                return 1;
            }
            catch (EntryPointNotFoundException error)
            {
                WriteIntegrationLog("CfUnregisterSyncRoot", syncRootPath, 1, error.Message);
                return 1;
            }
            catch (Exception error)
            {
                WriteIntegrationLog("CfUnregisterSyncRoot", syncRootPath, 1, error.Message);
                return 1;
            }
        }

        private static void WriteIntegrationLog(string action, string root, int result, string detail = "")
        {
            try
            {
                string localAppData = Environment.GetEnvironmentVariable("LOCALAPPDATA");
                if (String.IsNullOrWhiteSpace(localAppData))
                {
                    localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
                }
                string logDir = Path.Combine(localAppData, "FileInNOutDesktop", "logs");
                Directory.CreateDirectory(logDir);
                string line = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") + " " + action +
                    " root=" + root + " result=0x" + result.ToString("X8") +
                    (String.IsNullOrWhiteSpace(detail) ? "" : " detail=" + detail);
                File.AppendAllText(Path.Combine(logDir, "integration.log"), line + Environment.NewLine, Encoding.UTF8);
            }
            catch
            {
            }
        }

        private static string BuildSyncRootDiagnostic(string root)
        {
            List<string> parts = new List<string>();
            try
            {
                DirectoryInfo directory = new DirectoryInfo(root);
                parts.Add("exists=" + directory.Exists);
                if (directory.Exists)
                {
                    parts.Add("attributes=" + directory.Attributes);
                }
            }
            catch (Exception error)
            {
                parts.Add("attributesError=" + error.GetType().Name);
            }

            try
            {
                string probe = Path.Combine(root, ".fileinnout-cloudfiles-probe-" + Guid.NewGuid().ToString("N") + ".tmp");
                File.WriteAllText(probe, "probe", Encoding.UTF8);
                File.Delete(probe);
                parts.Add("canWrite=true");
            }
            catch (Exception error)
            {
                parts.Add("canWrite=false:" + error.GetType().Name);
            }

            try
            {
                string fullRoot = Path.GetPathRoot(root);
                if (!String.IsNullOrWhiteSpace(fullRoot))
                {
                    DriveInfo drive = new DriveInfo(fullRoot);
                    parts.Add("driveFormat=" + drive.DriveFormat);
                    parts.Add("driveType=" + drive.DriveType);
                }
            }
            catch (Exception error)
            {
                parts.Add("driveError=" + error.GetType().Name);
            }

            return String.Join(" ", parts.ToArray());
        }

        public static void WriteCommandLineFailure(string command, string root, Exception error)
        {
            WriteIntegrationLog("CloudFilesCommandLine " + command, root, 1, error.ToString());
        }

        [DllImport("CldApi.dll", CharSet = CharSet.Unicode)]
        private static extern int CfRegisterSyncRoot(
            string SyncRootPath,
            ref CF_SYNC_REGISTRATION Registration,
            ref CF_SYNC_POLICIES Policies,
            uint RegisterFlags);

        [DllImport("CldApi.dll", CharSet = CharSet.Unicode)]
        private static extern int CfUnregisterSyncRoot(string SyncRootPath);

        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        private struct CF_SYNC_REGISTRATION
        {
            public uint StructSize;
            [MarshalAs(UnmanagedType.LPWStr)]
            public string ProviderName;
            [MarshalAs(UnmanagedType.LPWStr)]
            public string ProviderVersion;
            public IntPtr SyncRootIdentity;
            public uint SyncRootIdentityLength;
            public IntPtr FileIdentity;
            public uint FileIdentityLength;
            public Guid ProviderId;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct CF_HYDRATION_POLICY
        {
            public ushort Primary;
            public ushort Modifier;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct CF_POPULATION_POLICY
        {
            public ushort Primary;
            public ushort Modifier;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct CF_SYNC_POLICIES
        {
            public uint StructSize;
            public CF_HYDRATION_POLICY Hydration;
            public CF_POPULATION_POLICY Population;
            public uint InSync;
            public uint HardLink;
            public uint PlaceholderManagement;
        }
    }
}
