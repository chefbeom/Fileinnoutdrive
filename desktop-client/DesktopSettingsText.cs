using System;

namespace FileInNOutDesktop
{
    internal sealed class SettingsStorageSummaryText
    {
        public readonly string UsageText;
        public readonly string RemainingText;
        public readonly string PlanText;
        public readonly int ProgressValue;

        public SettingsStorageSummaryText(string usageText, string remainingText, string planText, int progressValue)
        {
            UsageText = usageText ?? "";
            RemainingText = remainingText ?? "";
            PlanText = planText ?? "";
            ProgressValue = progressValue;
        }
    }

    internal static class DesktopSettingsText
    {
        public static SettingsStorageSummaryText BuildStorageSummary(StorageSummary summary, bool useKoreanLabels)
        {
            string used = DesktopFileSearch.FormatByteCount(summary.UsedBytes);
            string total = DesktopFileSearch.FormatByteCount(summary.QuotaBytes);
            string remain = DesktopFileSearch.FormatByteCount(summary.RemainingBytes);
            if (!summary.Available)
            {
                used = "-";
                total = "-";
                remain = "-";
            }

            string remainingPrefix = useKoreanLabels ? "\uB0A8\uC740 \uC6A9\uB7C9 " : "Remaining ";
            string fileLabel = useKoreanLabels ? "\uD30C\uC77C " : "Files ";
            string folderLabel = useKoreanLabels ? "\uD3F4\uB354 " : "Folders ";
            string countSuffix = useKoreanLabels ? "\uAC1C" : "";
            string remainingText = remainingPrefix + remain + "  |  " + fileLabel + summary.FileCount + countSuffix + ", " + folderLabel + summary.FolderCount + countSuffix;
            string planText = String.IsNullOrWhiteSpace(summary.PlanLabel) ? "" : summary.PlanLabel;
            return new SettingsStorageSummaryText(used + " / " + total, remainingText, planText, summary.Available ? summary.UsagePercent : 0);
        }

        public static string BuildStatusText(
            string lastStatus,
            string lastOutput,
            bool isSyncActive,
            bool isSyncPaused,
            bool hasPendingFileChange,
            bool useKoreanLabels)
        {
            string text = ((lastStatus ?? "") + Environment.NewLine + Environment.NewLine + (lastOutput ?? "")).Trim();
            if (isSyncActive)
            {
                string active = useKoreanLabels ? "\uB3D9\uAE30\uD654 \uC9C4\uD589 \uC911" : "Sync in progress";
                return (active + Environment.NewLine + Environment.NewLine + text).Trim();
            }
            if (isSyncPaused)
            {
                string paused = useKoreanLabels ? "\uB3D9\uAE30\uD654 \uC77C\uC2DC\uC815\uC9C0\uB428" : "Sync paused";
                return (paused + Environment.NewLine + Environment.NewLine + text).Trim();
            }
            if (hasPendingFileChange)
            {
                string pending = useKoreanLabels ? "\uBCC0\uACBD\uC774 \uAC10\uC9C0\uB418\uC5B4 \uB2E4\uC74C \uB3D9\uAE30\uD654\uB97C \uB300\uAE30 \uC911\uC785\uB2C8\uB2E4." : "Changes detected. Waiting for the next sync.";
                return (pending + Environment.NewLine + Environment.NewLine + text).Trim();
            }
            return text;
        }
    }
}