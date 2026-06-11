# FileInNOut Desktop Client

This is the launchable desktop sync client for FileInNOut. It syncs configured
cloud folders with normal Windows folders and runs from the Windows notification
tray with a blue folder icon.

## Install on Windows

```powershell
powershell -ExecutionPolicy Bypass -File .\desktop-client\install-windows.ps1
```

The web setup executable opens a small installer with a progress bar and a
desktop-shortcut choice. After installation, `FileInNOut Desktop` runs in the
Windows tray. Double-click the blue folder tray icon to open settings and
management.

The installer copies the client to:

```text
%LOCALAPPDATA%\FileInNOutDesktop
```

Login and sync-folder settings are saved in:

```text
%LOCALAPPDATA%\FileInNOutDesktop\config.json
```

To create a release zip for a Windows VM or desktop:

```powershell
powershell -ExecutionPolicy Bypass -File .\desktop-client\package-windows.ps1
powershell -ExecutionPolicy Bypass -File .\desktop-client\verify_windows_package.ps1
```

To create the web-downloadable desktop ZIP:

```powershell
$env:FILEINNOUT_PYTHON_RUNTIME="C:\Path\To\PortablePython"
powershell -ExecutionPolicy Bypass -File .\desktop-client\package-windows-exe.ps1
```

The downloadable ZIP is written to
`frontend\public\downloads\FileInNOutDesktop.zip` and also copied to a
versioned `FileInNOutDesktop-<version>.zip` file. The frontend download button
uses the versioned ZIP path to avoid stale browser downloads that still point
at the old EXE installer route. The server also serves that legacy EXE route as
a ZIP download, so direct or cached old links no longer download an EXE file.
This public ZIP contains
`FileInNOutDesktopSetup.exe` and a short README. The setup executable is also
generated under `desktop-client\dist\` for local verification. When a Python
runtime is bundled, the installer copies it into
`%LOCALAPPDATA%\FileInNOutDesktop\python-runtime` and the installed command
works even when Python is not installed on `PATH`.

Explorer "sync now" actions write their CLI result to the desktop context log
and show a localized success or failure dialog instead of finishing silently.

The Explorer drive view prunes empty shared-owner folders after the last shared
folder from that owner is removed or disabled, while preserving any user-created
content.

Start Menu shortcuts for opening the FileInNOut drive call the desktop app's
dynamic open-drive command, so they follow the current configured drive letter
after a runtime remap instead of opening a stale install-time path.
If that letter is unavailable, the command maps the next available FileInNOut
drive letter and saves it before opening Explorer.
It also creates the `My Drive` and `Shared` hub folders and reapplies Explorer
folder branding even when the tray app is not already running.
Configured sync folders are relinked into those hubs on open as well, so the
drive view does not appear empty after launching from Start Menu alone.
The Python command path also refreshes those hub junctions during local drive
preparation, so sync, share, and open-web actions keep the Explorer drive view
aligned with the current multi-folder configuration.
If an expected hub link is blocked by an empty regular folder, the installer,
tray app, and command path replace that empty folder with the correct junction;
folders with user content are preserved and reported by diagnostics.
If an older config only has `syncDir`, that folder is treated as the default
My Drive folder and linked into the drive view with the same folder name during
install and runtime refresh.

Shared folders received with WRITE permission can be shared onward from the
desktop app and Explorer context flow. READ-only received folders remain
view-only and cannot be re-shared.

Opening a shared-owner folder such as `공유 문서함\owner@example.com` from
Explorer now sends the web app a `Shared/owner@example.com` desktop path, so the
shared library focuses the same owner scope instead of treating it as a loose
search label.

The internal package zip written under `desktop-client\dist\` contains the
installer script, uninstaller, client script, install smoke verifier, README,
and manifest. The manifest records each packaged file's SHA-256 checksum and
byte size. Package verification checks those hashes, then runs the installer in
temporary directories and checks that the generated command wrapper can execute
`--help` and `init`. It also verifies Start Menu shortcuts, current-user
installed-app registration, logon startup entry creation, and uninstall cleanup
while preserving the sync folder and config by default. Extract the internal zip
on the Windows desktop, then run:

If Python is installed but not on `PATH`, pass
`-PythonPath C:\Path\To\python.exe` to `verify_windows_package.ps1`.

```powershell
powershell -ExecutionPolicy Bypass -File .\install-windows.ps1
```

If Python is installed but not on `PATH`, pass the absolute interpreter path to
the installer:

```powershell
powershell -ExecutionPolicy Bypass -File .\install-windows.ps1 -PythonExe C:\Path\To\python.exe
```

One-command setup is also available. It installs the client, registers it in
Windows installed apps for the current user, creates Start Menu shortcuts,
saves the sync folder, logs in, creates a Windows logon startup entry for the
tray app, and starts FileInNOut Desktop now:

```powershell
powershell -ExecutionPolicy Bypass -File .\desktop-client\install-windows.ps1 `
  -Configure `
  -SyncDir C:\FileInNOut `
  -Server http://192.168.35.151/api `
  -Email admin@fileinnout.local `
  -PythonExe C:\Path\To\python.exe `
  -InstallStartupTask `
  -StartNow `
  -CreateDesktopShortcut
