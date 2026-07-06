# FileInNOut Desktop Launch Checklist

Use this checklist before calling the desktop sync feature launch-ready on
VMware. The goal is to prove the cloud drive, Windows desktop install, and
folder sharing behavior with real commands.

## 1. Local Readiness

Run from the repository root on the build machine:

```powershell
python deploy/two-vm/tools/verify_launch_readiness.py
```

For a stronger local gate that also runs the shared-folder desktop E2E under
the default admin-only deployment mode:

```powershell
python deploy/two-vm/tools/verify_launch_readiness.py --include-admin-only-shared-e2e --smoke-skip-build
```

Required result:

- Python scripts compile.
- Desktop offline sync verification passes.
- Windows desktop package is created, manifest checksums are verified, and the
  install/uninstall smoke test passes.
- VM151 and VM152 compose files render with `docker compose config`.
- VM152 compose receives an explicit `MINIO_IMAGE_TAG`; `latest` is not allowed.

Optional but recommended local Docker smoke:

```powershell
python deploy/two-vm/tools/verify_local_docker_smoke.py
```

Required result:

- VM152 data/realtime containers start on high local ports.
- VM151 backend/frontend containers start on high local ports.
- Backend, frontend, and `/wss/statusz` health checks pass.
- Admin login works with admin-only mode enabled.
- Admin desktop sync upload, pull, and delete smoke test passes.
- Installed `fileinnout-desktop.cmd` upload, pull, and delete smoke test
  passes against the live local backend.
- The script generates per-run random local admin, database, MinIO, and shared
  recipient secrets when they are not supplied explicitly.
- The MinIO image tag is supplied through `FILEINNOUT_LOCAL_MINIO_IMAGE_TAG` or `--minio-image-tag`.
- The script tears down the local smoke containers and volumes unless
  `--keep-running` is passed.

Optional admin-only shared-folder local Docker E2E:

```powershell
python deploy/two-vm/tools/verify_local_docker_smoke.py --admin-only-shared-e2e --skip-build
```

Required result:

- The stack starts with `APP_ADMIN_ONLY=true`.
- A second admin is bootstrapped with `ADMIN_ADDITIONAL_USERS` and can log in.
- Signup remains blocked during the shared-folder verification.
- Installed `fileinnout-desktop.cmd` live upload/pull/delete smoke passes.
- Desktop shared folder WRITE pull/upload/delete round trips pass.
- Desktop shared folder READ write/new-file/delete blocking and restore pass.

For non-admin recipient compatibility only, run
`python deploy/two-vm/tools/verify_local_docker_smoke.py --shared-e2e --skip-build`;
that mode temporarily enables signup for the local test stack.

## 2. Two-VM Deployment

Default VMware layout:

- VM151: backend and frontend, default `192.168.35.151`
- VM152: MariaDB, Redis, MinIO, Yjs gateway, default `192.168.35.152`

Deploy from Windows:

```powershell
$env:VM_PASSWORD="<vm-password>"
python deploy/two-vm/tools/remote_deploy.py
```

Deploy and verify in one pass:

```powershell
$env:VM_PASSWORD="<vm-password>"
python deploy/two-vm/tools/remote_deploy.py --verify-admin-only --verify-diagnostics-on-fail
```

Deploy and verify admin-only shared folders in one pass:

```powershell
$env:VM_PASSWORD="<vm-password>"
$env:FILEINNOUT_ADMIN_ADDITIONAL_USERS="teammate@fileinnout.local|TeamAdmin|<team-admin-password>"
$env:FILEINNOUT_SHARED_ADMIN_EMAIL="teammate@fileinnout.local"
$env:FILEINNOUT_SHARED_ADMIN_PASSWORD="<team-admin-password>"
python deploy/two-vm/tools/remote_deploy.py --verify-admin-only --verify-diagnostics-on-fail
```

If your VM IPs differ:

```powershell
$env:VM_PASSWORD="<vm-password>"
python deploy/two-vm/tools/remote_deploy.py --vm151 <backend-frontend-ip> --vm152 <data-realtime-ip>
```

Required result:

- VM151 exposes `http://<vm151>`.
- VM151 backend health responds at `http://<vm151>/api/actuator/health`.
- VM151 proxies Yjs status at `http://<vm151>/wss/statusz`.
- VM152 exposes MinIO console at `http://<vm152>:9001`.
- VM151 env sets `MINIO_PUBLIC_API=http://<vm152>:9000` so desktop presigned
  uploads and downloads are reachable outside Docker.

## 3. Admin-Only Verification

The default deployment runs with `APP_ADMIN_ONLY=true`. Verify the live system:

