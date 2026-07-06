using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Web.Script.Serialization;

namespace FileInNOutDesktop
{
    internal sealed class DesktopTrayConfigStore
    {
        private readonly string configDir;
        private readonly string configPath;
        private readonly string driveRootPath;

        public DesktopTrayConfigStore(string configDir, string configPath, string driveRootPath)
        {
            this.configDir = configDir;
            this.configPath = configPath;
            this.driveRootPath = driveRootPath;
        }

        public DesktopConfig Load(string defaultServer, string defaultDriveLetter)
        {
            DesktopConfig config = new DesktopConfig();
            config.Server = defaultServer;
            config.SyncDir = DefaultSyncDir();
            config.DriveLetter = defaultDriveLetter;

            if (!File.Exists(configPath))
            {
                config.SyncFolders.Add(DefaultFolderConfig(config.SyncDir));
                return config;
            }

            try
            {
                JavaScriptSerializer serializer = new JavaScriptSerializer();
                Dictionary<string, object> values = serializer.Deserialize<Dictionary<string, object>>(File.ReadAllText(configPath));
                if (values == null)
                {
                    config.SyncFolders.Add(DefaultFolderConfig(config.SyncDir));
                    return config;
                }

                object value;
                if (values.TryGetValue("server", out value) && value != null && !String.IsNullOrWhiteSpace(Convert.ToString(value)))
                {
                    config.Server = Convert.ToString(value);
                }
                if (values.TryGetValue("email", out value) && value != null)
                {
                    config.Email = Convert.ToString(value);
                }
                config.Token = ReadProtectedToken(values, "token");
                config.RefreshToken = ReadProtectedToken(values, "refreshToken");
                if (values.TryGetValue("syncDir", out value) && value != null && !String.IsNullOrWhiteSpace(Convert.ToString(value)))
                {
                    config.SyncDir = Convert.ToString(value);
                }
                if (values.TryGetValue("driveLetter", out value) && value != null)
                {
                    config.DriveLetter = DesktopPathRules.NormalizeDriveLetter(Convert.ToString(value));
                }
                if (values.TryGetValue("syncFolders", out value))
                {
                    LoadSyncFolders(value, config.SyncFolders);
                }
                ApplyAccountProfile(values, config);
            }
            catch
            {
            }

            if (config.SyncFolders.Count == 0)
            {
                config.SyncFolders.Add(DefaultFolderConfig(config.SyncDir));
            }
            return config;
        }

        public void Save(DesktopConfig config, string defaultServer)
        {
            Directory.CreateDirectory(configDir);
            JavaScriptSerializer serializer = new JavaScriptSerializer();
            Dictionary<string, object> existingValues = new Dictionary<string, object>();
            if (File.Exists(configPath))
            {
                try
                {
                    existingValues = serializer.Deserialize<Dictionary<string, object>>(File.ReadAllText(configPath)) ?? new Dictionary<string, object>();
                }
                catch
                {
                    existingValues = new Dictionary<string, object>();
                }
            }

            Dictionary<string, object> values = new Dictionary<string, object>();
            values["server"] = String.IsNullOrWhiteSpace(config.Server) ? defaultServer : config.Server.TrimEnd('/');
            values["email"] = config.Email ?? "";
            WriteProtectedToken(values, "token", config.Token);
            WriteProtectedToken(values, "refreshToken", config.RefreshToken);
            values["syncDir"] = !String.IsNullOrWhiteSpace(config.SyncDir) ? config.SyncDir : DefaultSyncDir();
            values["driveLetter"] = DesktopPathRules.NormalizeDriveLetter(config.DriveLetter);
            values["driveRoot"] = driveRootPath;

            List<Dictionary<string, object>> folders = new List<Dictionary<string, object>>();
            foreach (SyncFolderConfig folder in config.SyncFolders)
            {
                if (String.IsNullOrWhiteSpace(folder.LocalPath))
                {
                    continue;
                }
                Dictionary<string, object> item = new Dictionary<string, object>();
                item["name"] = String.IsNullOrWhiteSpace(folder.Name) ? Path.GetFileName(folder.LocalPath) : folder.Name;
                item["localPath"] = folder.LocalPath;
                item["remotePath"] = DesktopSyncText.NormalizeRemotePath(folder.RemotePath, folder.LocalPath);
                item["direction"] = DesktopSyncText.NormalizeDirection(folder.Direction);
                if (!String.IsNullOrWhiteSpace(folder.Permission))
                {
                    item["permission"] = DesktopSyncText.NormalizePermission(folder.Permission);
                }
                item["enabled"] = folder.Enabled;
                folders.Add(item);
            }
            values["syncFolders"] = folders;
            values["accounts"] = DesktopDataReader.ReadDictionary(existingValues, "accounts");
            SaveAccountProfile(values, config, folders);

            File.WriteAllText(configPath, serializer.Serialize(values));
        }

        public static SyncFolderConfig DefaultFolderConfig(string localPath)
        {
            SyncFolderConfig folder = new SyncFolderConfig();
            folder.Name = Path.GetFileName(localPath);
            folder.LocalPath = localPath;
            folder.RemotePath = DesktopSyncText.NormalizeRemotePath("", localPath);
            folder.Direction = "two-way";
            folder.Enabled = true;
            return folder;
        }

        public static string DefaultSyncDir()
        {
            return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "FileInNOut");
        }

