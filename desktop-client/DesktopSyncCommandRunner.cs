using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;

namespace FileInNOutDesktop
{
    internal static class DesktopSyncCommandRunner
    {
        private const string MyDriveHubName = "\uB0B4 \uB4DC\uB77C\uC774\uBE0C";
        private const string SharedDriveHubName = "\uACF5\uC720 \uBB38\uC11C\uD568";

        public static CommandResult Run(
            bool preferPendingTargets,
            List<string> pendingTargets,
            DesktopConfig config,
            string driveRootPath,
            Func<string, CommandResult> runCommand)
        {
            if (!preferPendingTargets)
            {
                return runCommand("sync-configured");
            }

            List<string> targets = BuildTargetSyncPaths(pendingTargets, config, driveRootPath);
            if (targets.Count == 0)
            {
                return runCommand("sync-configured");
            }

            CommandResult targeted = RunTargetedSyncCommands(targets, runCommand);
            if (targeted.ExitCode == 0)
            {
                return targeted;
            }

            CommandResult fallback = runCommand("sync-configured");
            return new CommandResult(
                fallback.ExitCode,
                (targeted.Output + Environment.NewLine + Environment.NewLine +
                 "fallback sync-configured:" + Environment.NewLine +
                 fallback.Output).Trim());
        }

        private static List<string> BuildTargetSyncPaths(
            List<string> pendingTargets,
            DesktopConfig config,
            string driveRootPath)
        {
            List<string> targets = new List<string>();
            if (pendingTargets == null || pendingTargets.Count == 0 || pendingTargets.Count > 24)
            {
                return targets;
            }

            HashSet<string> seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (string rawPath in pendingTargets)
            {
                if (String.IsNullOrWhiteSpace(rawPath))
                {
                    continue;
                }

                string path;
                try
                {
                    path = Path.GetFullPath(rawPath);
                }
                catch
                {
                    continue;
                }

                string target = ResolvePendingChangeSyncTarget(config, driveRootPath, path);
                if (String.IsNullOrWhiteSpace(target))
                {
                    return new List<string>();
                }

                string key = target.TrimEnd('\\');
                if (!seen.Add(key))
                {
                    continue;
                }
                targets.Add(target);
                if (targets.Count > 12)
                {
                    return new List<string>();
                }
            }
            return targets;
        }

        private static string ResolvePendingChangeSyncTarget(
            DesktopConfig config,
            string driveRootPath,
            string path)
        {
            if (String.IsNullOrWhiteSpace(path))
            {
                return "";
            }

            if (PathIsInsideOrSame(driveRootPath, path))
            {
                string myDriveHubPath = Path.Combine(driveRootPath, MyDriveHubName);
                string sharedDriveHubPath = Path.Combine(driveRootPath, SharedDriveHubName);

                if (PathIsInsideOrSame(sharedDriveHubPath, path))
                {
                    string ownerPath = FirstChildPathUnder(sharedDriveHubPath, path);
                    return String.IsNullOrWhiteSpace(ownerPath) ? sharedDriveHubPath : ownerPath;
                }

                if (PathIsInsideOrSame(myDriveHubPath, path))
                {
                    return myDriveHubPath;
                }

                return driveRootPath;
            }

            if (config == null || config.SyncFolders == null)
            {
                return "";
            }

            foreach (SyncFolderConfig folder in config.SyncFolders)
            {
                if (folder == null || !folder.Enabled || String.IsNullOrWhiteSpace(folder.LocalPath))
                {
                    continue;
                }
                if (PathIsInsideOrSame(folder.LocalPath, path))
                {
                    return Path.GetFullPath(folder.LocalPath);
                }
            }

            return "";
        }

        public static bool PathIsInsideOrSame(string root, string path)
        {
            if (String.IsNullOrWhiteSpace(root) || String.IsNullOrWhiteSpace(path))
            {
                return false;
            }

            try
            {
                string fullRoot = Path.GetFullPath(root).TrimEnd('\\');
                string fullPath = Path.GetFullPath(path).TrimEnd('\\');
                if (fullPath.Equals(fullRoot, StringComparison.OrdinalIgnoreCase))
                {
                    return true;
                }
                return fullPath.StartsWith(fullRoot + "\\", StringComparison.OrdinalIgnoreCase);
            }
            catch
            {
                return false;
            }
        }

        private static string FirstChildPathUnder(string root, string path)
        {
            try
            {
                string fullRoot = Path.GetFullPath(root).TrimEnd('\\') + "\\";
                string fullPath = Path.GetFullPath(path).TrimEnd('\\');
                if (!fullPath.StartsWith(fullRoot, StringComparison.OrdinalIgnoreCase))
                {
                    return "";
                }

                string relative = fullPath.Substring(fullRoot.Length).Trim('\\');
                if (String.IsNullOrWhiteSpace(relative))
                {
                    return "";
                }

                string firstSegment = relative.Split(new[] { '\\' }, StringSplitOptions.RemoveEmptyEntries).FirstOrDefault();
                return String.IsNullOrWhiteSpace(firstSegment) ? "" : Path.Combine(root, firstSegment);
            }
            catch
            {
                return "";
            }
        }

        private static CommandResult RunTargetedSyncCommands(
            List<string> targets,
            Func<string, CommandResult> runCommand)
        {
            StringBuilder output = new StringBuilder();
            int exitCode = 0;

            foreach (string target in targets)
            {
                CommandResult result = runCommand("sync-target --target " + DesktopProcessRunner.Quote(target));
                output.AppendLine("target sync: " + target);
                if (!String.IsNullOrWhiteSpace(result.Output))
                {
                    output.AppendLine(result.Output.Trim());
                }
                if (result.ExitCode != 0)
                {
                    exitCode = result.ExitCode;
                    break;
                }
            }

            return new CommandResult(exitCode, output.ToString().Trim());
        }
    }
}