```

Add `-Password "<password>"` for unattended setup. Without it, the login step
prompts for a password.

The installer creates a `FileInNOut Desktop` Start Menu folder with shortcuts to
open the tray settings app, open the sync folder, run `sync`, run
`doctor --local-only`, and uninstall the client. Pass
`-NoStartMenuShortcuts` to skip those shortcuts.
It also registers `FileInNOut Desktop` under the current user's Windows
installed apps list. Pass `-NoRegisterApp` to skip that registration.

## Tray app

After installation, look for the blue FileInNOut folder icon in the Windows
notification tray.

- Double-click the icon to open FileInNOut Desktop settings.
- Use `Open sync folder` to open the configured local folder.
- Use `Sync now` to immediately upload local changes and download cloud changes.
- Use `Open FileInNOut web` to jump to the web app.
- In File Explorer, right-click a synced file or folder and use `FileInNOut`
  to sync that target, open it on the web, copy its web link, or check status.
- Use `Pause sync` / `Resume sync` from the tray menu or the settings header to
  stop or restart background syncing. `Sync now` still runs a manual sync.
- Toggle `Auto sync` to keep syncing every 20 seconds and after local folder changes.
- Toggle `Notifications` to show sync result notifications. Automatic sync
  stays quiet when there were no file changes, so a healthy idle folder does
  not raise a toast every 20 seconds.

The settings window hides the raw server URL from normal users. It opens with a
soft blue FileInNOut login screen when signed out, then shows saved user info,
drive capacity, configured sync folders, sync direction, sharing controls,
current status, diagnostics, recent sync activity, and combined local/cloud
search across configured sync folders and shared cloud folders. The sync
folder list shows each folder's live state and shared permission, including
normal, pending local changes, missing folders, and sync errors. Explorer
folder tooltips also include the shared owner and permission when available.
The activity panel surfaces sync
issues first; conflict copies can be double-clicked to reveal them in Explorer.

## Uninstall on Windows

The installer copies an uninstaller into the install directory:

```powershell
powershell -ExecutionPolicy Bypass -File "$env:LOCALAPPDATA\FileInNOutDesktop\uninstall-windows.ps1"
```

By default this removes the command wrappers, client script, and startup task
while keeping the saved config and sync folder. To remove all local app config
and the initialized sync folder too:

```powershell
powershell -ExecutionPolicy Bypass -File "$env:LOCALAPPDATA\FileInNOutDesktop\uninstall-windows.ps1" -RemoveConfig -RemoveSyncDir
```

`-RemoveSyncDir` refuses to delete a folder unless it contains
`.fileinnout\state.json`.

## Login

Use the backend URL directly. In the two-VM deployment this is normally:

```powershell
%LOCALAPPDATA%\FileInNOutDesktop\fileinnout-desktop.cmd login --server http://192.168.35.151/api --email admin@fileinnout.local
```

## Create a local sync folder

```powershell
mkdir C:\FileInNOut
%LOCALAPPDATA%\FileInNOutDesktop\fileinnout-desktop.cmd init --dir C:\FileInNOut
```

After `init`, the sync folder is saved in the user config. Later commands can
omit `--dir`.

## Sync once

```powershell
%LOCALAPPDATA%\FileInNOutDesktop\fileinnout-desktop.cmd sync-configured
```

Check local sync-folder state without contacting the backend:

```powershell
%LOCALAPPDATA%\FileInNOutDesktop\fileinnout-desktop.cmd status --local-only
```

For a fuller local diagnostic report, use:

```powershell
%LOCALAPPDATA%\FileInNOutDesktop\fileinnout-desktop.cmd doctor --local-only
```

This also works before `init`; in that case it reports the missing sync-folder
configuration instead of failing. After login, omit `--local-only` to also
verify backend health and remote file list access.

## Keep syncing

```powershell
%LOCALAPPDATA%\FileInNOutDesktop\fileinnout-desktop.cmd watch-configured --interval 20
```

The installer can create a Windows logon task for this watcher:

```powershell
powershell -ExecutionPolicy Bypass -File .\desktop-client\install-windows.ps1 `
  -SyncDir C:\FileInNOut `
  -InstallStartupTask
