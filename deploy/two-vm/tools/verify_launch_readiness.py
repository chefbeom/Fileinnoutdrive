import argparse
import os
from pathlib import Path
import shutil
import subprocess
import sys


ROOT = Path(__file__).resolve().parents[3]
PYTHON = Path(sys.executable)


def run(command, *, cwd=ROOT, env=None, timeout=None):
    printable = " ".join(str(part) for part in command)
    print(f"RUN {printable}", flush=True)
    completed = subprocess.run(
        [str(part) for part in command],
        cwd=cwd,
        env=env,
        text=True,
        encoding="utf-8",
        errors="replace",
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        timeout=timeout,
    )
    if completed.stdout:
        print(completed.stdout.rstrip(), flush=True)
    if completed.returncode != 0:
        raise RuntimeError(f"command failed ({completed.returncode}): {printable}")
    return completed.stdout or ""


def powershell_command():
    return shutil.which("powershell") or shutil.which("pwsh")


def docker_command():
    return shutil.which("docker")


def verify_python():
    files = [
        "desktop-client/fileinnout_desktop.py",
        "desktop-client/verify_desktop_client.py",
        "desktop-client/verify_live_desktop_sync.py",
        "deploy/two-vm/tools/remote_deploy.py",
        "deploy/two-vm/tools/verify_admin_only.py",
        "deploy/two-vm/tools/verify_local_docker_smoke.py",
        "deploy/two-vm/tools/verify_two_vm.py",
        "deploy/two-vm/tools/verify_launch_readiness.py",
    ]
    run([PYTHON, "-m", "py_compile", *files])
    run([PYTHON, "desktop-client/verify_desktop_client.py"])
    run([PYTHON, "deploy/two-vm/tools/remote_deploy.py", "--help"])
    run([PYTHON, "deploy/two-vm/tools/verify_admin_only.py", "--help"])
    run([PYTHON, "deploy/two-vm/tools/verify_local_docker_smoke.py", "--help"])
    run([PYTHON, "deploy/two-vm/tools/verify_two_vm.py", "--help"])
    run([PYTHON, "desktop-client/verify_live_desktop_sync.py", "--help"])


def verify_powershell(shell):
    parser_script = (
        "$files = @("
        "'desktop-client/install-windows.ps1',"
        "'desktop-client/uninstall-windows.ps1',"
        "'desktop-client/package-windows.ps1',"
        "'desktop-client/package-windows-exe.ps1',"
        "'desktop-client/verify_windows_package.ps1',"
        "'desktop-client/verify_windows_install.ps1'"
        "); "
        "foreach ($file in $files) { "
        "$errors = $null; "
        "[System.Management.Automation.PSParser]::Tokenize((Get-Content -Raw -Path $file), [ref]$errors) | Out-Null; "
        "if ($errors.Count) { $errors | Format-Table -AutoSize | Out-String; exit 1 } "
        "}; "
        "'PowerShell parser ok'"
    )
    run([shell, "-ExecutionPolicy", "Bypass", "-Command", parser_script])
    run([shell, "-ExecutionPolicy", "Bypass", "-File", "desktop-client/package-windows.ps1", "-Version", "readiness"])
    run([
        shell,
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        "desktop-client/verify_windows_package.ps1",
        "-PackagePath",
        "desktop-client/dist/FileInNOutDesktop-readiness.zip",
        "-PythonPath",
        str(PYTHON),
    ])
    exe_env = os.environ.copy()
    exe_env["FILEINNOUT_PYTHON_RUNTIME"] = str(PYTHON.parent)
    run([shell, "-ExecutionPolicy", "Bypass", "-File", "desktop-client/package-windows-exe.ps1", "-Version", "readiness"], env=exe_env)
    run(["desktop-client/dist/FileInNOutDesktopSetup.exe", "--verify"])


