using System;
using System.Windows.Forms;

namespace FileInNOutDesktop
{
    internal static class DesktopTrayMenu
    {
        public static ContextMenuStrip Build(
            bool useKoreanLabels,
            bool autoSyncEnabled,
            bool notificationsEnabled,
            Action showSettings,
            Action openSyncFolder,
            Action syncNow,
            Action openWeb,
            Action checkForUpdates,
            Action toggleAutoSync,
            Action toggleNotifications,
            Action exitApplication)
        {
            if (useKoreanLabels)
            {
                return BuildMenuKorean(
                    autoSyncEnabled,
                    notificationsEnabled,
                    showSettings,
                    openSyncFolder,
                    syncNow,
                    openWeb,
                    checkForUpdates,
                    toggleAutoSync,
                    toggleNotifications,
                    exitApplication);
            }

            ContextMenuStrip menu = new ContextMenuStrip();
            AddAction(menu, "FileInNOut 데스크톱 열기", showSettings);
            AddAction(menu, "동기화 폴더 열기", openSyncFolder);
            AddAction(menu, "지금 동기화", syncNow);
            AddAction(menu, "FileInNOut 웹 열기", openWeb);
            AddAction(menu, "Check for updates", checkForUpdates);
            menu.Items.Add(new ToolStripSeparator());
            AddToggle(menu, autoSyncEnabled ? "동기화 일시정지" : "동기화 재개", false, toggleAutoSync);
            AddToggle(menu, "파일 변경 시 알림", notificationsEnabled, toggleNotifications);
            menu.Items.Add(new ToolStripSeparator());
            AddAction(menu, "종료", exitApplication);
            return menu;
        }

        private static ContextMenuStrip BuildMenuKorean(
            bool autoSyncEnabled,
            bool notificationsEnabled,
            Action showSettings,
            Action openSyncFolder,
            Action syncNow,
            Action openWeb,
            Action checkForUpdates,
            Action toggleAutoSync,
            Action toggleNotifications,
            Action exitApplication)
        {
            ContextMenuStrip menu = new ContextMenuStrip();
            AddAction(menu, "FileInNOut \uB370\uC2A4\uD06C\uD1B1 \uC5F4\uAE30", showSettings);
            AddAction(menu, "\uB3D9\uAE30\uD654 \uD3F4\uB354 \uC5F4\uAE30", openSyncFolder);
            AddAction(menu, "\uC9C0\uAE08 \uB3D9\uAE30\uD654", syncNow);
            AddAction(menu, "FileInNOut \uC6F9 \uC5F4\uAE30", openWeb);
            AddAction(menu, "\uC5C5\uB370\uC774\uD2B8 \uD655\uC778", checkForUpdates);
            menu.Items.Add(new ToolStripSeparator());
            AddToggle(menu, autoSyncEnabled ? "\uB3D9\uAE30\uD654 \uC77C\uC2DC\uC815\uC9C0" : "\uB3D9\uAE30\uD654 \uC7AC\uAC1C", false, toggleAutoSync);
            AddToggle(menu, "\uD30C\uC77C \uBCC0\uACBD \uC2DC \uC54C\uB9BC", notificationsEnabled, toggleNotifications);
            menu.Items.Add(new ToolStripSeparator());
            AddAction(menu, "\uC885\uB8CC", exitApplication);
            return menu;
        }

        private static void AddAction(ContextMenuStrip menu, string text, Action action)
        {
            menu.Items.Add(text, null, delegate { action(); });
        }

        private static void AddToggle(ContextMenuStrip menu, string text, bool isChecked, Action action)
        {
            ToolStripMenuItem item = new ToolStripMenuItem(text);
            item.Checked = isChecked;
            item.Click += delegate { action(); };
            menu.Items.Add(item);
        }
    }
}