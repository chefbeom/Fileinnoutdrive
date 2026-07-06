using System;
using System.IO;
using Microsoft.Win32;

namespace FileInNOutDesktop
{
    internal static class DesktopDriveMapping
    {
        public static string Ensure(string driveLetter, string targetFolder, string installDir)
        {
            string letter = DesktopPathRules.NormalizeDriveLetter(driveLetter);
            if (String.IsNullOrWhiteSpace(letter) || String.IsNullOrWhiteSpace(targetFolder))
            {
                return "";
            }

            try
            {
                Directory.CreateDirectory(targetFolder);
                string target = Path.GetFullPath(targetFolder);
                foreach (string candidate in DesktopPathRules.DriveLetterCandidates(letter))
                {
                    string driveName = candidate + ":";
                    string driveRoot = driveName + "\\";
                    string currentTarget = CurrentSubstTarget(candidate, installDir);

                    if (!String.IsNullOrWhiteSpace(currentTarget))
                    {
                        string resolvedCurrent = DesktopPathRules.ResolvePathIfPossible(currentTarget);
                        if (DesktopPathRules.SamePath(resolvedCurrent, target))
                        {
                            return candidate;
                        }
                        if (!DesktopPathRules.IsFileInNOutExplorerFolder(resolvedCurrent))
                        {
                            continue;
                        }
                        RunHiddenProcess("cmd.exe", "/d /c subst " + driveName + " /D", installDir);
                    }
                    else if (Directory.Exists(driveRoot))
                    {
                        continue;
                    }

                    RunHiddenProcess("cmd.exe", "/d /c subst " + driveName + " " + DesktopProcessRunner.Quote(target), installDir);
                    string mappedTarget = CurrentSubstTarget(candidate, installDir);
                    if (!String.IsNullOrWhiteSpace(mappedTarget) && DesktopPathRules.SamePath(DesktopPathRules.ResolvePathIfPossible(mappedTarget), target))
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

        public static void RegisterAppearance(string driveLetter, string installDir)
        {
            string letter = DesktopPathRules.NormalizeDriveLetter(driveLetter);
            if (String.IsNullOrWhiteSpace(letter))
            {
                return;
            }

            try
            {
                string iconPath = Path.Combine(installDir ?? "", "FileInNOutDesktop.ico");
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

        public static string CurrentSubstTarget(string driveLetter, string installDir)
        {
            string letter = DesktopPathRules.NormalizeDriveLetter(driveLetter);
            if (String.IsNullOrWhiteSpace(letter))
            {
                return "";
            }

            CommandResult result = RunHiddenProcess("cmd.exe", "/d /c subst", installDir);
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

        private static CommandResult RunHiddenProcess(string fileName, string arguments, string installDir)
        {
            return DesktopProcessRunner.RunHidden(fileName, arguments, installDir ?? "");
        }
    }
}