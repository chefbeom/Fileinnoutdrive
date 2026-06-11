# Two-VM deployment

This directory is for the VMware split requested for this project.

- VM 151: `192.168.35.151`, backend and frontend
- VM 152: `192.168.35.152`, MariaDB, Redis, MinIO, and Yjs realtime gateway

Run from the repository root on each VM:

```bash
docker compose -f deploy/two-vm/docker-compose.vm152.yml --env-file deploy/two-vm/.env.vm152 up -d --build
```

```bash
docker compose -f deploy/two-vm/docker-compose.vm151.yml --env-file deploy/two-vm/.env.vm151 up -d --build
```

Expected public endpoints:

- Frontend: `http://192.168.35.151`
- Backend health: `http://192.168.35.151/api/test/version`
- Yjs/realtime status through frontend: `http://192.168.35.151/wss/statusz`
- MinIO console: `http://192.168.35.152:9001`

## Remote deploy from Windows

The helper below packages the current repository, uploads it to both VMs, writes
runtime env files remotely, installs Docker if needed, and starts the split
compose stacks.

```powershell
$env:VM_PASSWORD="<vm-password>"
python deploy/two-vm/tools/remote_deploy.py
```

To deploy and immediately run the admin-only launch verifier, including the
desktop upload/pull/delete smoke, use:

```powershell
$env:VM_PASSWORD="<vm-password>"
python deploy/two-vm/tools/remote_deploy.py --verify-admin-only --verify-diagnostics-on-fail
```

If your VMware addresses differ from the defaults, pass them explicitly. The
generated env files and frontend realtime proxy will use the supplied values:

```powershell
$env:VM_PASSWORD="<vm-password>"
python deploy/two-vm/tools/remote_deploy.py --vm151 192.168.35.161 --vm152 192.168.35.162
```

The two-VM deployment defaults to admin-only mode:

- `APP_ADMIN_ONLY=true`
- admin email: `admin@fileinnout.local`
- admin password: the value of `FILEINNOUT_ADMIN_PASSWORD`, or `VM_PASSWORD`
- optional extra admins: set `FILEINNOUT_ADMIN_ADDITIONAL_USERS` or
  `ADMIN_ADDITIONAL_USERS` as `email|name|password;email2|password2`

To verify live shared folders in admin-only mode during deployment, set the
same extra admin as both a bootstrapped user and verification recipient:

```powershell
$env:FILEINNOUT_ADMIN_ADDITIONAL_USERS="teammate@fileinnout.local|TeamAdmin|<team-admin-password>"
$env:FILEINNOUT_SHARED_ADMIN_EMAIL="teammate@fileinnout.local"
$env:FILEINNOUT_SHARED_ADMIN_PASSWORD="<team-admin-password>"
python deploy/two-vm/tools/remote_deploy.py --verify-admin-only --verify-diagnostics-on-fail
```

`MINIO_API` is the backend's object-storage endpoint. `MINIO_PUBLIC_API` is
used only for presigned upload/download URLs returned to browsers and the
desktop client. In the default VMware layout both point to
`http://192.168.35.152:9000`; the local Docker smoke intentionally uses
different values so the backend can reach MinIO from inside Docker while the
desktop verifier receives a host-reachable `localhost` URL.

## Verification

For the full launch gate, follow
[`LAUNCH_CHECKLIST.md`](./LAUNCH_CHECKLIST.md).

Before deploying or after changing code, run the local launch-readiness checks
from the repository root. This verifies Python scripts, desktop offline sync,
Windows package creation/verification, and both two-VM compose files:

```powershell
python deploy/two-vm/tools/verify_launch_readiness.py
```

To include the local Docker shared-folder desktop E2E in the same admin-only
mode used by the default deployment, run:

```powershell
python deploy/two-vm/tools/verify_launch_readiness.py --include-admin-only-shared-e2e --smoke-skip-build
```

When Docker Desktop is available, run the local Docker smoke before VMware. It
starts both compose stacks on high local ports, verifies backend/frontend/Yjs
health, verifies admin-only login, and runs the desktop upload/pull/delete
smoke through both `verify_admin_only.py` and the installed
`fileinnout-desktop.cmd` command:

```powershell
python deploy/two-vm/tools/verify_local_docker_smoke.py
```

To verify the Google-Drive-style shared folder workflow before VMware while
keeping admin-only login enabled, run the local smoke in admin-only shared E2E
mode. It starts a fresh local stack, bootstraps a second admin account through
`ADMIN_ADDITIONAL_USERS`, confirms signup is still blocked, and runs
`desktop-client/verify_live_desktop_sync.py` against the live local backend.
It also verifies upload/pull/delete through the installed desktop command:

```powershell
python deploy/two-vm/tools/verify_local_docker_smoke.py --admin-only-shared-e2e --skip-build
```

For a non-admin recipient compatibility check, use `--shared-e2e`; that mode
temporarily starts the local stack with signups enabled only for verification.

The smoke test writes ignored temporary `.env.vm151.local-smoke` and
`.env.vm152.local-smoke` files and tears the containers down unless
`--keep-running` is passed.

