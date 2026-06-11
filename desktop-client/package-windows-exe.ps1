param(
  [string]$OutputPath = "$PSScriptRoot\dist\FileInNOutDesktopSetup.exe",
  [string]$PublicOutputPath = "",
  [string]$ZipOutputPath = "$PSScriptRoot\dist\FileInNOutDesktop.zip",
  [string]$PublicZipOutputPath = "$PSScriptRoot\..\frontend\public\downloads\FileInNOutDesktop.zip",
  [string]$Version = "",
  [string]$PythonRuntimePath = "",
  [switch]$NoBundlePythonRuntime,
  [string]$CscPath = "",
  [int]$PublicZipVersionsToKeep = 4
)

$ErrorActionPreference = "Stop"

$sourceDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$packageScript = Join-Path $sourceDir "package-windows.ps1"
if (-not (Test-Path -LiteralPath $packageScript)) {
  throw "package-windows.ps1 was not found: $packageScript"
}

if (-not $Version) {
  $Version = Get-Date -Format "yyyyMMdd-HHmmss"
}

function Resolve-CSharpCompiler {
  param([string]$RequestedPath)

  if ($RequestedPath) {
    if (-not (Test-Path -LiteralPath $RequestedPath)) {
      throw "CscPath does not exist: $RequestedPath"
    }
    return (Resolve-Path -LiteralPath $RequestedPath).Path
  }

  $command = Get-Command csc.exe -ErrorAction SilentlyContinue
  if ($command) {
    return $command.Source
  }

  $candidates = @(
    "$env:WINDIR\Microsoft.NET\Framework64\v4.0.30319\csc.exe",
    "$env:WINDIR\Microsoft.NET\Framework\v4.0.30319\csc.exe"
  )
  foreach ($candidate in $candidates) {
    if (Test-Path -LiteralPath $candidate) {
      return $candidate
    }
  }

  throw "C# compiler was not found. Install .NET Framework build tools or pass -CscPath."
}

