using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Security.Principal;
using System.Threading;
using System.Windows.Forms;

namespace FileInNOutDesktopSetup
{
    internal static class Program
    {
        private static readonly string Version = "__FILEINNOUT_SETUP_VERSION__";
        private const string PayloadResourceName = "FileInNOutDesktopPayload";

        [STAThread]
        private static int Main(string[] args)
        {
            string tempRoot = Path.Combine(Path.GetTempPath(), "FileInNOutDesktopSetup-" + Guid.NewGuid().ToString("N"));
            try
            {
                Directory.CreateDirectory(tempRoot);
                string zipPath = Path.Combine(tempRoot, "payload.zip");
                WritePayload(zipPath);
                ZipFile.ExtractToDirectory(zipPath, tempRoot);
                ValidatePackage(tempRoot);

                if (HasArg(args, "--verify") || HasArg(args, "/verify"))
                {
                    Console.WriteLine("FileInNOut Desktop setup verification passed. Version: " + Version);
                    return 0;
                }
                if (HasArg(args, "--help") || HasArg(args, "/?") || HasArg(args, "/help"))
                {
                    PrintHelp();
                    return 0;
                }

                if (args.Length == 0)
                {
                    Application.EnableVisualStyles();
                    Application.SetCompatibleTextRenderingDefault(false);
                    using (SetupForm form = new SetupForm(tempRoot))
                    {
                        Application.Run(form);
                        return form.ExitCode;
                    }
                }

                return RunInstaller(tempRoot, args, InstallerOptions.CommandLine(), false, null);
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine("FileInNOut Desktop setup failed: " + ex.Message);
                return 1;
            }
            finally
            {
                TryDelete(tempRoot);
            }
        }

        internal static int RunInstaller(string tempRoot, string[] args, InstallerOptions options, bool enableExplorerCloudIntegration, Action<int, string> progress)
        {
            if (options == null)
            {
                options = InstallerOptions.CommandLine();
            }

            string installer = Path.Combine(tempRoot, "install-windows.ps1");
            string forwarded = BuildForwardedArguments(args, options);
            string powershellArgs = "-NoProfile -ExecutionPolicy Bypass -File " + Quote(installer);
            string bundledPythonRuntime = Path.Combine(tempRoot, "python-runtime");
            if (Directory.Exists(bundledPythonRuntime) && !HasInstallerArg(args, "-PythonExe") && !HasInstallerArg(args, "-PythonRuntimeDir"))
            {
                powershellArgs += " -PythonRuntimeDir " + Quote(bundledPythonRuntime);
            }
            if (!String.IsNullOrWhiteSpace(forwarded))
            {
                powershellArgs += " " + forwarded;
            }

            if (progress != null)
            {
                progress(35, "Installing files...");
            }

            using (Process process = new Process())
            {
                process.StartInfo.FileName = "powershell.exe";
                process.StartInfo.Arguments = powershellArgs;
                process.StartInfo.UseShellExecute = false;
                process.StartInfo.CreateNoWindow = true;
                process.StartInfo.RedirectStandardOutput = true;
                process.StartInfo.RedirectStandardError = true;
                process.Start();
                string output = process.StandardOutput.ReadToEnd();
                string error = process.StandardError.ReadToEnd();
                process.WaitForExit();
                if (progress != null)
                {
                    progress(90, output + Environment.NewLine + error);
                }
                if (process.ExitCode == 0 && enableExplorerCloudIntegration)
                {
                    TryRunElevatedShellSyncRootRegistration(args, progress);
                }
                return process.ExitCode;
            }
        }

        private static void TryRunElevatedShellSyncRootRegistration(string[] args, Action<int, string> progress)
        {
            string installDir = GetInstallerArgValue(args, "-InstallDir", Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "FileInNOutDesktop"));
            string syncDir = GetInstallerArgValue(args, "-SyncDir", Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "FileInNOut"));
            string namespaceGuid = NormalizeGuid(GetInstallerArgValue(args, "-ExplorerNamespaceGuid", "{6F4F52E8-8E6F-4B94-A14D-8B22C50C13B9}"));
            string accountId = GetInstallerArgValue(args, "-Email", "default");
            string iconPath = Path.Combine(installDir, "FileInNOutDesktop.ico");