        private static string AccountKey(string email)
        {
            return (email ?? "").Trim().ToLowerInvariant();
        }

        private static string ProtectedTokenKey(string key)
        {
            return key + "Protected";
        }

        private static string ProtectDesktopSecret(string value)
        {
            if (String.IsNullOrWhiteSpace(value))
            {
                return "";
            }

            byte[] plainBytes = Encoding.UTF8.GetBytes(value);
            byte[] protectedBytes = ProtectedData.Protect(plainBytes, null, DataProtectionScope.CurrentUser);
            return Convert.ToBase64String(protectedBytes);
        }

        private static string UnprotectDesktopSecret(string value)
        {
            if (String.IsNullOrWhiteSpace(value))
            {
                return "";
            }

            try
            {
                byte[] protectedBytes = Convert.FromBase64String(value);
                byte[] plainBytes = ProtectedData.Unprotect(protectedBytes, null, DataProtectionScope.CurrentUser);
                return Encoding.UTF8.GetString(plainBytes);
            }
            catch
            {
                return "";
            }
        }

        private static string ReadProtectedToken(Dictionary<string, object> values, string key)
        {
            string plain = DesktopDataReader.ReadString(values, key);
            if (!String.IsNullOrWhiteSpace(plain))
            {
                return plain;
            }
            return UnprotectDesktopSecret(DesktopDataReader.ReadString(values, ProtectedTokenKey(key)));
        }

        private static void WriteProtectedToken(Dictionary<string, object> values, string key, string value)
        {
            values.Remove(key);
            values.Remove(ProtectedTokenKey(key));
            if (String.IsNullOrWhiteSpace(value))
            {
                return;
            }

            values[ProtectedTokenKey(key)] = ProtectDesktopSecret(value);
        }

        private static void ApplyAccountProfile(Dictionary<string, object> values, DesktopConfig config)
        {
            string key = AccountKey(config.Email);
            if (String.IsNullOrWhiteSpace(key))
            {
                return;
            }

            Dictionary<string, object> accounts = DesktopDataReader.ReadDictionary(values, "accounts");
            Dictionary<string, object> profile = DesktopDataReader.ReadDictionary(accounts, key);
            if (profile.Count == 0)
            {
                return;
            }

            string value = ReadProtectedToken(profile, "token");
            if (!String.IsNullOrWhiteSpace(value))
            {
                config.Token = value;
            }
            value = ReadProtectedToken(profile, "refreshToken");
            if (!String.IsNullOrWhiteSpace(value))
            {
                config.RefreshToken = value;
            }
            value = DesktopDataReader.ReadString(profile, "syncDir");
            if (!String.IsNullOrWhiteSpace(value))
            {
                config.SyncDir = value;
            }
            value = DesktopDataReader.ReadString(profile, "driveLetter");
            if (!String.IsNullOrWhiteSpace(value))
            {
                config.DriveLetter = DesktopPathRules.NormalizeDriveLetter(value);
            }

            object foldersValue;
            if (profile.TryGetValue("syncFolders", out foldersValue))
            {
                config.SyncFolders.Clear();
                LoadSyncFolders(foldersValue, config.SyncFolders);
            }
        }

        private static void SaveAccountProfile(Dictionary<string, object> values, DesktopConfig config, List<Dictionary<string, object>> folders)
        {
            string key = AccountKey(config.Email);
            if (String.IsNullOrWhiteSpace(key))
            {
                return;
            }

            Dictionary<string, object> accounts = DesktopDataReader.ReadDictionary(values, "accounts");
            Dictionary<string, object> profile = DesktopDataReader.ReadDictionary(accounts, key);
            accounts[key] = profile;
            values["accounts"] = accounts;

            WriteProtectedToken(profile, "token", config.Token);
            WriteProtectedToken(profile, "refreshToken", config.RefreshToken);

            profile["syncDir"] = !String.IsNullOrWhiteSpace(config.SyncDir) ? config.SyncDir : DefaultSyncDir();
            profile["driveLetter"] = DesktopPathRules.NormalizeDriveLetter(config.DriveLetter);
            profile["syncFolders"] = folders;
        }

        private static void LoadSyncFolders(object rawValue, List<SyncFolderConfig> folders)
        {
            IEnumerable values = rawValue as IEnumerable;
            if (values == null || rawValue is string)
            {
                return;
            }

            foreach (object item in values)
            {
                Dictionary<string, object> data = item as Dictionary<string, object>;
                if (data == null)
                {
                    continue;
                }

                SyncFolderConfig folder = new SyncFolderConfig();
                folder.Name = DesktopDataReader.ReadString(data, "name");
                folder.LocalPath = DesktopDataReader.ReadString(data, "localPath");
                folder.RemotePath = DesktopDataReader.ReadString(data, "remotePath");
                folder.Direction = DesktopSyncText.NormalizeDirection(DesktopDataReader.ReadString(data, "direction"));
                folder.Permission = DesktopSyncText.NormalizePermission(DesktopDataReader.ReadString(data, "permission"));
                folder.Enabled = !data.ContainsKey("enabled") || Convert.ToBoolean(data["enabled"]);
                if (!String.IsNullOrWhiteSpace(folder.LocalPath))
                {
                    folder.RemotePath = DesktopSyncText.NormalizeRemotePath(folder.RemotePath, folder.LocalPath);
                    folders.Add(folder);
                }
            }
        }
    }
}