Use `--skip-docker`, `--skip-powershell`, or `--skip-package` only when that
toolchain is intentionally unavailable on the current machine.

After deployment, run the admin-only verifier from the repository root. It
checks frontend/backend/realtime health, verifies admin login, verifies the
admin dashboard, confirms signup and OAuth routes are blocked, and runs an
admin desktop sync upload/pull/delete smoke test against the live backend.

```powershell
$env:VM_PASSWORD="<vm-password>"
python deploy/two-vm/tools/verify_admin_only.py
```

To include live shared-folder desktop E2E between two admin accounts, add:

```powershell
python deploy/two-vm/tools/verify_admin_only.py `
  --shared-admin-email teammate@fileinnout.local `
  --shared-admin-password "<team-admin-password>"
```

Use `--skip-desktop-sync` only when you want to verify the web/backend surface
without exercising the desktop client.

If verification fails and you want immediate VM context, add
`--diagnostics-on-fail`. The verifier will SSH into both VMs and print Docker
status, compose status, local health probes, and recent container logs:

```powershell
$env:VM_PASSWORD="<vm-password>"
python deploy/two-vm/tools/verify_admin_only.py --diagnostics-on-fail
```

If you deployed with custom VM addresses or a custom remote root, pass the same
values to the verifier, or set `FILEINNOUT_VM151`, `FILEINNOUT_VM152`, and
`FILEINNOUT_REMOTE_ROOT`.

For non-admin internal multi-user smoke testing, temporarily run with
`FILEINNOUT_ADMIN_ONLY=false` and use `verify_two_vm.py`. That verifier also
runs a writable shared-folder desktop sync E2E with the admin and generated
test user unless `--skip-desktop-sync` is passed.

## Desktop sync client

After the frontend/backend VM is reachable, install the desktop client on a
Windows desktop:

```powershell
powershell -ExecutionPolicy Bypass -File .\desktop-client\package-windows.ps1
powershell -ExecutionPolicy Bypass -File .\desktop-client\verify_windows_package.ps1
```

Copy the generated `desktop-client\dist\FileInNOutDesktop-*.zip` to the Windows
desktop, extract it, then run. Add `-PythonExe C:\Path\To\python.exe` if Python
is installed but not on `PATH`:

```powershell
powershell -ExecutionPolicy Bypass -File .\install-windows.ps1 `
  -Configure `
  -SyncDir C:\FileInNOut `
  -Server http://192.168.35.151/api `
  -Email admin@fileinnout.local `
  -InstallStartupTask `
  -StartNow
```

Add `-Password "<admin-password>"` for non-interactive installation. Otherwise
the installer prompts during login. The startup entry is named
`FileInNOutDesktopSync`; it uses a scheduled task when permitted and falls back
to a current-user Startup shortcut with a hidden `wscript.exe` watcher launcher
if Task Scheduler registration is denied. Watcher logs are written under
`%LOCALAPPDATA%\FileInNOutDesktop\logs\watch.log`.
The installer also creates a `FileInNOut Desktop` Start Menu folder for opening
the sync folder, running sync now, running diagnostics, and uninstalling. It
also registers `FileInNOut Desktop` under the current user's Windows installed
apps list.

To clean up a test desktop, run:

```powershell
powershell -ExecutionPolicy Bypass -File "$env:LOCALAPPDATA\FileInNOutDesktop\uninstall-windows.ps1"
```

The default uninstall removes the installed client, startup entry, Start Menu
shortcuts, and installed-app registration while keeping the sync folder and saved
config. Add `-RemoveConfig -RemoveSyncDir` only when the local test data should
be removed too.

Folder sharing is recursive. To share an existing synced folder:

```powershell
%LOCALAPPDATA%\FileInNOutDesktop\fileinnout-desktop.cmd push
%LOCALAPPDATA%\FileInNOutDesktop\fileinnout-desktop.cmd share --path TeamFolder --email teammate@example.com --permission WRITE
```

For a new local folder, add `--push-first` to upload it before sharing. Repeat
`--email` or use comma-separated addresses for multiple recipients.

After a previous sync, deleting local files or folders moves matching owned or
writable shared cloud items to trash. Remote deletions from another synced
desktop are removed locally on the next pull when the local copy still matches
the last synced state. Concurrent local and remote edits are preserved with a
`name (conflict YYYYMMDD-HHMMSS).ext` local copy instead of silently
overwriting the newer remote file.
Common local-only temporary files are ignored, including Office `~$*` locks,
partial browser downloads, and `.tmp`/`.part`/`.swp` files.

For a live shared-folder desktop E2E test, temporarily run with
`FILEINNOUT_ADMIN_ONLY=false` or use two existing login-capable users:

```powershell
python .\desktop-client\verify_live_desktop_sync.py `
  --server http://192.168.35.151/api `
  --owner-email owner@example.com `
  --owner-password "<owner-password>" `
  --recipient-email recipient@example.com `
  --recipient-password "<recipient-password>"
```

The live desktop verifier checks writable shared upload/delete round trips,
owner-created post-share child inheritance, and read-only shared folder
write/delete blocking.