            try
            {
                string sid = WindowsIdentity.GetCurrent().User.Value;
                string safeAccount = MakeSafeSyncRootComponent(accountId);
                string syncRootId = "FileInNOut!" + sid + "!" + safeAccount;
                string registryPath = "HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\SyncRootManager\\" + syncRootId;
                string userSyncRootsPath = registryPath + "\\UserSyncRoots";
                string iconValue = File.Exists(iconPath) ? iconPath + ",0" : "%SystemRoot%\\System32\\shell32.dll,3";

                string script =
                    "$ErrorActionPreference='Stop';" +
                    "$path=" + PsQuote(registryPath) + ";" +
                    "$roots=" + PsQuote(userSyncRootsPath) + ";" +
                    "New-Item -Path $path -Force | Out-Null;" +
                    "New-ItemProperty -Path $path -Name 'DisplayNameResource' -Value 'FileInNOut' -PropertyType String -Force | Out-Null;" +
                    "New-ItemProperty -Path $path -Name 'IconResource' -Value " + PsQuote(iconValue) + " -PropertyType ExpandString -Force | Out-Null;" +
                    "New-ItemProperty -Path $path -Name 'NamespaceCLSID' -Value " + PsQuote(namespaceGuid) + " -PropertyType String -Force | Out-Null;" +
                    "New-Item -Path $roots -Force | Out-Null;" +
                    "New-ItemProperty -Path $roots -Name " + PsQuote(sid) + " -Value " + PsQuote(syncDir) + " -PropertyType ExpandString -Force | Out-Null;";

                if (progress != null)
                {
                    progress(92, "Requesting administrator approval for Explorer cloud integration...");
                }
                using (Process elevated = new Process())
                {
                    elevated.StartInfo.FileName = "powershell.exe";
                    elevated.StartInfo.Arguments = "-NoProfile -ExecutionPolicy Bypass -Command " + Quote(script);
                    elevated.StartInfo.UseShellExecute = true;
                    elevated.StartInfo.Verb = "runas";
                    elevated.Start();
                    elevated.WaitForExit();
                    if (progress != null)
                    {
                        progress(elevated.ExitCode == 0 ? 96 : 92, elevated.ExitCode == 0 ? "Explorer cloud integration enabled." : "Explorer cloud integration was skipped or failed.");
                    }
                }
            }
            catch (Exception ex)
            {
                if (progress != null)
                {
                    progress(92, "Explorer cloud integration was skipped: " + ex.Message);
                }
            }
        }

        private static string GetInstallerArgValue(string[] args, string name, string fallback)
        {
            if (args == null)
            {
                return fallback;
            }
            for (int i = 0; i < args.Length; i++)
            {
                string arg = args[i] ?? "";
                if (String.Equals(arg, name, StringComparison.OrdinalIgnoreCase) && i + 1 < args.Length)
                {
                    return args[i + 1] ?? fallback;
                }
                string prefix = name + "=";
                if (arg.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
                {
                    return arg.Substring(prefix.Length);
                }
            }
            return fallback;
        }

        private static string NormalizeGuid(string value)
        {
            try
            {
                return "{" + new Guid((value ?? "").Trim().Trim('{', '}')).ToString().ToUpperInvariant() + "}";
            }
            catch
            {
                return "{6F4F52E8-8E6F-4B94-A14D-8B22C50C13B9}";
            }
        }

        private static string MakeSafeSyncRootComponent(string value)
        {
            string text = String.IsNullOrWhiteSpace(value) ? "default" : value.Trim();
            char[] chars = text.ToCharArray();
            for (int i = 0; i < chars.Length; i++)
            {
                char c = chars[i];
                if (c == '\\' || c == '/' || c == ':' || c == '*' || c == '?' || c == '"' || c == '<' || c == '>' || c == '|' || c == '!')
                {
                    chars[i] = '_';
                }
            }
            return new string(chars);
        }

        private static string PsQuote(string value)
        {
            return "'" + (value ?? "").Replace("'", "''") + "'";
        }

        private static void ValidatePackage(string root)
        {
            string[] required =
            {
                "fileinnout_desktop.py",
                "fileinnout_desktop_constants.py",
                "fileinnout_desktop_models.py",
                "fileinnout_desktop_paths.py",
                "fileinnout_desktop_api.py",
                "fileinnout_desktop_security.py",
                "fileinnout_desktop_windows.py",
                "fileinnout_desktop_state.py",
                "fileinnout_desktop_config.py",
                "fileinnout_desktop_files.py",
                "fileinnout_desktop_remote.py",
                "fileinnout_desktop_web.py",
                "fileinnout_desktop_drive.py",
                "fileinnout_desktop_drive_hub.py",
                "fileinnout_desktop_profiles.py",
                "fileinnout_desktop_diagnostics.py",
                "fileinnout_desktop_sharing.py",
                "fileinnout_desktop_sync.py",
                "fileinnout_desktop_parser.py",
                "fileinnout_desktop_status_commands.py",
                "fileinnout_desktop_share_commands.py",
                "fileinnout_desktop_sync_local.py",
                "fileinnout_desktop_sync_shared.py",
                "fileinnout_desktop_sync_moves.py",
                "fileinnout_desktop_drive_adoption.py",
                "FileInNOutDesktop.exe",
                "FileInNOutDesktop.ico",
                "DesktopProgram.cs",
                "FileInNOutDesktopTray.cs",
                "SettingsForm.cs",
                "DesktopUiControls.cs",
                "DesktopTrayMenu.cs",
                "DesktopTrayVisuals.cs",
                "DesktopSettingsText.cs",
                "DesktopSettingsDialogText.cs",
                "DesktopModels.cs",
                "DesktopSyncText.cs",
                "DesktopUpdateService.cs",
                "DesktopExplorerText.cs",
                "DesktopExplorerBranding.cs",
                "DesktopExplorerNamespace.cs",
                "DesktopDriveHubLinks.cs",
                "DesktopDriveHubMaintenance.cs",
                "DesktopDriveMapping.cs",
                "DesktopProcessRunner.cs",
                "DesktopPathRules.cs",
                "DesktopDataReader.cs",
                "DesktopTrayConfigStore.cs",
                "DesktopTrayPreferences.cs",
                "DesktopFolderProfileRules.cs",
                "DesktopFileSearch.cs",
                "DesktopSearchService.cs",
                "DesktopSyncState.cs",
                "DesktopChangeTracker.cs",
                "DesktopSyncCommandRunner.cs",
                "ExplorerDriveLauncher.cs",
                "CloudFilesIntegration.cs",
                "install-windows.ps1",
                "install-windows-shell.ps1",
                "install-windows-drive-hub.ps1",
                "uninstall-windows.ps1",
                "README.md",
                "manifest.json"
            };
            foreach (string file in required)
            {
                string path = Path.Combine(root, file);
                if (!File.Exists(path))
                {
                    throw new FileNotFoundException("Setup package is missing " + file, path);
                }
            }
        }

        private static void WritePayload(string zipPath)
        {
            using (Stream input = Assembly.GetExecutingAssembly().GetManifestResourceStream(PayloadResourceName))
            {
                if (input == null)
                {
                    throw new InvalidOperationException("Setup payload resource was not found.");
                }
                using (FileStream output = File.Create(zipPath))
                {
                    input.CopyTo(output);
                }
            }
        }

        private static bool HasArg(string[] args, string expected)
        {
            foreach (string arg in args)
            {
                if (String.Equals(arg, expected, StringComparison.OrdinalIgnoreCase))
                {
                    return true;
                }
            }
            return false;
        }

        private static bool HasInstallerArg(string[] args, string expected)
        {
            foreach (string arg in args)
            {
                if (String.Equals(arg, expected, StringComparison.OrdinalIgnoreCase))
                {
                    return true;
                }
            }
            return false;
        }

        private static void PrintHelp()
        {
            Console.WriteLine("FileInNOut Desktop Setup " + Version);
            Console.WriteLine("Run without arguments to open the graphical installer.");
            Console.WriteLine("Any extra arguments are forwarded to install-windows.ps1.");
            Console.WriteLine("Examples:");
            Console.WriteLine("  FileInNOutDesktopSetup.exe -Configure -Server https://drive.example.com/api -Email admin@fileinnout.local");
            Console.WriteLine("  FileInNOutDesktopSetup.exe --verify");
        }

        private static string BuildForwardedArguments(string[] args, InstallerOptions options)
        {
            if (options == null)
            {
                options = InstallerOptions.CommandLine();
            }

            string result = "";
            if (options.InstallStartupTask)
            {
                result = AddArg(result, "-InstallStartupTask");
            }
            if (options.StartAfterInstall)
            {
                result = AddArg(result, "-StartNow");
            }
            if (options.CreateDesktopShortcut)
            {
                result = AddArg(result, "-CreateDesktopShortcut");
            }
            if (!options.CreateStartMenuShortcuts)
            {
                result = AddArg(result, "-NoStartMenuShortcuts");
            }
            foreach (string arg in args ?? new string[0])
            {
                if (String.Equals(arg, "--verify", StringComparison.OrdinalIgnoreCase) ||
                    String.Equals(arg, "/verify", StringComparison.OrdinalIgnoreCase))
                {
                    continue;
                }
                result = AddArg(result, arg);
            }
            return result;
        }

        private static string AddArg(string result, string arg)
        {
            if (result.Length > 0)
            {
                result += " ";
            }
            return result + Quote(arg);
        }

        private static string Quote(string value)
        {
            if (value == null)
            {
                return "\"\"";
            }
            return "\"" + value.Replace("\\", "\\\\").Replace("\"", "\\\"") + "\"";
        }

        private static void TryDelete(string path)
        {
            try
            {
                if (Directory.Exists(path))
                {
                    Directory.Delete(path, true);
                }
            }
            catch
            {
            }
        }
    }

    internal sealed class InstallerOptions
    {
        public bool CreateDesktopShortcut { get; set; }
        public bool InstallStartupTask { get; set; }
        public bool StartAfterInstall { get; set; }
        public bool CreateStartMenuShortcuts { get; set; }

        public static InstallerOptions CommandLine()
        {
            InstallerOptions options = new InstallerOptions();
            options.CreateDesktopShortcut = false;
            options.InstallStartupTask = false;
            options.StartAfterInstall = false;
            options.CreateStartMenuShortcuts = true;
            return options;
        }

        public static InstallerOptions InteractiveDefaults()
        {
            InstallerOptions options = CommandLine();
            options.CreateDesktopShortcut = true;
            options.InstallStartupTask = true;
            options.StartAfterInstall = true;
            options.CreateStartMenuShortcuts = true;
            return options;
        }
    }
}