```

## Share a folder

The desktop UI can share a configured sync folder directly. From the command
line, first put or create a folder inside the sync directory and push it:

```powershell
%LOCALAPPDATA%\FileInNOutDesktop\fileinnout-desktop.cmd push
```

Then share by relative path:

```powershell
%LOCALAPPDATA%\FileInNOutDesktop\fileinnout-desktop.cmd share --path TeamFolder --email teammate@example.com --permission WRITE
```

For a newly created local folder, `--push-first` uploads it before sharing:

```powershell
%LOCALAPPDATA%\FileInNOutDesktop\fileinnout-desktop.cmd share --path TeamFolder --email teammate@example.com --permission WRITE --push-first
```

Repeat `--email` or use comma-separated addresses to share with multiple
recipients in one command.

Windows Explorer also gets a `FileInNOut > Share...` context menu during
installation. Right-click a configured sync file or folder, enter recipient
emails, choose a permission (`READ`, `DOWNLOAD`, `UPLOAD`, or `WRITE`), and the
desktop client syncs the selected item first if needed before sharing it.
Explorer also includes `FileInNOut > Add sync folder` for ordinary local
folders. It adds the selected folder to the configured sync-folder list, starts
an immediate best-effort sync when the user is logged in, and wakes the tray app
so the new folder appears in the desktop UI. Explorer context actions use
Korean success/failure feedback for copy-link, share, add-sync-folder, and
status dialogs, and the context runner enables delayed expansion so selected
paths and result files are passed reliably.

Folder sharing is recursive on the backend: sharing a folder shares the folder,
all current children, and later children created under that folder. Recipients
can pull shared items under:

```text
C:\FileInNOut\Shared\<owner-email>\
```

If the folder was shared with `--permission WRITE`, recipients can add files and
folders inside that shared tree. The desktop client uploads those changes back
to the owner's cloud folder.

## Current behavior

- Local files are uploaded with the same presigned upload flow as the web app.
- Remote files are downloaded through authenticated backend download endpoints.
- The desktop client saves the refresh token issued at login. If a sync request
  receives HTTP 401 because the short-lived access token expired, the client
  reissues tokens through `/auth/reissue`, saves the new tokens, and retries the
  original request automatically.
- The backend stores refresh tokens per login session instead of overwriting by
  email, so web login and one or more desktop logins for the same account do not
  invalidate one another.
- `sync-configured` only syncs configured folder mappings instead of pulling the
  whole cloud drive. Each mapping can be `two-way`, `upload`, or `download`.
- When an old full-drive state file is reused with a new folder mapping, the
  local state is reset for that mapping so existing local files are not mistaken
  for cloud deletions.
- Common local-only temporary files are ignored, including Office lock files
  like `~$draft.docx`, partial browser downloads like `.crdownload`, and
  transient `.tmp`/`.part`/`.swp` files.
- Desktop watcher events from `.fileinnout` state files and temporary download
  files are ignored so the app does not immediately re-sync because of its own
  sync metadata.
- The tray status list uses millisecond local file signatures when available,
  matching the sync engine so rapid same-second edits still show as pending.
- Remote files and folders removed by another desktop are removed locally on the
  next pull when the local copy still matches the last synced state.
- Existing remote files with the same path are moved to trash before a changed
  local copy is uploaded.
- If both the local file and the matching remote file changed since the last
  sync, the local edit is preserved as `name (conflict YYYYMMDD-HHMMSS).ext`
  and the original path is restored to the current remote version.
- Files and folders deleted locally after a previous sync are moved to trash on
  the cloud drive when the remote item still matches the last synced item.
- Shared folders with `READ` or `DOWNLOAD` permission are treated as
  read-only locally. The client skips local writes/deletes for those shares and
  marks downloaded files with the local read-only attribute after sync. If a
  local program bypasses that attribute, the next pull restores the cloud copy
  or removes unauthorized local-only content for non-downloadable shares.
- Shared folders with `WRITE` permission accept recipient-created files and
  folders. When a file with the same name exists in the target shared folder,
  the backend moves the previous file record to trash and stores the new copy.
- Concurrent edits inside writable shared folders use the same conflict-copy
  behavior, so a recipient never silently overwrites another user's newer
  remote version.
- Files and folders deleted inside writable shared folders are moved to trash
  in the owner's cloud drive.
- `install-windows.ps1 -InstallStartupTask` registers `FileInNOutDesktopSync`
  so Windows starts the watcher at logon. It uses a scheduled task when
  permitted, and falls back to a current-user Startup folder shortcut that runs
  a hidden `wscript.exe` watcher launcher when Task Scheduler registration is
  denied. Logs are written to
  `%LOCALAPPDATA%\FileInNOutDesktop\logs\watch.log`.
- The tray app keeps the 20-second full safety sync, but file-system watcher
  events first run `sync-target` for the changed Explorer scope. Multiple
  events inside the same configured folder, `내 드라이브`, `공유 문서함`, or a
  `공유 문서함\<owner-email>` hub are coalesced into one targeted sync. If a
  deleted or moved path can no longer be resolved, it falls back to
  `sync-configured`.
- `install-windows.ps1` creates Start Menu shortcuts by default so users can
  open the sync folder, sync now, run diagnostics, or uninstall without
  remembering the command path.
- `install-windows.ps1` registers the app under the current user's installed
  apps list, and `uninstall-windows.ps1` removes that registration.
- Explorer `desktop.ini` metadata is refreshed as files change and after sync
  runs, so configured sync folders expose their current status and cloud path
  in the folder description/tooltip.
- Folders created or dropped directly into the FileInNOut drive root or the
  `내 드라이브` hub are adopted as configured sync folders before the client
  contacts the server, so the local folder mapping is preserved even if the
  user needs to log in again or the backend is temporarily unreachable.
- Shared sync folders are exposed under `공유 문서함\<owner-email>\...` in the
  FileInNOut drive, matching the cloud path structure and keeping multiple
  shared folders with the same display name understandable in Explorer.
- Opening configured folders or local search results prefers the FileInNOut
  drive hub path, including nested files and folders, so Explorer keeps the
  drive-shaped view instead of jumping back to the underlying storage path.
- Explorer sync/status actions respect drive hub scope: the whole drive
  targets every enabled folder, `내 드라이브` targets owned folders, `공유 문서함`
  targets shared folders, and `공유 문서함\<owner-email>` targets only that
  owner's shared folders.
- Nested paths under those hubs inherit the same scope, so a direct target such
  as `내 드라이브\New Folder\file.txt` or
  `공유 문서함\owner@example.com\Manual Folder\file.txt` still resolves to the
  right owned/shared sync set before falling back to a full configured sync.
- Explorer web/share actions re-resolve drive-root targets after local
  adoption, so a newly created drive-root folder opens and shares as its
  adopted cloud folder instead of a loose fallback target.
- Explorer folder info tips prioritize actionable sync issues such as errors,
  failed downloads, and conflict checks before routine pending local changes.
- `pull`, `push`, `sync`, `sync-configured`, `watch`, and `watch-configured`
  use `.fileinnout\sync.lock` so only one sync process can mutate a sync folder
  at a time. `status` prints the current lock state.
- File watchers use a larger Windows watcher buffer and fall back to a full
  configured-folder sync if watcher events overflow, so bulk Explorer changes
  are reconciled even when individual events are missed.
- The latest sync success/error state is stored in `.fileinnout\state.json` as
  `syncStatus` and is shown by `status`.
- Per-file download failures are tracked separately as `downloadFailed` so the
  tray can show retryable download issues without labeling them as local
  conflicts.
- `doctor` prints install/config paths, sync-folder state, lock state, latest
  sync status, watcher log path, stricter drive readiness checks, hub link
  consistency, drive-root items waiting for adoption, shared-hub manual items,
  and optional backend connectivity checks.

## Live verification

Use `verify_live_desktop_sync.py` against a running backend with two
login-capable users. Admin-only deployments should temporarily run with
`FILEINNOUT_ADMIN_ONLY=false` or use two already-login-capable accounts.

```powershell
python .\desktop-client\verify_live_desktop_sync.py `
  --server http://192.168.35.151/api `
  --owner-email owner@example.com `
  --owner-password "<owner-password>" `
  --recipient-email recipient@example.com `
  --recipient-password "<recipient-password>"
```

The live verifier creates two temporary local sync folders, uploads an owner
folder, shares it as `WRITE`, verifies recipient pull, verifies owner-created
post-share child inheritance, verifies recipient upload into the shared folder,
verifies owner pull, verifies shared deletion round trip, verifies that a
`READ` shared folder blocks recipient local writes/deletes, then cleans up the
test folders.
