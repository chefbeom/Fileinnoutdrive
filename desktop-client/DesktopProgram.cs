using System;
using System.Threading;
using System.Windows.Forms;

namespace FileInNOutDesktop
{
    internal static class Program
    {
        private const string MutexName = "FileInNOutDesktopTray";
        private const string ShowSettingsEventName = "FileInNOutDesktopShowSettings";

        [STAThread]
        private static void Main(string[] args)
        {
            if (HandleCommandLine(args))
            {
                return;
            }

            bool created;
            using (Mutex mutex = new Mutex(true, MutexName, out created))
            {
                if (!created)
                {
                    SignalExistingInstance();
                    return;
                }

                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);
                using (EventWaitHandle showSettingsEvent = new EventWaitHandle(false, EventResetMode.AutoReset, ShowSettingsEventName))
                using (TrayController controller = new TrayController(showSettingsEvent))
                {
                    controller.Start();
                    Application.Run();
                }
            }
        }

        private static bool HandleCommandLine(string[] args)
        {
            if (args == null || args.Length == 0)
            {
                return false;
            }

            string command = (args[0] ?? "").Trim().ToLowerInvariant();
            if (command == "--open-drive" || command == "--open-folder")
            {
                Environment.ExitCode = ExplorerDriveLauncher.OpenDriveRoot();
                return true;
            }

            if (command != "--register-sync-root" && command != "--unregister-sync-root")
            {
                return false;
            }

            string target = args.Length > 1 ? args[1] : "";
            try
            {
                if (command == "--register-sync-root")
                {
                    Environment.ExitCode = CloudFilesIntegration.RegisterSyncRoot(target);
                }
                else
                {
                    Environment.ExitCode = CloudFilesIntegration.UnregisterSyncRoot(target);
                }
            }
            catch (Exception error)
            {
                CloudFilesIntegration.WriteCommandLineFailure(command, target, error);
                Environment.ExitCode = 1;
            }
            return true;
        }

        private static void SignalExistingInstance()
        {
            try
            {
                using (EventWaitHandle existing = EventWaitHandle.OpenExisting(ShowSettingsEventName))
                {
                    existing.Set();
                }
            }
            catch
            {
            }
        }
    }
}
