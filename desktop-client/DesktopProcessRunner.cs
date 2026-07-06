using System;
using System.Diagnostics;
using System.IO;

namespace FileInNOutDesktop
{
    internal static class DesktopProcessRunner
    {
        public static CommandResult RunHidden(string fileName, string arguments)
        {
            return RunHidden(fileName, arguments, "");
        }

        public static CommandResult RunHidden(string fileName, string arguments, string workingDirectory)
        {
            ProcessStartInfo info = new ProcessStartInfo();
            info.FileName = fileName;
            info.Arguments = arguments;
            if (!String.IsNullOrWhiteSpace(workingDirectory))
            {
                info.WorkingDirectory = workingDirectory;
            }
            info.UseShellExecute = false;
            info.RedirectStandardOutput = true;
            info.RedirectStandardError = true;
            info.CreateNoWindow = true;

            using (Process process = Process.Start(info))
            {
                if (process == null)
                {
                    return new CommandResult(1, "Failed to start command process.");
                }
                string output = process.StandardOutput.ReadToEnd();
                string error = process.StandardError.ReadToEnd();
                process.WaitForExit();
                return new CommandResult(process.ExitCode, (output + Environment.NewLine + error).Trim());
            }
        }

        public static CommandResult RunDesktopCommand(
            string installDir,
            string commandPath,
            string bundledPythonPath,
            string clientScriptPath,
            string arguments,
            string standardInput)
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
                info.Arguments = Quote(clientScriptPath) + " " + (arguments ?? "");
            }
            else
            {
                info.FileName = "cmd.exe";
                info.Arguments = "/d /s /c " + Quote(Quote(commandPath) + " " + (arguments ?? ""));
            }
            info.WorkingDirectory = installDir;
            info.UseShellExecute = false;
            info.RedirectStandardOutput = true;
            info.RedirectStandardError = true;
            info.RedirectStandardInput = standardInput != null;
            info.CreateNoWindow = true;

            using (Process process = Process.Start(info))
            {
                if (process == null)
                {
                    return new CommandResult(1, "Failed to start command process.");
                }
                if (standardInput != null)
                {
                    process.StandardInput.Write(standardInput);
                    process.StandardInput.Close();
                }
                string output = process.StandardOutput.ReadToEnd();
                string error = process.StandardError.ReadToEnd();
                process.WaitForExit();
                return new CommandResult(process.ExitCode, (output + Environment.NewLine + error).Trim());
            }
        }

        public static string ResolvePathIfPossible(string path)
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

        public static string Quote(string value)
        {
            return "\"" + (value ?? "").Replace("\"", "\\\"") + "\"";
        }
    }
}
