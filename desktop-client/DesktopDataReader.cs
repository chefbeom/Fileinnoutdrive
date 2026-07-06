using System;
using System.Collections;
using System.Collections.Generic;

namespace FileInNOutDesktop
{
    internal static class DesktopDataReader
    {
        public static Dictionary<string, object> ReadDictionary(Dictionary<string, object> data, string key)
        {
            object value;
            if (data == null || !data.TryGetValue(key, out value) || value == null)
            {
                return new Dictionary<string, object>();
            }
            Dictionary<string, object> dictionary = value as Dictionary<string, object>;
            return dictionary ?? new Dictionary<string, object>();
        }

        public static IEnumerable ReadEnumerable(Dictionary<string, object> data, string key)
        {
            object value;
            if (data == null || !data.TryGetValue(key, out value) || value == null || value is string)
            {
                return new object[0];
            }
            IEnumerable enumerable = value as IEnumerable;
            return enumerable ?? new object[0];
        }

        public static string ReadString(Dictionary<string, object> data, string key)
        {
            object value;
            if (data == null || !data.TryGetValue(key, out value) || value == null)
            {
                return "";
            }
            return Convert.ToString(value);
        }

        public static int ReadInt(Dictionary<string, object> data, string key)
        {
            object value;
            if (data == null || !data.TryGetValue(key, out value) || value == null)
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

        public static long ReadLong(Dictionary<string, object> data, string key)
        {
            object value;
            if (data == null || !data.TryGetValue(key, out value) || value == null)
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

        public static Dictionary<string, string> ParseKeyValueOutput(string output)
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

        public static string GetValue(Dictionary<string, string> values, string key)
        {
            string value;
            return values != null && values.TryGetValue(key, out value) ? value : "";
        }

        public static long ParseLong(string value)
        {
            long parsed;
            return long.TryParse(value, out parsed) ? parsed : 0;
        }

        public static StorageSummary ParseStorageSummary(int exitCode, string output)
        {
            StorageSummary summary = new StorageSummary();
            summary.Available = exitCode == 0;
            summary.RawOutput = output ?? "";

            Dictionary<string, string> values = ParseKeyValueOutput(output);
            summary.PlanLabel = GetValue(values, "planLabel");
            summary.UsedBytes = ParseLong(GetValue(values, "usedBytes"));
            summary.QuotaBytes = ParseLong(GetValue(values, "quotaBytes"));
            summary.RemainingBytes = ParseLong(GetValue(values, "remainingBytes"));
            summary.UsagePercent = (int)ParseLong(GetValue(values, "usagePercent"));
            summary.FileCount = (int)ParseLong(GetValue(values, "activeFileCount"));
            summary.FolderCount = (int)ParseLong(GetValue(values, "activeFolderCount"));
            return summary;
        }

        public static List<PendingShareItem> ParsePendingShares(string output)
        {
            List<PendingShareItem> items = new List<PendingShareItem>();
            foreach (string rawLine in (output ?? "").Split(new[] { "\r\n", "\n" }, StringSplitOptions.RemoveEmptyEntries))
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
    }
}
