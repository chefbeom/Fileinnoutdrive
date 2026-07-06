using System;
using System.Collections.Generic;
using System.IO;
using System.Text.RegularExpressions;

namespace FileInNOutDesktop
{
    internal static class DesktopPathRules
    {
        public static string NormalizeDriveLetter(string value)
        {
            string text = (value ?? "").Trim().TrimEnd(':').ToUpperInvariant();
            return Regex.IsMatch(text, "^[A-Z]$") ? text : "";
        }

        public static IEnumerable<string> DriveLetterCandidates(string preferredLetter)
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

        public static bool SamePath(string left, string right)
        {
            try
            {
                return String.Equals(
                    Path.GetFullPath(left ?? "").TrimEnd('\\', '/'),
                    Path.GetFullPath(right ?? "").TrimEnd('\\', '/'),
                    StringComparison.OrdinalIgnoreCase);
            }
            catch
            {
                return String.Equals(
                    (left ?? "").TrimEnd('\\', '/'),
                    (right ?? "").TrimEnd('\\', '/'),
                    StringComparison.OrdinalIgnoreCase);
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

        public static bool IsFileInNOutExplorerFolder(string folderPath)
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
    }
}
