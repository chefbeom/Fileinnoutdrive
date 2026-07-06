using System;
using System.Collections.Generic;
using System.IO;
using System.Text;

namespace FileInNOutDesktop
{
    internal static class DesktopExplorerBranding
    {
        public static void Apply(string folderPath, string installDir, string displayName, string infoTip, string defaultInfoTip)
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
                lines.Add("LocalizedResourceName=" + DesktopExplorerText.SafeDesktopIniValue(displayName, "FileInNOut"));
                lines.Add("InfoTip=" + DesktopExplorerText.SafeDesktopIniValue(infoTip, defaultInfoTip));
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

        public static void Clear(string folderPath)
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
    }
}
