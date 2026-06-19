using System;
using System.Collections.Generic;

namespace FileInNOutDesktop
{
    internal sealed class DesktopConfig
    {
        public string Server = "";
        public string Email = "";
        public string Token = "";
        public string RefreshToken = "";
        public string SyncDir = "";
        public string DriveLetter = "G";
        public List<SyncFolderConfig> SyncFolders = new List<SyncFolderConfig>();
    }

    internal sealed class SyncFolderConfig
    {
        public string Name = "";
        public string LocalPath = "";
        public string RemotePath = "";
        public string Direction = "two-way";
        public string Permission = "";
        public bool Enabled = true;
    }

    internal sealed class StorageSummary
    {
        public bool Available;
        public string RawOutput = "";
        public string PlanLabel = "";
        public long UsedBytes;
        public long QuotaBytes;
        public long RemainingBytes;
        public int UsagePercent;
        public int FileCount;
        public int FolderCount;
    }

    internal sealed class CommandResult
    {
        public readonly int ExitCode;
        public readonly string Output;

        public CommandResult(int exitCode, string output)
        {
            ExitCode = exitCode;
            Output = output ?? "";
        }
    }

    internal sealed class SyncActivityItem
    {
        public readonly string Title;
        public readonly string Detail;
        public readonly DateTime UpdatedAt;

        public SyncActivityItem(string title, string detail, DateTime updatedAt)
        {
            Title = title;
            Detail = detail;
            UpdatedAt = updatedAt;
        }
    }

    internal sealed class SearchResultItem
    {
        public readonly string Title;
        public readonly string Detail;
        public readonly DateTime UpdatedAt;
        public readonly string LocalPath;
        public readonly string WebUrl;

        public SearchResultItem(string title, string detail, DateTime updatedAt, string localPath)
            : this(title, detail, updatedAt, localPath, "")
        {
        }

        public SearchResultItem(string title, string detail, DateTime updatedAt, string localPath, string webUrl)
        {
            Title = title;
            Detail = detail;
            UpdatedAt = updatedAt;
            LocalPath = localPath;
            WebUrl = webUrl;
        }
    }

    internal sealed class PendingShareItem
    {
        public readonly int Id;
        public readonly string Path;
        public readonly string Owner;
        public readonly string Permission;

        public PendingShareItem(int id, string path, string owner, string permission)
        {
            Id = id;
            Path = String.IsNullOrWhiteSpace(path) ? "(이름 없음)" : path;
            Owner = String.IsNullOrWhiteSpace(owner) ? "-" : owner;
            Permission = String.IsNullOrWhiteSpace(permission) ? "READ" : permission.Trim().ToUpperInvariant();
        }

        public string PermissionLabel
        {
            get
            {
                if (Permission == "WRITE")
                {
                    return "전체 허용";
                }
                if (Permission == "DOWNLOAD")
                {
                    return "보기 + 다운로드";
                }
                if (Permission == "UPLOAD")
                {
                    return "업로드만";
                }
                return "보기만";
            }
        }
    }
}
