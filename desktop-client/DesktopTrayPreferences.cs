using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Web.Script.Serialization;

namespace FileInNOutDesktop
{
    internal sealed class DesktopTrayPreferences
    {
        public bool AutoSyncEnabled { get; private set; }
        public bool NotificationsEnabled { get; private set; }
        public DateTime LastUpdateCheckUtc { get; private set; }

        public DesktopTrayPreferences(bool autoSyncEnabled, bool notificationsEnabled, DateTime lastUpdateCheckUtc)
        {
            AutoSyncEnabled = autoSyncEnabled;
            NotificationsEnabled = notificationsEnabled;
            LastUpdateCheckUtc = lastUpdateCheckUtc == DateTime.MinValue ? DateTime.MinValue : lastUpdateCheckUtc.ToUniversalTime();
        }

        public static DesktopTrayPreferences Defaults()
        {
            return new DesktopTrayPreferences(true, true, DateTime.MinValue);
        }

        public static DesktopTrayPreferences Load(string path)
        {
            DesktopTrayPreferences defaults = Defaults();
            if (String.IsNullOrWhiteSpace(path) || !File.Exists(path))
            {
                return defaults;
            }

            try
            {
                JavaScriptSerializer serializer = new JavaScriptSerializer();
                Dictionary<string, object> values = serializer.Deserialize<Dictionary<string, object>>(File.ReadAllText(path));
                if (values == null)
                {
                    return defaults;
                }

                bool autoSyncEnabled = ReadBool(values, "autoSyncEnabled", defaults.AutoSyncEnabled);
                bool notificationsEnabled = ReadBool(values, "notificationsEnabled", defaults.NotificationsEnabled);
                DateTime lastUpdateCheckUtc = ReadDateTime(values, "lastUpdateCheckUtc", defaults.LastUpdateCheckUtc);
                return new DesktopTrayPreferences(autoSyncEnabled, notificationsEnabled, lastUpdateCheckUtc);
            }
            catch
            {
                return defaults;
            }
        }

        public static void Save(string path, DesktopTrayPreferences preferences)
        {
            if (String.IsNullOrWhiteSpace(path))
            {
                return;
            }
            if (preferences == null)
            {
                preferences = Defaults();
            }

            string directory = Path.GetDirectoryName(path);
            if (!String.IsNullOrWhiteSpace(directory))
            {
                Directory.CreateDirectory(directory);
            }

            Dictionary<string, object> values = new Dictionary<string, object>();
            values["autoSyncEnabled"] = preferences.AutoSyncEnabled;
            values["notificationsEnabled"] = preferences.NotificationsEnabled;
            values["lastUpdateCheckUtc"] = preferences.LastUpdateCheckUtc == DateTime.MinValue ? "" : preferences.LastUpdateCheckUtc.ToUniversalTime().ToString("o");
            JavaScriptSerializer serializer = new JavaScriptSerializer();
            File.WriteAllText(path, serializer.Serialize(values));
        }

        private static bool ReadBool(Dictionary<string, object> values, string name, bool fallback)
        {
            if (!values.ContainsKey(name))
            {
                return fallback;
            }
            try
            {
                return Convert.ToBoolean(values[name]);
            }
            catch
            {
                return fallback;
            }
        }

        private static DateTime ReadDateTime(Dictionary<string, object> values, string name, DateTime fallback)
        {
            if (!values.ContainsKey(name))
            {
                return fallback;
            }

            DateTime parsed;
            if (DateTime.TryParse(Convert.ToString(values[name]), null, DateTimeStyles.AdjustToUniversal, out parsed))
            {
                return parsed.ToUniversalTime();
            }
            return fallback;
        }
    }
}