def verify_compose(docker):
    compose_env = os.environ.copy()
    compose_env["VM152_SERVICE_ENV_FILE"] = "./env.vm152.example"
    compose_env["VM151_SERVICE_ENV_FILE"] = "./env.vm151.example"
    run(
        [docker, "compose", "-f", "deploy/two-vm/docker-compose.vm152.yml", "--env-file", "deploy/two-vm/env.vm152.example", "config"],
        env=compose_env,
    )
    vm151_config = run(
        [docker, "compose", "-f", "deploy/two-vm/docker-compose.vm151.yml", "--env-file", "deploy/two-vm/env.vm151.example", "config"],
        env=compose_env,
    )
    for required in ("APP_ADMIN_ONLY", "ADMIN_ADDITIONAL_USERS", "MINIO_PUBLIC_API", "S3AMAZON_PUBLIC_API"):
        if required not in vm151_config:
            raise RuntimeError(f"VM151 compose config is missing {required}")


def verify_local_smoke(*, shared_e2e=False, admin_only_shared_e2e=False, skip_build=False):
    command = [PYTHON, "deploy/two-vm/tools/verify_local_docker_smoke.py"]
    if shared_e2e:
        command.append("--shared-e2e")
    if admin_only_shared_e2e:
        command.append("--admin-only-shared-e2e")
    if skip_build:
        command.append("--skip-build")
    run(command, timeout=2400)


def parse_args():
    parser = argparse.ArgumentParser(description="Run local launch-readiness checks for FileInNOut two-VM desktop sync.")
    parser.add_argument("--skip-powershell", action="store_true")
    parser.add_argument("--skip-package", action="store_true", help="Skip Windows zip packaging and package verification.")
    parser.add_argument("--skip-docker", action="store_true", help="Skip docker compose config checks.")
    parser.add_argument("--include-local-smoke", action="store_true", help="Run the admin-only local Docker smoke after compose config checks.")
    parser.add_argument("--include-shared-e2e", action="store_true", help="Run the local Docker shared-folder desktop E2E smoke.")
    parser.add_argument(
        "--include-admin-only-shared-e2e",
        action="store_true",
        help="Run APP_ADMIN_ONLY=true local Docker smoke with bootstrapped second admin and shared-folder desktop E2E.",
    )
    parser.add_argument("--smoke-skip-build", action="store_true", help="Pass --skip-build to included local Docker smoke checks.")
    return parser.parse_args()


def main():
    args = parse_args()
    if args.skip_docker and (args.include_local_smoke or args.include_shared_e2e or args.include_admin_only_shared_e2e):
        raise RuntimeError("--skip-docker cannot be combined with included local smoke checks.")

    verify_python()

    shell = powershell_command()
    if args.skip_powershell:
        print("SKIP PowerShell checks", flush=True)
    elif not shell:
        raise RuntimeError("PowerShell was not found. Pass --skip-powershell to skip Windows script checks.")
    else:
        if args.skip_package:
            parser_script = (
                "$files = @('desktop-client/install-windows.ps1','desktop-client/uninstall-windows.ps1','desktop-client/package-windows.ps1','desktop-client/package-windows-exe.ps1','desktop-client/verify_windows_package.ps1','desktop-client/verify_windows_install.ps1'); "
                "foreach ($file in $files) { $errors = $null; "
                "[System.Management.Automation.PSParser]::Tokenize((Get-Content -Raw -Path $file), [ref]$errors) | Out-Null; "
                "if ($errors.Count) { $errors | Format-Table -AutoSize | Out-String; exit 1 } }; "
                "'PowerShell parser ok'"
            )
            run([shell, "-ExecutionPolicy", "Bypass", "-Command", parser_script])
        else:
            verify_powershell(shell)

    docker = docker_command()
    if args.skip_docker:
        print("SKIP docker compose config checks", flush=True)
    elif not docker:
        raise RuntimeError("Docker was not found. Pass --skip-docker to skip compose config checks.")
    else:
        verify_compose(docker)
        if args.include_local_smoke:
            verify_local_smoke(skip_build=args.smoke_skip_build)
        if args.include_shared_e2e:
            verify_local_smoke(shared_e2e=True, skip_build=args.smoke_skip_build)
        if args.include_admin_only_shared_e2e:
            verify_local_smoke(admin_only_shared_e2e=True, skip_build=args.smoke_skip_build)

    print("DONE launch readiness verification", flush=True)


if __name__ == "__main__":
    try:
        main()
    except RuntimeError as error:
        print(f"FAIL {error}", flush=True)
        raise SystemExit(1)