function Convert-ToCSharpStringLiteral {
  param([string]$Value)
  return '"' + $Value.Replace('\', '\\').Replace('"', '\"') + '"'
}

function Resolve-PythonRuntimePath {
  param([string]$RequestedPath)

  if ($NoBundlePythonRuntime) {
    return ""
  }
  if (-not $RequestedPath) {
    $RequestedPath = $env:FILEINNOUT_PYTHON_RUNTIME
  }
  if (-not $RequestedPath) {
    return ""
  }
  if (-not (Test-Path -LiteralPath $RequestedPath)) {
    throw "PythonRuntimePath does not exist: $RequestedPath"
  }

  $resolved = (Resolve-Path -LiteralPath $RequestedPath).Path
  if ((Get-Item -LiteralPath $resolved).PSIsContainer) {
    $pythonExe = Join-Path $resolved "python.exe"
    if (-not (Test-Path -LiteralPath $pythonExe)) {
      throw "PythonRuntimePath directory is missing python.exe: $resolved"
    }
    return $resolved
  }

  if ([System.IO.Path]::GetFileName($resolved).Equals("python.exe", [System.StringComparison]::OrdinalIgnoreCase)) {
    return Split-Path -Parent $resolved
  }

  throw "PythonRuntimePath must point to python.exe or a directory containing python.exe."
}

function New-PortablePythonRuntime {
  param(
    [string]$SourceDir,
    [string]$TargetDir
  )

  New-Item -ItemType Directory -Force -Path $TargetDir | Out-Null

  $rootFiles = @(
    "python.exe",
    "pythonw.exe",
    "python3.dll",
    "python312.dll",
    "vcruntime140.dll",
    "vcruntime140_1.dll",
    "LICENSE.txt"
  )
  foreach ($name in $rootFiles) {
    $path = Join-Path $SourceDir $name
    if (Test-Path -LiteralPath $path) {
      Copy-Item -Force -LiteralPath $path -Destination (Join-Path $TargetDir $name)
    }
  }

  foreach ($name in @("DLLs", "libs")) {
    $path = Join-Path $SourceDir $name
    if (Test-Path -LiteralPath $path) {
      Copy-Item -Recurse -Force -LiteralPath $path -Destination (Join-Path $TargetDir $name)
    }
  }

  $sourceLib = Join-Path $SourceDir "Lib"
  if (-not (Test-Path -LiteralPath $sourceLib)) {
    throw "Python runtime is missing Lib directory: $SourceDir"
  }
  $targetLib = Join-Path $TargetDir "Lib"
  Copy-Item -Recurse -Force -LiteralPath $sourceLib -Destination $targetLib

  foreach ($name in @("site-packages", "test", "tkinter", "idlelib", "ensurepip", "venv", "turtledemo", "pydoc_data", "__pycache__")) {
    Get-ChildItem -Path $targetLib -Recurse -Force -Directory -Filter $name -ErrorAction SilentlyContinue |
      ForEach-Object { Remove-Item -LiteralPath $_.FullName -Recurse -Force }
  }
  Get-ChildItem -Path $targetLib -Recurse -Force -Directory -Filter "__pycache__" -ErrorAction SilentlyContinue |
    ForEach-Object { Remove-Item -LiteralPath $_.FullName -Recurse -Force }
  Get-ChildItem -Path $targetLib -Recurse -Force -File -Filter "*.pyc" -ErrorAction SilentlyContinue |
    ForEach-Object { Remove-Item -LiteralPath $_.FullName -Force }

  $targetPython = Join-Path $TargetDir "python.exe"
  if (-not (Test-Path -LiteralPath $targetPython)) {
    throw "Portable Python runtime was not created correctly: $targetPython"
  }
}

$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("FileInNOutDesktopExe-" + [System.Guid]::NewGuid().ToString("N"))
$zipOutputDir = Join-Path $tempRoot "zip"
$runtimeDir = Join-Path $tempRoot "python-runtime"
New-Item -ItemType Directory -Force -Path $zipOutputDir | Out-Null

try {
  $runtimeSource = Resolve-PythonRuntimePath $PythonRuntimePath
  $packageArgs = @(
    "-ExecutionPolicy", "Bypass",
    "-File", $packageScript,
    "-OutputDir", $zipOutputDir,
    "-Version", $Version
  )
  if ($runtimeSource) {
    New-PortablePythonRuntime -SourceDir $runtimeSource -TargetDir $runtimeDir
    $packageArgs += @("-PythonRuntimeDir", $runtimeDir)
  }

  & powershell @packageArgs
  if ($LASTEXITCODE -ne 0) {
    throw "package-windows.ps1 failed with exit code $LASTEXITCODE"
  }

  $zipPath = Join-Path $zipOutputDir "FileInNOutDesktop-$Version.zip"
  if (-not (Test-Path -LiteralPath $zipPath)) {
    throw "Package zip was not created: $zipPath"
  }

  if ($ZipOutputPath) {
    $targetZipDir = Split-Path -Parent $ZipOutputPath
    if ($targetZipDir) {
      New-Item -ItemType Directory -Force -Path $targetZipDir | Out-Null
    }
    Copy-Item -Force -LiteralPath $zipPath -Destination $ZipOutputPath
    Write-Host "Copied zip package: $ZipOutputPath"
  }

  $versionLiteral = Convert-ToCSharpStringLiteral $Version

  $sourcePath = Join-Path $tempRoot "FileInNOutDesktopSetup.cs"
  $source = @"
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
        private static readonly string Version = $versionLiteral;
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

                return RunInstaller(tempRoot, args, false, false, false, null);
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

        internal static int RunInstaller(string tempRoot, string[] args, bool createDesktopShortcut, bool interactiveDefaults, bool enableExplorerCloudIntegration, Action<int, string> progress)
        {
            string installer = Path.Combine(tempRoot, "install-windows.ps1");
            string forwarded = BuildForwardedArguments(args, createDesktopShortcut, interactiveDefaults);
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
                "FileInNOutDesktop.exe",
                "FileInNOutDesktop.ico",
                "FileInNOutDesktopTray.cs",
                "install-windows.ps1",
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
            Console.WriteLine("  FileInNOutDesktopSetup.exe -Configure -Server http://192.168.35.151/api -Email admin@fileinnout.local");
            Console.WriteLine("  FileInNOutDesktopSetup.exe --verify");
        }

        private static string BuildForwardedArguments(string[] args, bool createDesktopShortcut, bool interactiveDefaults)
        {
            string result = "";
            if (interactiveDefaults)
            {
                result = AddArg(result, "-InstallStartupTask");
                result = AddArg(result, "-StartNow");
            }
            if (createDesktopShortcut)
            {
                result = AddArg(result, "-CreateDesktopShortcut");
            }
            foreach (string arg in args)
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

    internal sealed class SetupForm : Form
    {
        private readonly string tempRoot;
        private readonly ProgressBar progressBar;
        private readonly Label statusLabel;
        private readonly CheckBox desktopShortcutCheck;
        private readonly CheckBox explorerCloudIntegrationCheck;
        private readonly Button installButton;
        private readonly Button closeButton;
        private readonly TextBox logBox;
        private int exitCode = 1;

        public int ExitCode { get { return exitCode; } }

        public SetupForm(string tempRoot)
        {
            this.tempRoot = tempRoot;
            Text = "FileInNOut Desktop Setup";
            Width = 520;
            Height = 374;
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = false;
            StartPosition = FormStartPosition.CenterScreen;

            TableLayoutPanel layout = new TableLayoutPanel();
            layout.Dock = DockStyle.Fill;
            layout.Padding = new Padding(18);
            layout.ColumnCount = 1;
            layout.RowCount = 7;
            layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 42));
            layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 32));
            layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 34));
            layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 34));
            layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 34));
            layout.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
            layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 42));

            Label title = new Label();
            title.Text = "Install FileInNOut Desktop";
            title.Font = new Font(Font.FontFamily, 14, FontStyle.Bold);
            title.Dock = DockStyle.Fill;
            title.TextAlign = ContentAlignment.MiddleLeft;
            layout.Controls.Add(title, 0, 0);

            statusLabel = new Label();
            statusLabel.Text = "Ready to install.";
            statusLabel.Dock = DockStyle.Fill;
            statusLabel.TextAlign = ContentAlignment.MiddleLeft;
            layout.Controls.Add(statusLabel, 0, 1);

            progressBar = new ProgressBar();
            progressBar.Dock = DockStyle.Fill;
            progressBar.Minimum = 0;
            progressBar.Maximum = 100;
            layout.Controls.Add(progressBar, 0, 2);

            desktopShortcutCheck = new CheckBox();
            desktopShortcutCheck.Text = "Create a desktop shortcut";
            desktopShortcutCheck.Checked = true;
            desktopShortcutCheck.Dock = DockStyle.Fill;
            layout.Controls.Add(desktopShortcutCheck, 0, 3);

            explorerCloudIntegrationCheck = new CheckBox();
            explorerCloudIntegrationCheck.Text = "Enable Explorer cloud integration (administrator approval)";
            explorerCloudIntegrationCheck.Checked = true;
            explorerCloudIntegrationCheck.Dock = DockStyle.Fill;
            layout.Controls.Add(explorerCloudIntegrationCheck, 0, 4);

            logBox = new TextBox();
            logBox.Multiline = true;
            logBox.ReadOnly = true;
            logBox.ScrollBars = ScrollBars.Vertical;
            logBox.Dock = DockStyle.Fill;
            layout.Controls.Add(logBox, 0, 5);

            FlowLayoutPanel buttons = new FlowLayoutPanel();
            buttons.FlowDirection = FlowDirection.RightToLeft;
            buttons.Dock = DockStyle.Fill;
            installButton = new Button();
            installButton.Text = "Install";
            installButton.Width = 90;
            installButton.Click += delegate { Install(); };
            closeButton = new Button();
            closeButton.Text = "Cancel";
            closeButton.Width = 90;
            closeButton.Click += delegate { Close(); };
            buttons.Controls.Add(closeButton);
            buttons.Controls.Add(installButton);
            layout.Controls.Add(buttons, 0, 6);

            Controls.Add(layout);
        }

        private void Install()
        {
            bool createShortcut = desktopShortcutCheck.Checked;
            bool enableExplorerCloudIntegration = explorerCloudIntegrationCheck.Checked;
            installButton.Enabled = false;
            closeButton.Enabled = false;
            desktopShortcutCheck.Enabled = false;
            explorerCloudIntegrationCheck.Enabled = false;
            progressBar.Value = 10;
            statusLabel.Text = "Preparing installer...";

            ThreadPool.QueueUserWorkItem(delegate
            {
                int result = Program.RunInstaller(
                    tempRoot,
                    new string[0],
                    createShortcut,
                    true,
                    enableExplorerCloudIntegration,
                    delegate(int percent, string message) { UpdateProgress(percent, message); });

                BeginInvoke(new MethodInvoker(delegate
                {
                    exitCode = result;
                    progressBar.Value = result == 0 ? 100 : 90;
                    statusLabel.Text = result == 0 ? "Installation complete. FileInNOut Desktop is running in the tray." : "Installation failed.";
                    closeButton.Text = "Finish";
                    closeButton.Enabled = true;
                    installButton.Enabled = result != 0;
                    desktopShortcutCheck.Enabled = result != 0;
                    explorerCloudIntegrationCheck.Enabled = result != 0;
                }));
            });
        }

        private void UpdateProgress(int percent, string message)
        {
            BeginInvoke(new MethodInvoker(delegate
            {
                progressBar.Value = Math.Max(progressBar.Minimum, Math.Min(progressBar.Maximum, percent));
                if (!String.IsNullOrWhiteSpace(message))
                {
                    if (message.Length < 180)
                    {
                        statusLabel.Text = message.Trim();
                    }
                    logBox.AppendText(message.Trim() + Environment.NewLine);
                }
            }));
        }
    }
}
"@

  Set-Content -Encoding ASCII -Path $sourcePath -Value $source

  $resolvedOutputPath = [System.IO.Path]::GetFullPath($OutputPath)
  $outputDir = Split-Path -Parent $resolvedOutputPath
  New-Item -ItemType Directory -Force -Path $outputDir | Out-Null
  if (Test-Path -LiteralPath $resolvedOutputPath) {
    Remove-Item -LiteralPath $resolvedOutputPath -Force
  }

  $csc = Resolve-CSharpCompiler $CscPath
  $frameworkDir = Split-Path -Parent $csc
  $compression = Join-Path $frameworkDir "System.IO.Compression.dll"
  $compressionFs = Join-Path $frameworkDir "System.IO.Compression.FileSystem.dll"
  $references = @()
  if (Test-Path -LiteralPath $compression) {
    $references += "/reference:$compression"
  }
  if (Test-Path -LiteralPath $compressionFs) {
    $references += "/reference:$compressionFs"
  }
  $references += "/reference:System.Windows.Forms.dll"
  $references += "/reference:System.Drawing.dll"

  & $csc /nologo /target:exe /out:$resolvedOutputPath $references "/resource:$zipPath,FileInNOutDesktopPayload" $sourcePath
  if ($LASTEXITCODE -ne 0) {
    throw "csc.exe failed with exit code $LASTEXITCODE"
  }

  if ($PublicOutputPath) {
    $resolvedPublicPath = [System.IO.Path]::GetFullPath($PublicOutputPath)
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $resolvedPublicPath) | Out-Null
    Copy-Item -Force -LiteralPath $resolvedOutputPath -Destination $resolvedPublicPath
    Write-Host "Copied public installer: $resolvedPublicPath"
  } elseif ($PublicZipOutputPath) {
    $resolvedPublicZipPath = [System.IO.Path]::GetFullPath($PublicZipOutputPath)
    $publicZipDir = Split-Path -Parent $resolvedPublicZipPath
    New-Item -ItemType Directory -Force -Path $publicZipDir | Out-Null

    $legacyPublicExe = Join-Path $publicZipDir "FileInNOutDesktopSetup.exe"
    if (Test-Path -LiteralPath $legacyPublicExe) {
      Remove-Item -LiteralPath $legacyPublicExe -Force
      Write-Host "Removed legacy public installer: $legacyPublicExe"
    }

    $publicZipStage = Join-Path $tempRoot "public-zip"
    New-Item -ItemType Directory -Force -Path $publicZipStage | Out-Null
    Copy-Item -Force -LiteralPath $resolvedOutputPath -Destination (Join-Path $publicZipStage "FileInNOutDesktopSetup.exe")
    @(
      "FileInNOut Desktop",
      "",
      "1. Extract this ZIP file.",
      "2. Run FileInNOutDesktopSetup.exe.",
      "3. After installation, open FileInNOut Desktop from the tray or Start Menu."
    ) | Set-Content -Encoding ASCII -Path (Join-Path $publicZipStage "README.txt")

    if (Test-Path -LiteralPath $resolvedPublicZipPath) {
      Remove-Item -LiteralPath $resolvedPublicZipPath -Force
    }
    Compress-Archive -Path (Join-Path $publicZipStage "*") -DestinationPath $resolvedPublicZipPath -Force
    Write-Host "Created public installer zip: $resolvedPublicZipPath"

    $safeVersion = $Version -replace '[^A-Za-z0-9._-]', '-'
    if ($safeVersion) {
      $versionedPublicZipPath = Join-Path $publicZipDir ("FileInNOutDesktop-{0}.zip" -f $safeVersion)
      if (-not $versionedPublicZipPath.Equals($resolvedPublicZipPath, [System.StringComparison]::OrdinalIgnoreCase)) {
        if (Test-Path -LiteralPath $versionedPublicZipPath) {
          Remove-Item -LiteralPath $versionedPublicZipPath -Force
        }
        Copy-Item -Force -LiteralPath $resolvedPublicZipPath -Destination $versionedPublicZipPath
        Write-Host "Created versioned public installer zip: $versionedPublicZipPath"
      }
    }

    if ($PublicZipVersionsToKeep -gt 0) {
      $versionedPackages = Get-ChildItem -Path $publicZipDir -Filter "FileInNOutDesktop-*.zip" -File -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending
      $currentVersionedPath = if ($safeVersion) { [System.IO.Path]::GetFullPath((Join-Path $publicZipDir ("FileInNOutDesktop-{0}.zip" -f $safeVersion))) } else { "" }
      $kept = 0
      foreach ($package in $versionedPackages) {
        $packagePath = [System.IO.Path]::GetFullPath($package.FullName)
        if ($currentVersionedPath -and $packagePath.Equals($currentVersionedPath, [System.StringComparison]::OrdinalIgnoreCase)) {
          $kept++
          continue
        }
        if ($kept -lt $PublicZipVersionsToKeep) {
          $kept++
          continue
        }
        Remove-Item -LiteralPath $package.FullName -Force
        Write-Host "Removed old public installer zip: $($package.FullName)"
      }
    }
  }

  Write-Host "Created setup exe: $resolvedOutputPath"
} finally {
  if (Test-Path -LiteralPath $tempRoot) {
    Remove-Item -LiteralPath $tempRoot -Recurse -Force
  }
}
