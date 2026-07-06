using System;
using System.IO;
using Microsoft.Win32;

namespace FileInNOutDesktop
{
    internal static class DesktopExplorerNamespace
    {
        private const string NamespaceGuid = "{6F4F52E8-8E6F-4B94-A14D-8B22C50C13B9}";
        private const string ShellFolderDelegateClsid = "{0E5AAE11-A475-4C5B-AB00-C66DE400274E}";

        public static void Register(string targetFolder, string installDir)
        {
            if (String.IsNullOrWhiteSpace(targetFolder))
            {
                return;
            }

            try
            {
                Directory.CreateDirectory(targetFolder);
                string resolvedTarget = Path.GetFullPath(targetFolder);
                string iconPath = Path.Combine(installDir ?? "", "FileInNOutDesktop.ico");
                string displayIcon = File.Exists(iconPath) ? iconPath + ",0" : "%SystemRoot%\\System32\\shell32.dll,3";
                string clsidPath = "Software\\Classes\\CLSID\\" + NamespaceGuid;

                using (RegistryKey key = Registry.CurrentUser.CreateSubKey(clsidPath))
                {
                    if (key == null)
                    {
                        return;
                    }
                    key.SetValue("", "FileInNOut", RegistryValueKind.String);
                    key.SetValue("System.IsPinnedToNameSpaceTree", 1, RegistryValueKind.DWord);
                    key.SetValue("SortOrderIndex", 66, RegistryValueKind.DWord);
                    key.SetValue("ThisPCPolicy", "Show", RegistryValueKind.String);
                }

                using (RegistryKey key = Registry.CurrentUser.CreateSubKey(clsidPath + "\\DefaultIcon"))
                {
                    if (key != null)
                    {
                        key.SetValue("", displayIcon, RegistryValueKind.String);
                    }
                }

                using (RegistryKey key = Registry.CurrentUser.CreateSubKey(clsidPath + "\\InProcServer32"))
                {
                    if (key != null)
                    {
                        key.SetValue("", "%SystemRoot%\\System32\\shell32.dll", RegistryValueKind.String);
                        key.SetValue("ThreadingModel", "Both", RegistryValueKind.String);
                    }
                }

                using (RegistryKey key = Registry.CurrentUser.CreateSubKey(clsidPath + "\\Instance"))
                {
                    if (key != null)
                    {
                        key.SetValue("CLSID", ShellFolderDelegateClsid, RegistryValueKind.String);
                    }
                }

                using (RegistryKey key = Registry.CurrentUser.CreateSubKey(clsidPath + "\\Instance\\InitPropertyBag"))
                {
                    if (key != null)
                    {
                        key.SetValue("Attributes", 17, RegistryValueKind.DWord);
                        key.SetValue("TargetFolderPath", resolvedTarget, RegistryValueKind.String);
                    }
                }

                using (RegistryKey key = Registry.CurrentUser.CreateSubKey(clsidPath + "\\ShellFolder"))
                {
                    if (key != null)
                    {
                        key.SetValue("FolderValueFlags", 40, RegistryValueKind.DWord);
                        key.SetValue("Attributes", unchecked((int)0xF080004D), RegistryValueKind.DWord);
                    }
                }

                RegisterNamespaceLink("Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Desktop\\NameSpace\\" + NamespaceGuid);
                RegisterNamespaceLink("Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\MyComputer\\NameSpace\\" + NamespaceGuid);
            }
            catch
            {
            }
        }

        private static void RegisterNamespaceLink(string registryPath)
        {
            using (RegistryKey key = Registry.CurrentUser.CreateSubKey(registryPath))
            {
                if (key != null)
                {
                    key.SetValue("", "FileInNOut", RegistryValueKind.String);
                }
            }
        }
    }
}