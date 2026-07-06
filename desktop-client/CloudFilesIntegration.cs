using System;
using System.Collections.Generic;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;

namespace FileInNOutDesktop
{
    internal static class CloudFilesIntegration
    {
        private const int S_OK = 0;
        private const uint CF_REGISTER_FLAG_UPDATE = 0x00000001;
        private const uint CF_REGISTER_FLAG_MARK_IN_SYNC_ON_ROOT = 0x00000004;
        private const ushort CF_HYDRATION_POLICY_ALWAYS_FULL = 3;
        private const ushort CF_POPULATION_POLICY_ALWAYS_FULL = 3;
        private static readonly Guid ProviderId = new Guid("5C66E909-B8D2-4E16-AF7E-EC8F8892D4D3");

        public static void TryRegisterSyncRoot(string syncRootPath)
        {
            try
            {
                RegisterSyncRoot(syncRootPath);
            }
            catch
            {
            }
        }

        public static int RegisterSyncRoot(string syncRootPath)
        {
            if (String.IsNullOrWhiteSpace(syncRootPath))
            {
                return 1;
            }

            try
            {
                Directory.CreateDirectory(syncRootPath);
                string root = Path.GetFullPath(syncRootPath);
                CF_SYNC_REGISTRATION registration = new CF_SYNC_REGISTRATION();
                registration.StructSize = (uint)Marshal.SizeOf(typeof(CF_SYNC_REGISTRATION));
                registration.ProviderName = "FileInNOut";
                registration.ProviderVersion = "1.0";
                registration.SyncRootIdentity = IntPtr.Zero;
                registration.SyncRootIdentityLength = 0;
                registration.FileIdentity = IntPtr.Zero;
                registration.FileIdentityLength = 0;
                registration.ProviderId = ProviderId;
                string diagnostic = BuildSyncRootDiagnostic(root);

                CF_SYNC_POLICIES policies = new CF_SYNC_POLICIES();
                policies.StructSize = (uint)Marshal.SizeOf(typeof(CF_SYNC_POLICIES));
                policies.Hydration = new CF_HYDRATION_POLICY
                {
                    Primary = CF_HYDRATION_POLICY_ALWAYS_FULL,
                    Modifier = 0
                };
                policies.Population = new CF_POPULATION_POLICY
                {
                    Primary = CF_POPULATION_POLICY_ALWAYS_FULL,
                    Modifier = 0
                };
                policies.InSync = 0;
                policies.HardLink = 0;
                policies.PlaceholderManagement = 0;

                int hr = CfRegisterSyncRoot(
                    root,
                    ref registration,
                    ref policies,
                    CF_REGISTER_FLAG_UPDATE | CF_REGISTER_FLAG_MARK_IN_SYNC_ON_ROOT);
                WriteIntegrationLog("CfRegisterSyncRoot", root, hr, diagnostic);
                return hr == S_OK ? 0 : hr;
            }
            catch (DllNotFoundException error)
            {
                WriteIntegrationLog("CfRegisterSyncRoot", syncRootPath, 1, error.Message);
                return 1;
            }
            catch (EntryPointNotFoundException error)
            {
                WriteIntegrationLog("CfRegisterSyncRoot", syncRootPath, 1, error.Message);
                return 1;
            }
            catch (Exception error)
            {
                WriteIntegrationLog("CfRegisterSyncRoot", syncRootPath, 1, error.Message);
                return 1;
            }
        }

        public static int UnregisterSyncRoot(string syncRootPath)
        {
            if (String.IsNullOrWhiteSpace(syncRootPath))
            {
                return 1;
            }

            try
            {
                string root = Path.GetFullPath(syncRootPath);
                string diagnostic = BuildSyncRootDiagnostic(root);
                int hr = CfUnregisterSyncRoot(root);
                WriteIntegrationLog("CfUnregisterSyncRoot", root, hr, diagnostic);
                return hr == S_OK ? 0 : hr;
            }
            catch (DllNotFoundException error)
            {
                WriteIntegrationLog("CfUnregisterSyncRoot", syncRootPath, 1, error.Message);
                return 1;
            }
            catch (EntryPointNotFoundException error)
            {
                WriteIntegrationLog("CfUnregisterSyncRoot", syncRootPath, 1, error.Message);
                return 1;
            }
            catch (Exception error)
            {
                WriteIntegrationLog("CfUnregisterSyncRoot", syncRootPath, 1, error.Message);
                return 1;
            }
        }

