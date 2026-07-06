using System;
using System.IO;
using System.Text.RegularExpressions;

namespace FileInNOutDesktop
{
    internal static class DesktopSyncText
    {
        public static string NormalizeDirection(string value)
        {
            value = (value ?? "").Trim().ToLowerInvariant().Replace("_", "-");
            if (value == "upload" || value == "push" || value == "local-to-cloud")
            {
                return "upload";
            }
            if (value == "download" || value == "pull" || value == "cloud-to-local")
            {
                return "download";
            }
            return "two-way";
        }

        public static bool UseKoreanLabels()
        {
            return true;
        }

        public static string DirectionLabel(string value)
        {
            value = NormalizeDirection(value);
            if (UseKoreanLabels())
            {
                if (value == "upload")
                {
                    return "폴더 -> 클라우드";
                }
                if (value == "download")
                {
                    return "클라우드 -> 폴더";
                }
                return "양방향";
            }
            if (value == "upload")
            {
                return "Folder -> Cloud";
            }
            if (value == "download")
            {
                return "Cloud -> Folder";
            }
            return "Two-way";
        }

        public static string NormalizePermission(string value)
        {
            value = (value ?? "").Trim().ToUpperInvariant();
            if (value == "READ" || value == "DOWNLOAD" || value == "UPLOAD" || value == "WRITE")
            {
                return value;
            }
            return "";
        }

        public static string PermissionLabel(string value)
        {
            value = NormalizePermission(value);
            if (value == "READ")
            {
                return "보기만";
            }
            if (value == "DOWNLOAD")
            {
                return "보기 + 다운로드";
            }
            if (value == "UPLOAD")
            {
                return "업로드만";
            }
            if (value == "WRITE")
            {
                return "전체 허용";
            }
            return "공유";
        }

        public static string NormalizeRemotePath(string remotePath, string localPath)
        {
            string text = (remotePath ?? "").Replace("\\", "/").Trim().Trim('/');
            if (String.IsNullOrWhiteSpace(text))
            {
                text = Path.GetFileName((localPath ?? "").TrimEnd('\\', '/'));
            }
            if (String.IsNullOrWhiteSpace(text))
            {
                text = "FileInNOut";
            }
            string[] parts = text.Split(new[] { '/' }, StringSplitOptions.RemoveEmptyEntries);
            for (int i = 0; i < parts.Length; i++)
            {
                parts[i] = SafeSegment(parts[i]);
            }
            return String.Join("/", parts);
        }

        public static string SummarizeSync(string output)
        {
            if (UseKoreanLabels())
            {
                output = TranslateCommandOutputKorean(output);
                if (String.IsNullOrWhiteSpace(output))
                {
                    return "\uBCC0\uACBD \uC0AC\uD56D \uC5C6\uC74C.";
                }
                return TrimForBalloon(output.Replace("\r", " ").Replace("\n", " "));
            }
            output = TranslateCommandOutput(output);
            if (String.IsNullOrWhiteSpace(output))
            {
                return "변경 사항 없음.";
            }
            Match match = Regex.Match(output, @"업로드:.*?다운로드:.*", RegexOptions.Singleline);
            if (match.Success)
            {
                return TrimForBalloon(match.Value.Replace("\r", " ").Replace("\n", " "));
            }
            return TrimForBalloon(output);
        }

        public static string TranslateCommandOutput(string output)
        {
            if (UseKoreanLabels())
            {
                return TranslateCommandOutputKorean(output);
            }
            if (String.IsNullOrWhiteSpace(output))
            {
                return "";
            }
            string text = output.Trim();
            text = Regex.Replace(text, @"(?m)^(.+?) push:", "$1 업로드:");
            text = Regex.Replace(text, @"(?m)^(.+?) pull:", "$1 다운로드:");
            text = Regex.Replace(text, @"(?m)^push:", "업로드:");
            text = Regex.Replace(text, @"(?m)^pull:", "다운로드:");
            text = text.Replace("pulled=", "받음=");
            text = text.Replace("pushed=", "올림=");
            text = text.Replace("deleted=", "삭제=");
            text = text.Replace("folders_created=", "폴더생성=");
            text = text.Replace("skipped_dirty=", "충돌건너뜀=");
            return text;
        }

        public static string TranslateCommandOutputKorean(string output)
        {
            if (String.IsNullOrWhiteSpace(output))
            {
                return "";
            }
            string text = output.Trim();
            text = Regex.Replace(text, @"(?m)^(.+?) push:", "$1 \uC5C5\uB85C\uB4DC:");
            text = Regex.Replace(text, @"(?m)^(.+?) pull:", "$1 \uB2E4\uC6B4\uB85C\uB4DC:");
            text = Regex.Replace(text, @"(?m)^push:", "\uC5C5\uB85C\uB4DC:");
            text = Regex.Replace(text, @"(?m)^pull:", "\uB2E4\uC6B4\uB85C\uB4DC:");
            text = text.Replace("pulled=", "\uBC1B\uC74C=");
            text = text.Replace("pushed=", "\uC62C\uB9BC=");
            text = text.Replace("deleted=", "\uC0AD\uC81C=");
            text = text.Replace("folders_created=", "\uD3F4\uB354\uC0DD\uC131=");
            text = text.Replace("skipped_dirty=", "\uCDA9\uB3CC\uAC74\uB108\uB700=");
            text = text.Replace("download_failed=", "\uB2E4\uC6B4\uB85C\uB4DC\uC2E4\uD328=");
            return text;
        }

        public static bool HasSyncChanges(string output)
        {
            if (String.IsNullOrWhiteSpace(output))
            {
                return false;
            }

            MatchCollection matches = Regex.Matches(output, @"(?:pulled|pushed|deleted|folders_created|download_failed)=(\d+)", RegexOptions.IgnoreCase);
            foreach (Match match in matches)
            {
                int value;
                if (Int32.TryParse(match.Groups[1].Value, out value) && value > 0)
                {
                    return true;
                }
            }
            return false;
        }

        public static string AutoSyncToggleStatus(bool enabled)
        {
            return enabled ? "동기화 재개됨" : "동기화 일시정지됨";
        }

        public static string AutoSyncToggleOutput(bool enabled)
        {
            return enabled
                ? "파일 변경 감지와 20초 자동 동기화가 다시 실행됩니다."
                : "파일 변경 감지와 20초 자동 동기화를 잠시 멈췄습니다. 지금 동기화는 계속 사용할 수 있습니다.";
        }

        public static string AutoSyncToggleNotificationTitle()
        {
            return "동기화 상태";
        }

        public static string AutoSyncToggleNotificationBody(bool enabled)
        {
            return enabled ? "동기화를 재개했습니다." : "동기화를 일시정지했습니다.";
        }

        public static string TrimForBalloon(string value)
        {
            if (String.IsNullOrWhiteSpace(value))
            {
                return "";
            }
            value = value.Trim();
            if (value.Length <= 220)
            {
                return value;
            }
            return value.Substring(0, 217) + "...";
        }
        private static string SafeSegment(string value)
        {
            string cleaned = Regex.Replace(value ?? "", "[<>:\"\\\\|?*]", "_").Trim();
            cleaned = cleaned.TrimEnd('.', ' ');
            return String.IsNullOrWhiteSpace(cleaned) ? "Folder" : cleaned;
        }
    }
}