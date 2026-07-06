using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;

namespace FileInNOutDesktop
{
    internal sealed class DesktopSearchService
    {
        private readonly Func<DesktopConfig> loadConfig;
        private readonly Func<string, CommandResult> runCommand;

        public DesktopSearchService(Func<DesktopConfig> loadConfig, Func<string, CommandResult> runCommand)
        {
            this.loadConfig = loadConfig;
            this.runCommand = runCommand;
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

        public List<SearchResultItem> SearchLocalFiles(string query)
        {
            List<SearchResultItem> items = new List<SearchResultItem>();
            string[] terms = SearchTerms(query);
            if (terms.Length == 0)
            {
                return items;
            }

            DesktopConfig config = loadConfig();
            foreach (SyncFolderConfig folder in config.SyncFolders)
            {
                if (!FolderCanBeSearched(folder))
                {
                    continue;
                }

                string folderName = String.IsNullOrWhiteSpace(folder.Name) ? folder.RemotePath : folder.Name;
                foreach (string path in DesktopFileSearch.EnumerateSearchablePaths(folder.LocalPath))
                {
                    string relative = DesktopFileSearch.MakeRelative(folder.LocalPath, path);
                    string searchable = (relative + " " + Path.GetFileName(path)).ToLowerInvariant();
                    if (!terms.All(term => searchable.Contains(term)))
                    {
                        continue;
                    }

                    TryAddLocalSearchResult(items, folderName, folder.LocalPath, path, relative);
                    if (items.Count >= 500)
                    {
                        break;
                    }
                }
            }

            return items.OrderByDescending(x => x.UpdatedAt).Take(200).ToList();
        }

        public List<SearchResultItem> SearchCloudFiles(string query)
        {
            List<SearchResultItem> items = new List<SearchResultItem>();
            string[] terms = SearchTerms(query);
            if (terms.Length == 0)
            {
                return items;
            }

            DesktopConfig config = loadConfig();
            if (String.IsNullOrWhiteSpace(config.RefreshToken) && String.IsNullOrWhiteSpace(config.Token))
            {
                return items;
            }

            CommandResult result = runCommand("search --query " + DesktopProcessRunner.Quote(query) + " --limit 100");
            if (result.ExitCode != 0)
            {
                return items;
            }

            foreach (string line in (result.Output ?? "").Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries))
            {
                SearchResultItem item = ParseCloudSearchResult(line);
                if (item != null)
                {
                    items.Add(item);
                }
            }

            return items;
        }

        private static string[] SearchTerms(string query)
        {
            return (query ?? "")
                .Split(new[] { ' ', '\t', '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries)
                .Select(x => x.Trim().ToLowerInvariant())
                .Where(x => x.Length > 0)
                .ToArray();
        }

        private static bool FolderCanBeSearched(SyncFolderConfig folder)
        {
            return folder != null
                && folder.Enabled
                && !String.IsNullOrWhiteSpace(folder.LocalPath)
                && Directory.Exists(folder.LocalPath);
        }

        private static void TryAddLocalSearchResult(
            List<SearchResultItem> items,
            string folderName,
            string root,
            string path,
            string relative)
        {
            try
            {
                FileAttributes attributes = File.GetAttributes(path);
                bool directory = (attributes & FileAttributes.Directory) != 0;
                long bytes = directory ? 0 : new FileInfo(path).Length;
                DateTime updated = directory ? Directory.GetLastWriteTime(path) : File.GetLastWriteTime(path);
                string detail = directory ? "폴더" : DesktopFileSearch.FormatByteCount(bytes);
                items.Add(new SearchResultItem("[" + folderName + "] " + relative, detail, updated, path));
            }
            catch
            {
            }
        }

        private static SearchResultItem ParseCloudSearchResult(string line)
        {
            string[] columns = line.Split('\t');
            if (columns.Length < 6 || !String.Equals(columns[0], "cloud", StringComparison.OrdinalIgnoreCase))
            {
                return null;
            }

            string cloudPath = columns[1];
            string type = columns[2].Trim().ToUpperInvariant();
            long bytes = DesktopDataReader.ParseLong(columns[3]);
            DateTime updated = DesktopFileSearch.ParseDateTimeOrMin(columns[4]);
            string webUrl = columns[5];
            string detail = String.Equals(type, "FOLDER", StringComparison.OrdinalIgnoreCase)
                ? "클라우드 폴더"
                : "클라우드 " + DesktopFileSearch.FormatByteCount(bytes);
            return new SearchResultItem("[클라우드] " + cloudPath, detail, updated, "", webUrl);
        }
    }
}