        private static void WriteIntegrationLog(string action, string root, int result, string detail = "")
        {
            try
            {
                string localAppData = Environment.GetEnvironmentVariable("LOCALAPPDATA");
                if (String.IsNullOrWhiteSpace(localAppData))
                {
                    localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
                }
                string logDir = Path.Combine(localAppData, "FileInNOutDesktop", "logs");
                Directory.CreateDirectory(logDir);
                string line = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") + " " + action +
                    " root=" + root + " result=0x" + result.ToString("X8") +
                    (String.IsNullOrWhiteSpace(detail) ? "" : " detail=" + detail);
                File.AppendAllText(Path.Combine(logDir, "integration.log"), line + Environment.NewLine, Encoding.UTF8);
            }
            catch
            {
            }
        }

        private static string BuildSyncRootDiagnostic(string root)
        {
            List<string> parts = new List<string>();
            try
            {
                DirectoryInfo directory = new DirectoryInfo(root);
                parts.Add("exists=" + directory.Exists);
                if (directory.Exists)
                {
                    parts.Add("attributes=" + directory.Attributes);
                }
            }
            catch (Exception error)
            {
                parts.Add("attributesError=" + error.GetType().Name);
            }

            try
            {
                string probe = Path.Combine(root, ".fileinnout-cloudfiles-probe-" + Guid.NewGuid().ToString("N") + ".tmp");
                File.WriteAllText(probe, "probe", Encoding.UTF8);
                File.Delete(probe);
                parts.Add("canWrite=true");
            }
            catch (Exception error)
            {
                parts.Add("canWrite=false:" + error.GetType().Name);
            }

            try
            {
                string fullRoot = Path.GetPathRoot(root);
                if (!String.IsNullOrWhiteSpace(fullRoot))
                {
                    DriveInfo drive = new DriveInfo(fullRoot);
                    parts.Add("driveFormat=" + drive.DriveFormat);
                    parts.Add("driveType=" + drive.DriveType);
                }
            }
            catch (Exception error)
            {
                parts.Add("driveError=" + error.GetType().Name);
            }

            return String.Join(" ", parts.ToArray());
        }

        public static void WriteCommandLineFailure(string command, string root, Exception error)
        {
            WriteIntegrationLog("CloudFilesCommandLine " + command, root, 1, error.ToString());
        }

        [DllImport("CldApi.dll", CharSet = CharSet.Unicode)]
        private static extern int CfRegisterSyncRoot(
            string SyncRootPath,
            ref CF_SYNC_REGISTRATION Registration,
            ref CF_SYNC_POLICIES Policies,
            uint RegisterFlags);

        [DllImport("CldApi.dll", CharSet = CharSet.Unicode)]
        private static extern int CfUnregisterSyncRoot(string SyncRootPath);

        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        private struct CF_SYNC_REGISTRATION
        {
            public uint StructSize;
            [MarshalAs(UnmanagedType.LPWStr)]
            public string ProviderName;
            [MarshalAs(UnmanagedType.LPWStr)]
            public string ProviderVersion;
            public IntPtr SyncRootIdentity;
            public uint SyncRootIdentityLength;
            public IntPtr FileIdentity;
            public uint FileIdentityLength;
            public Guid ProviderId;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct CF_HYDRATION_POLICY
        {
            public ushort Primary;
            public ushort Modifier;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct CF_POPULATION_POLICY
        {
            public ushort Primary;
            public ushort Modifier;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct CF_SYNC_POLICIES
        {
            public uint StructSize;
            public CF_HYDRATION_POLICY Hydration;
            public CF_POPULATION_POLICY Population;
            public uint InSync;
            public uint HardLink;
            public uint PlaceholderManagement;
        }
    }
}