```powershell
$env:VM_PASSWORD="<vm-password>"
python deploy/two-vm/tools/verify_admin_only.py
```

Required result:

- Frontend, backend, and realtime health checks pass.
- Admin login works.
- Admin dashboard loads.
- Signup and OAuth routes are blocked.
- Admin desktop sync upload, pull, and delete smoke test passes.
- When `--shared-admin-email` and `--shared-admin-password` are set, WRITE and
  READ shared-folder desktop E2E passes between two admin accounts.

If this fails, rerun with diagnostics:

```powershell
$env:VM_PASSWORD="<vm-password>"
python deploy/two-vm/tools/verify_admin_only.py --diagnostics-on-fail
```

## 4. Windows Desktop Install

Create the release zip:

```powershell
powershell -ExecutionPolicy Bypass -File .\desktop-client\package-windows.ps1
powershell -ExecutionPolicy Bypass -File .\desktop-client\verify_windows_package.ps1
```

Install on a Windows desktop:

```powershell
powershell -ExecutionPolicy Bypass -File .\install-windows.ps1 `
  -Configure `
  -SyncDir C:\FileInNOut `
  -Server http://<vm151>/api `
  -Email admin@fileinnout.local `
  -InstallStartupTask `
  -StartNow
```

Use `-Password "<admin-password>"` for unattended setup, or omit it to prompt.
Use `-PythonExe C:\Path\To\python.exe` if Python is installed but not on
`PATH`.

Required result:

- `%LOCALAPPDATA%\FileInNOutDesktop\fileinnout-desktop.cmd` exists.
- `%LOCALAPPDATA%\FileInNOutDesktop\uninstall-windows.ps1` exists.
- `C:\FileInNOut` exists.
- The `FileInNOut Desktop` Start Menu shortcuts exist for opening the sync
  folder, syncing now, diagnostics, and uninstall.
- `FileInNOut Desktop` is registered in the current user's Windows installed
  apps list.
- `FileInNOutDesktopSync` logon startup entry is registered when requested.
- Package verification creates and removes a unique temporary logon startup
  entry, using scheduled task registration or hidden Startup shortcut fallback.
- `%LOCALAPPDATA%\FileInNOutDesktop\logs\watch.log` is the watcher log path.

Run local diagnostics:

```powershell
%LOCALAPPDATA%\FileInNOutDesktop\fileinnout-desktop.cmd doctor --local-only
```

After login, run:

```powershell
%LOCALAPPDATA%\FileInNOutDesktop\fileinnout-desktop.cmd doctor
```

Verify cleanup on a disposable desktop or test user:

```powershell
powershell -ExecutionPolicy Bypass -File "$env:LOCALAPPDATA\FileInNOutDesktop\uninstall-windows.ps1"
```

Required result:

- `fileinnout-desktop.cmd`, `fileinnout-watch.cmd`, and the copied client
  script are removed.
- The `FileInNOut Desktop` Start Menu shortcut folder is removed.
- The current-user installed-app registration is removed.
- The startup entry is removed if present.
- The sync folder and config remain unless `-RemoveSyncDir` or `-RemoveConfig`
  is explicitly passed.

## 5. Shared Folder Live E2E

This requires two login-capable users. On the default admin-only deployment,
temporarily deploy with `FILEINNOUT_ADMIN_ONLY=false` or use another environment
with two existing users.

```powershell
python .\desktop-client\verify_live_desktop_sync.py `
  --server http://<vm151>/api `
  --owner-email owner@example.com `
  --owner-password "<owner-password>" `
  --recipient-email recipient@example.com `
  --recipient-password "<recipient-password>"
```

Required result:

- Owner-created folder is uploaded and shared.
- Recipient pulls shared folder under `Shared/<owner-email>/`.
- Owner-created post-share children are inherited by the shared folder.
- WRITE recipient upload appears in the owner cloud folder.
- WRITE recipient deletion moves the owner cloud item to trash and disappears
  on owner pull.
- READ shared folder blocks recipient local file edits, local new files, and
  local deletes from reaching the cloud.
- READ shared folder can be restored by pull from the remote source.
- Cleanup removes the test folders from both desktops.

## Launch Acceptance

Treat the feature as launch-ready only when:

- Local readiness passes.
- VMware deployment succeeds.
- Admin-only verification passes without `--skip-desktop-sync`.
- Windows package verification passes, including manifest SHA-256 checks and
  install/uninstall smoke verification.
- At least one installed Windows desktop can run `doctor` and `sync`.
- Shared folder live E2E passes for WRITE and READ permissions.
- Any failed verification has been rerun with diagnostics and the cause has
  been fixed.
