using System;
using System.Collections.Generic;
using System.Text;
using System.Text.RegularExpressions;
using System.Web.Script.Serialization;

namespace FileInNOutDesktop
{
    internal static class DesktopUpdateService
    {
        private const int UpdateCheckIntervalHours = 12;
        private const string UpdateManifestRelativePath = "/downloads/FileInNOutDesktop.latest.json";

        public static bool ShouldCheck(DateTime lastUpdateCheckUtc)
        {
            if (lastUpdateCheckUtc == DateTime.MinValue)
            {
                return true;
            }
            return DateTime.UtcNow.Subtract(lastUpdateCheckUtc.ToUniversalTime()) >= TimeSpan.FromHours(UpdateCheckIntervalHours);
        }

        public static DesktopUpdateResult CheckForUpdate(DesktopConfig config, string defaultServer, string buildVersion)
        {
            string manifestUrl = BuildManifestUrl(config, defaultServer);
            string currentVersion = CurrentAppVersion(buildVersion);
            string json = DownloadText(manifestUrl, currentVersion);
            JavaScriptSerializer serializer = new JavaScriptSerializer();
            Dictionary<string, object> values = serializer.Deserialize<Dictionary<string, object>>(json);
            if (values == null)
            {
                throw new InvalidOperationException("업데이트 manifest를 읽을 수 없습니다.");
            }

            string latestVersion = DesktopDataReader.ReadString(values, "version").Trim();
            string downloadUrl = ResolveManifestUrl(manifestUrl, DesktopDataReader.ReadString(values, "downloadUrl"));
            string releaseNotes = DesktopDataReader.ReadString(values, "releaseNotes");
            string sha256 = DesktopDataReader.ReadString(values, "sha256");
            bool mandatory = values.ContainsKey("mandatory") && Convert.ToBoolean(values["mandatory"]);
            bool currentIsLocal = IsLocalBuildVersion(currentVersion);
            bool hasUpdate = !currentIsLocal && !String.IsNullOrWhiteSpace(latestVersion) && CompareVersions(latestVersion, currentVersion) > 0;

            return new DesktopUpdateResult(currentVersion, latestVersion, downloadUrl, releaseNotes, sha256, mandatory, manifestUrl, hasUpdate, currentIsLocal);
        }

        public static string CurrentAppVersion(string buildVersion)
        {
            string version = (buildVersion ?? "").Trim();
            if (IsLocalBuildVersion(version))
            {
                return "local";
            }
            return version;
        }

        public static string BuildSummary(DesktopUpdateResult result)
        {
            List<string> lines = new List<string>();
            lines.Add("현재 버전: " + result.CurrentVersion);
            lines.Add("최신 버전: " + (String.IsNullOrWhiteSpace(result.LatestVersion) ? "알 수 없음" : result.LatestVersion));
            if (!String.IsNullOrWhiteSpace(result.DownloadUrl))
            {
                lines.Add("다운로드: " + result.DownloadUrl);
            }
            if (!String.IsNullOrWhiteSpace(result.Sha256))
            {
                lines.Add("SHA-256: " + result.Sha256);
            }
            if (!String.IsNullOrWhiteSpace(result.ReleaseNotes))
            {
                lines.Add("");
                lines.Add(result.ReleaseNotes);
            }
            return String.Join(Environment.NewLine, lines.ToArray());
        }

        public static string BuildDialogMessage(DesktopUpdateResult result)
        {
            string firstLine = result.HasUpdate
                ? "새 버전 " + result.LatestVersion + "을 사용할 수 있습니다."
                : "현재 설치 버전이 local이라 최신 여부를 자동 판단할 수 없습니다.";
            return firstLine + Environment.NewLine + Environment.NewLine +
                "현재 버전: " + result.CurrentVersion + Environment.NewLine +
                "최신 버전: " + (String.IsNullOrWhiteSpace(result.LatestVersion) ? "알 수 없음" : result.LatestVersion) + Environment.NewLine + Environment.NewLine +
                "다운로드 페이지를 여시겠습니까?";
        }

        private static string BuildManifestUrl(DesktopConfig config, string defaultServer)
        {
            string overrideUrl = Environment.GetEnvironmentVariable("FILEINNOUT_DESKTOP_UPDATE_MANIFEST");
            if (!String.IsNullOrWhiteSpace(overrideUrl))
            {
                return overrideUrl.Trim();
            }

            string baseUrl = config == null || String.IsNullOrWhiteSpace(config.Server) ? defaultServer : config.Server.TrimEnd('/');
            if (baseUrl.EndsWith("/api", StringComparison.OrdinalIgnoreCase))
            {
                baseUrl = baseUrl.Substring(0, baseUrl.Length - 4);
            }
            return baseUrl.TrimEnd('/') + UpdateManifestRelativePath;
        }

        private static string DownloadText(string url, string currentVersion)
        {
            using (System.Net.WebClient client = new System.Net.WebClient())
            {
                client.Encoding = Encoding.UTF8;
                client.Headers[System.Net.HttpRequestHeader.UserAgent] = "FileInNOutDesktop/" + currentVersion;
                return client.DownloadString(url);
            }
        }

        private static string ResolveManifestUrl(string manifestUrl, string value)
        {
            if (String.IsNullOrWhiteSpace(value))
            {
                return "";
            }
            Uri absolute;
            if (Uri.TryCreate(value.Trim(), UriKind.Absolute, out absolute))
            {
                return absolute.ToString();
            }
            return new Uri(new Uri(manifestUrl), value.Trim()).ToString();
        }

        private static bool IsLocalBuildVersion(string version)
        {
            if (String.IsNullOrWhiteSpace(version))
            {
                return true;
            }
            version = version.Trim();
            return version.Equals("local", StringComparison.OrdinalIgnoreCase) || (version.StartsWith("__") && version.EndsWith("__"));
        }

        private static int CompareVersions(string left, string right)
        {
            List<long> leftParts = ExtractVersionNumbers(left);
            List<long> rightParts = ExtractVersionNumbers(right);
            if (leftParts.Count > 0 || rightParts.Count > 0)
            {
                int count = Math.Max(leftParts.Count, rightParts.Count);
                for (int i = 0; i < count; i++)
                {
                    long leftValue = i < leftParts.Count ? leftParts[i] : 0;
                    long rightValue = i < rightParts.Count ? rightParts[i] : 0;
                    int compared = leftValue.CompareTo(rightValue);
                    if (compared != 0)
                    {
                        return compared;
                    }
                }
                return 0;
            }
            return String.Compare(left ?? "", right ?? "", StringComparison.OrdinalIgnoreCase);
        }

        private static List<long> ExtractVersionNumbers(string value)
        {
            List<long> numbers = new List<long>();
            foreach (Match match in Regex.Matches(value ?? "", "\\d+"))
            {
                long number;
                if (Int64.TryParse(match.Value, out number))
                {
                    numbers.Add(number);
                }
            }
            return numbers;
        }
    }
}
