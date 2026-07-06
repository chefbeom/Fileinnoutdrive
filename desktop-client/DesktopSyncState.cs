using System;
using System.Collections;
using System.Collections.Generic;
using System.Linq;
using System.IO;
using System.Web.Script.Serialization;

namespace FileInNOutDesktop
{
    internal static class DesktopSyncState
    {
        public static List<SyncActivityItem> ListRecentSyncActivity(DesktopConfig config, bool useKoreanLabels)
        {
            List<SyncActivityItem> items = new List<SyncActivityItem>();
            if (config == null)
            {
                return items;
            }

            foreach (SyncFolderConfig folder in config.SyncFolders)
            {
                if (!folder.Enabled || String.IsNullOrWhiteSpace(folder.LocalPath) || !Directory.Exists(folder.LocalPath))
                {
                    continue;
                }

                string folderName = String.IsNullOrWhiteSpace(folder.Name) ? folder.RemotePath : folder.Name;
                Dictionary<string, object> state = LoadFolderState(folder.LocalPath);
                if (state.Count == 0)
                {
                    continue;
                }

                bool added = false;
                IEnumerable activity = DesktopDataReader.ReadEnumerable(state, "syncActivity");
                foreach (object rawActivity in activity)
                {
                    Dictionary<string, object> entry = rawActivity as Dictionary<string, object>;
                    if (entry == null)
                    {
                        continue;
                    }
                    items.Add(BuildSyncActivityItem(folderName, entry, useKoreanLabels));
                    added = true;
                }

                if (!added)
                {
                    Dictionary<string, object> syncStatus = DesktopDataReader.ReadDictionary(state, "syncStatus");
                    if (syncStatus.Count > 0)
                    {
                        items.Add(BuildSyncActivityItem(folderName, syncStatus, useKoreanLabels));
                    }
                }
            }

            return items.OrderByDescending(x => x.UpdatedAt).Take(200).ToList();
        }

