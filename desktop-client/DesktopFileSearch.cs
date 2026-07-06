using System;
using System.Collections.Generic;
using System.IO;

namespace FileInNOutDesktop
{
    internal static class DesktopFileSearch
    {
        public static IEnumerable<string> EnumerateSearchablePaths(string root)
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

        public static string FormatByteCount(long bytes)
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

        public static DateTime ParseDateTimeOrMin(string value)
        {
            DateTime parsed;
            return DateTime.TryParse(value, out parsed) ? parsed : DateTime.MinValue;
        }

        public static DateTime UnixTimeToLocal(long seconds)
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

        public static string TrimText(string text, int maxLength)
        {
            string value = (text ?? "").Trim();
            if (value.Length <= maxLength)
            {
                return value;
            }
            return value.Substring(0, Math.Max(0, maxLength - 3)) + "...";
        }

        public static string MakeRelative(string root, string path)
        {
            string fullRoot = Path.GetFullPath(root).TrimEnd('\\') + "\\";
            string fullPath = Path.GetFullPath(path);
            if (fullPath.StartsWith(fullRoot, StringComparison.OrdinalIgnoreCase))
            {
                return fullPath.Substring(fullRoot.Length);
            }
            return fullPath;
        }
    }
}