        public static List<SearchResultItem> ListSyncIssues(DesktopConfig config)
        {
            List<SearchResultItem> items = new List<SearchResultItem>();
            if (config == null)
            {
                return items;
            }

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
                Dictionary<string, object> syncStatus = DesktopDataReader.ReadDictionary(state, "syncStatus");
                string status = DesktopDataReader.ReadString(syncStatus, "status").Trim().ToLowerInvariant();
                if (status == "error")
                {
                    string error = DesktopFileSearch.TrimText(DesktopDataReader.ReadString(syncStatus, "error"), 42);
                    if (String.IsNullOrWhiteSpace(error))
                    {
                        error = "\uCD5C\uADFC \uB3D9\uAE30\uD654 \uC624\uB958";
                    }
                    items.Add(new SearchResultItem(
                        "[" + folderName + "] \uB3D9\uAE30\uD654 \uC624\uB958",
                        error,
                        DesktopFileSearch.UnixTimeToLocal(DesktopDataReader.ReadLong(syncStatus, "updatedAt")),
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
                        DesktopFileSearch.UnixTimeToLocal(DesktopDataReader.ReadLong(syncStatus, "updatedAt")),
                        folder.LocalPath));
                }

                int downloadFailed = DownloadFailedCount(syncStatus);
                if (downloadFailed > 0)
                {
                    items.Add(new SearchResultItem(
                        "[" + folderName + "] \uB2E4\uC6B4\uB85C\uB4DC \uC2E4\uD328",
                        "\uC9C0\uB09C \uB3D9\uAE30\uD654\uC5D0\uC11C " + downloadFailed.ToString() + "\uAC1C \uD30C\uC77C\uC744 \uB0B4\uB824\uBC1B\uC9C0 \uBABB\uD568",
                        DesktopFileSearch.UnixTimeToLocal(DesktopDataReader.ReadLong(syncStatus, "updatedAt")),
                        folder.LocalPath));
                }

                foreach (string path in DesktopFileSearch.EnumerateSearchablePaths(folder.LocalPath))
                {
                    if (!File.Exists(path) || !IsConflictCopyPath(path))
                    {
                        continue;
                    }
                    string relative = DesktopFileSearch.MakeRelative(folder.LocalPath, path);
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

        public static SyncActivityItem BuildSyncActivityItem(string folderName, Dictionary<string, object> entry, bool useKoreanLabels)
        {
            string status = DesktopDataReader.ReadString(entry, "status").Trim().ToLowerInvariant();
            string label;
            if (status == "success")
            {
                label = useKoreanLabels ? "\uC131\uACF5" : "성공";
            }
            else if (status == "error")
            {
                label = useKoreanLabels ? "\uC2E4\uD328" : "실패";
            }
            else
            {
                label = String.IsNullOrWhiteSpace(status) ? (useKoreanLabels ? "\uC0C1\uD0DC \uC5C6\uC74C" : "상태 없음") : status;
            }

            string defaultFolderName = useKoreanLabels ? "\uB3D9\uAE30\uD654 \uD3F4\uB354" : "동기화 폴더";
            string title = "[" + (String.IsNullOrWhiteSpace(folderName) ? defaultFolderName : folderName) + "] " + label;
            string detail = BuildSyncActivityDetail(entry, useKoreanLabels);
            DateTime updatedAt = DesktopFileSearch.UnixTimeToLocal(DesktopDataReader.ReadLong(entry, "updatedAt"));
            return new SyncActivityItem(title, detail, updatedAt);
        }

        private static string BuildSyncActivityDetail(Dictionary<string, object> entry, bool useKoreanLabels)
        {
            string error = DesktopDataReader.ReadString(entry, "error");
            if (!String.IsNullOrWhiteSpace(error))
            {
                return DesktopFileSearch.TrimText(error, 42);
            }

            Dictionary<string, object> push = DesktopDataReader.ReadDictionary(entry, "push");
            Dictionary<string, object> pull = DesktopDataReader.ReadDictionary(entry, "pull");
            int pushed = DesktopDataReader.ReadInt(push, "pushed");
            int pulled = DesktopDataReader.ReadInt(pull, "pulled");
            int deleted = DesktopDataReader.ReadInt(push, "deleted") + DesktopDataReader.ReadInt(pull, "deleted");
            int folders = DesktopDataReader.ReadInt(push, "foldersCreated") + DesktopDataReader.ReadInt(pull, "foldersCreated");
            int skipped = DesktopDataReader.ReadInt(push, "skippedDirty") + DesktopDataReader.ReadInt(pull, "skippedDirty");
            int downloadFailed = DesktopDataReader.ReadInt(push, "downloadFailed") + DesktopDataReader.ReadInt(pull, "downloadFailed");
            int conflicts = ConflictCount(entry);

            List<string> parts = new List<string>();
            if (useKoreanLabels)
            {
                if (pushed > 0) { parts.Add("\uC5C5\uB85C\uB4DC " + pushed); }
                if (pulled > 0) { parts.Add("\uB2E4\uC6B4\uB85C\uB4DC " + pulled); }
                if (deleted > 0) { parts.Add("\uC0AD\uC81C " + deleted); }
                if (folders > 0) { parts.Add("\uD3F4\uB354 " + folders); }
                if (downloadFailed > 0) { parts.Add("\uB2E4\uC6B4\uB85C\uB4DC \uC2E4\uD328 " + downloadFailed); }
                if (conflicts > 0) { parts.Add("\uCDA9\uB3CC " + conflicts); }
                else if (skipped > 0) { parts.Add("\uBCF4\uD638 " + skipped); }
                return parts.Count == 0 ? "\uBCC0\uACBD \uC5C6\uC74C" : String.Join(", ", parts.ToArray());
            }

            if (downloadFailed > 0) { parts.Add("download failed " + downloadFailed); }
            if (pushed > 0) { parts.Add("업로드 " + pushed); }
            if (pulled > 0) { parts.Add("다운로드 " + pulled); }
            if (deleted > 0) { parts.Add("삭제 " + deleted); }
            if (folders > 0) { parts.Add("폴더 " + folders); }
            if (skipped > 0) { parts.Add("건너뜀 " + skipped); }
            return parts.Count == 0 ? "변경 없음" : String.Join(", ", parts.ToArray());
        }
        public static string FolderStatusLabel(SyncFolderConfig folder)
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

            Dictionary<string, object> syncStatus = DesktopDataReader.ReadDictionary(state, "syncStatus");
            string status = DesktopDataReader.ReadString(syncStatus, "status").Trim().ToLowerInvariant();
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

        public static string FolderPermissionLabel(SyncFolderConfig folder)
        {
            if (folder == null)
            {
                return "";
            }

            string remotePath = DesktopSyncText.NormalizeRemotePath(folder.RemotePath, folder.LocalPath);
            if (!IsSharedRemotePath(remotePath))
            {
                return "\uB0B4 \uB4DC\uB77C\uC774\uBE0C";
            }

            string permission = FolderPermission(folder);
            if (String.IsNullOrWhiteSpace(permission))
            {
                return "\uAD8C\uD55C \uD655\uC778 \uC804";
            }
            return DesktopSyncText.PermissionLabel(permission);
        }

        public static int SkippedDirtyCount(Dictionary<string, object> syncStatus)
        {
            Dictionary<string, object> push = DesktopDataReader.ReadDictionary(syncStatus, "push");
            Dictionary<string, object> pull = DesktopDataReader.ReadDictionary(syncStatus, "pull");
            return DesktopDataReader.ReadInt(push, "skippedDirty") + DesktopDataReader.ReadInt(pull, "skippedDirty");
        }

        public static int ConflictCount(Dictionary<string, object> syncStatus)
        {
            Dictionary<string, object> push = DesktopDataReader.ReadDictionary(syncStatus, "push");
            Dictionary<string, object> pull = DesktopDataReader.ReadDictionary(syncStatus, "pull");
            return ConflictListCount(push) + ConflictListCount(pull);
        }

        public static int ConflictListCount(Dictionary<string, object> stats)
        {
            int count = 0;
            foreach (object ignored in DesktopDataReader.ReadEnumerable(stats, "conflicts"))
            {
                count += 1;
            }
            return count;
        }

        public static int DownloadFailedCount(Dictionary<string, object> syncStatus)
        {
            Dictionary<string, object> push = DesktopDataReader.ReadDictionary(syncStatus, "push");
            Dictionary<string, object> pull = DesktopDataReader.ReadDictionary(syncStatus, "pull");
            return DesktopDataReader.ReadInt(push, "downloadFailed") + DesktopDataReader.ReadInt(pull, "downloadFailed");
        }

        public static bool IsConflictCopyPath(string path)
        {
            string name = Path.GetFileNameWithoutExtension(path) ?? "";
            return name.IndexOf(" (conflict ", StringComparison.OrdinalIgnoreCase) >= 0;
        }

        public static Dictionary<string, object> LoadFolderState(string localPath)
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

        public static bool IsSharedRemotePath(string remotePath)
        {
            string normalized = (remotePath ?? "").Trim().Replace('\\', '/').Trim('/');
            return normalized.StartsWith("Shared/", StringComparison.OrdinalIgnoreCase);
        }

        private static string FolderPermission(SyncFolderConfig folder)
        {
            if (folder == null)
            {
                return "";
            }

            string configured = DesktopSyncText.NormalizePermission(folder.Permission);
            if (!String.IsNullOrWhiteSpace(configured))
            {
                return configured;
            }

            if (String.IsNullOrWhiteSpace(folder.LocalPath) || !Directory.Exists(folder.LocalPath))
            {
                return "";
            }

            Dictionary<string, object> state = LoadFolderState(folder.LocalPath);
            Dictionary<string, object> remote = DesktopDataReader.ReadDictionary(state, "remote");
            foreach (object rawItem in remote.Values)
            {
                Dictionary<string, object> item = rawItem as Dictionary<string, object>;
                if (item == null)
                {
                    continue;
                }
                string permission = DesktopSyncText.NormalizePermission(DesktopDataReader.ReadString(item, "permission"));
                if (!String.IsNullOrWhiteSpace(permission))
                {
                    return permission;
                }
            }
            return "";
        }

        private static int CountPendingLocalChanges(string localPath, Dictionary<string, object> state)
        {
            Dictionary<string, object> previousFiles = DesktopDataReader.ReadDictionary(state, "local");
            HashSet<string> previousFolders = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (object rawFolder in DesktopDataReader.ReadEnumerable(state, "localFolders"))
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
            foreach (string path in DesktopFileSearch.EnumerateSearchablePaths(localPath))
            {
                string rel = NormalizeStateRel(DesktopFileSearch.MakeRelative(localPath, path));
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
                if (info.Length != DesktopDataReader.ReadLong(previous, "size"))
                {
                    return false;
                }
                if (previous.ContainsKey("mtimeMs"))
                {
                    return FileMtimeMilliseconds(path) == DesktopDataReader.ReadLong(previous, "mtimeMs");
                }
                return FileMtimeSeconds(path) == DesktopDataReader.ReadLong(previous, "mtime");
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
    }
}
