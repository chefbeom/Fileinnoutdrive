import argparse
import base64
import json
import os
from pathlib import Path
import secrets
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request


ROOT = Path(__file__).resolve().parents[3]
DEPLOY_DIR = ROOT / "deploy" / "two-vm"
PYTHON = Path(sys.executable)


def emit(text):
    if not text:
        return
    text = text.rstrip()
    if not text:
        return
    try:
        print(text, flush=True)
    except UnicodeEncodeError:
        sys.stdout.buffer.write(text.encode("utf-8", errors="replace") + b"\n")
        sys.stdout.flush()


def run(command, *, cwd=ROOT, env=None, timeout=600, check=True):
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
        emit(completed.stdout)
    if check and completed.returncode != 0:
        raise RuntimeError(f"command failed ({completed.returncode}): {printable}")
    return completed


def docker_compose_args(project_name, compose_file, env_file):
    return [
        "docker",
        "compose",
        "--project-name",
        project_name,
        "-f",
        str(compose_file),
        "--env-file",
        str(env_file),
    ]


def powershell_command():
    return shutil.which("powershell") or shutil.which("pwsh")


def env_text(values):
    return "\n".join(f"{key}={value}" for key, value in values.items()) + "\n"


def jwt_key():
    return base64.urlsafe_b64encode(secrets.token_bytes(32)).decode("ascii").rstrip("=")


def shared_recipient_email(args):
    return args.shared_recipient_email


def shared_recipient_password(args):
    return args.shared_recipient_password


def generated_secret(label):
    return f"{label}-{secrets.token_urlsafe(24)}"


def ensure_local_secrets(args):
    if not args.minio_image_tag or args.minio_image_tag.strip().lower() == "latest":
        raise RuntimeError("Set FILEINNOUT_LOCAL_MINIO_IMAGE_TAG or --minio-image-tag to an explicit non-latest MinIO release tag.")
    if not args.admin_password:
        args.admin_password = generated_secret("local-admin")
    if not args.db_password:
        args.db_password = generated_secret("local-db")
    if not args.minio_secret_key:
        args.minio_secret_key = generated_secret("local-minio")


def ensure_shared_recipient(args):
    if not (args.shared_e2e or args.admin_only_shared_e2e):
        return
    if not args.shared_recipient_email:
        args.shared_recipient_email = f"local-shared-{int(time.time())}@fileinnout.local"
    if not args.shared_recipient_password:
        args.shared_recipient_password = generated_secret("local-shared")


def write_smoke_env(args):
    admin_password = args.admin_password
    db_password = args.db_password
    minio_access_key = args.minio_access_key or "fileinnoutlocal"
    minio_secret_key = args.minio_secret_key
    prefix = args.container_prefix
    dependency_host = args.dependency_host

    vm152_env_path = DEPLOY_DIR / ".env.vm152.local-smoke"
    vm151_env_path = DEPLOY_DIR / ".env.vm151.local-smoke"

    vm152_env = {
        "FILEINNOUT_CONTAINER_PREFIX": prefix,
        "VM152_SERVICE_ENV_FILE": "./.env.vm152.local-smoke",
        "VM152_NETWORK_NAME": f"{prefix}-vm152",
        "VM152_REDIS_HOST_PORT": args.redis_port,
        "VM152_DB_HOST_PORT": args.db_port,
        "VM152_MINIO_HOST_PORT": args.minio_port,
        "VM152_MINIO_CONSOLE_HOST_PORT": args.minio_console_port,
        "VM152_WEBSOCKET_HOST_PORT": args.websocket_port,
        "MINIO_IMAGE_TAG": args.minio_image_tag,
        "PORT": "1234",
        "HOST": "0.0.0.0",
        "REDIS_NAME": "redis",
        "REDIS_HOST": dependency_host,
        "REDIS_PORT": args.redis_port,
        "REDIS_SENTINEL_MASTER": "",
        "REDIS_SENTINEL_NODES": "",
        "REDIS_PASSWORD": "",
        "BACKEND_HOST": dependency_host,
        "BACKEND_PORT": args.backend_port,
        "YJS_REDIS_PREFIX": "wafflebear:yjs:local-smoke",
        "YJS_SNAPSHOT_SAVE_DELAY_MS": "150",
        "DB_PASS": db_password,
        "MINIO_NAME": minio_access_key,
        "MINIO_SECRET": minio_secret_key,
    }

    vm151_env = {
        "FILEINNOUT_CONTAINER_PREFIX": prefix,
        "VM151_SERVICE_ENV_FILE": "./.env.vm151.local-smoke",
        "VM151_NETWORK_NAME": f"{prefix}-vm151",
        "VM151_BACKEND_HOST_PORT": args.backend_port,
        "VM151_FRONTEND_HOST_PORT": args.frontend_port,
        "APP_VERSION": "local-docker-smoke",
        "PORTONE_SECRET": "",
        "JWT_KEY": jwt_key(),
        "JWT_EXPIRE": "86400000",
        "ADMIN_EMAIL": args.admin_email,
        "ADMIN_NAME": "Administrator",
        "ADMIN_ROLE": "ROLE_ADMIN",
        "ADMIN_PASSWORD": admin_password,
        "ADMIN_ADDITIONAL_USERS": (
            f"{shared_recipient_email(args)}|LocalSharedAdmin|{shared_recipient_password(args)}"
            if args.admin_only_shared_e2e else ""
        ),
        "APP_FRONTEND_URL": f"http://localhost:{args.frontend_port}",
        "APP_BACKEND_URL": f"http://localhost:{args.backend_port}/api",
        "APP_SECURE_COOKIE": "false",
        "APP_ADMIN_ONLY": "false" if args.shared_e2e else "true",
        "APP_HEALTH_EXPOSE_VERSION": "false",
        "APP_HEALTH_PUBLIC_TEST_VERSION": "false",
        "REALTIME_UPSTREAM": f"{dependency_host}:{args.websocket_port}",
        "DB_SERVER": "org.mariadb.jdbc.Driver",
        "DB_URL": f"jdbc:mariadb://{dependency_host}:{args.db_port}/web",
        "DB_ID": "root",
        "DB_PASS": db_password,
        "REDIS_HOST": dependency_host,
        "REDIS_PORT": args.redis_port,
        "REDIS_SENTINEL_MASTER": "",
        "REDIS_SENTINEL_NODES": "",
        "REDIS_PASSWORD": "",
        "GOOGLE_CLIENT_ID": "disabled",
        "GOOGLE_CLIENT_SECRET": "disabled",
        "NAVER_CLIENT_ID": "disabled",
        "NAVER_CLIENT_SECRET": "disabled",
        "KAKAO_CLIENT_ID": "disabled",
        "KAKAO_CLIENT_SECRET": "disabled",
        "CLIENT_ID": "disabled",
        "CLIENT_SECRET": "disabled",
        "MAIL_PORT": "587",
        "MAIL_ID": "",
        "MAIL_PASS": "",
        "STORAGE_PROVIDER": "minio",
        "MINIO_API": f"http://{dependency_host}:{args.minio_port}",
        "MINIO_PUBLIC_API": f"http://localhost:{args.minio_port}",
        "MINIO_NAME": minio_access_key,
        "MINIO_SECRET": minio_secret_key,
        "MINIO_CLOUD_BUCKET": "fileinnout-smoke",
        "MINIO_WORKSPACE_BUCKET": "fileinnout-workspace-smoke",
        "MINIO_REGION": "ap-northeast-2",
        "S3AMAZON_API": "https://s3.ap-northeast-2.amazonaws.com",
        "S3AMAZON_PUBLIC_API": "https://s3.ap-northeast-2.amazonaws.com",
        "S3AMAZON_NAME": "",
        "S3AMAZON_SECRET": "",
        "S3AMAZON_CLOUD_BUCKET": "",
        "S3AMAZON_WORKSPACE_BUCKET": "",
        "S3AMAZON_REGION": "ap-northeast-2",
    }

    vm152_env_path.write_text(env_text(vm152_env), encoding="utf-8")
    vm151_env_path.write_text(env_text(vm151_env), encoding="utf-8")
    return vm151_env_path, vm152_env_path, admin_password


def wait_url(url, *, timeout_seconds=180, expected=(200,)):
    deadline = time.monotonic() + timeout_seconds
    last_error = None
    while time.monotonic() < deadline:
        try:
            request = urllib.request.Request(url, method="GET")
            with urllib.request.urlopen(request, timeout=8) as response:
                if response.status in expected:
                    print(f"PASS wait {url}", flush=True)
                    return
                last_error = f"status {response.status}"
        except urllib.error.HTTPError as error:
            if error.code in expected:
                print(f"PASS wait {url}", flush=True)
                return
            last_error = f"HTTP {error.code}"
        except Exception as error:
            last_error = str(error)
        time.sleep(3)
    raise RuntimeError(f"timed out waiting for {url}: {last_error}")


def compose_up(project, compose_file, env_file, *, build):
    command = docker_compose_args(project, compose_file, env_file)
    command.extend(["up", "-d"])
    if build:
        command.append("--build")
    run(command, timeout=1800)


def compose_down(project, compose_file, env_file):
    command = docker_compose_args(project, compose_file, env_file)
    command.extend(["down", "-v", "--remove-orphans"])
    run(command, timeout=600, check=False)


def compose_logs(project, compose_file, env_file):
    command = docker_compose_args(project, compose_file, env_file)
    command.extend(["logs", "--tail=160"])
    run(command, timeout=120, check=False)


def verify_admin_only(args, admin_password):
    run([
        PYTHON,
        "deploy/two-vm/tools/verify_admin_only.py",
        "--base-url",
        f"http://localhost:{args.backend_port}/api",
        "--frontend-url",
        f"http://localhost:{args.frontend_port}",
        "--yjs-url",
        f"http://localhost:{args.frontend_port}/wss/statusz",
        "--admin-email",
        args.admin_email,
        "--admin-password",
        admin_password,
    ], timeout=300)


def verify_installed_desktop_sync(args, admin_password):
    if args.skip_installed_desktop_smoke:
        print("PASS installed desktop live sync skipped", flush=True)
        return

    shell = powershell_command()
    if not shell:
        raise RuntimeError("PowerShell was not found for installed desktop live sync smoke")

    base_url = f"http://localhost:{args.backend_port}/api"
    installer = ROOT / "desktop-client" / "install-windows.ps1"

    with tempfile.TemporaryDirectory(prefix="fileinnout-installed-live-") as temp:
        temp_root = Path(temp)
        install_dir = temp_root / "install"
        owner_root = temp_root / "owner"
        mirror_root = temp_root / "mirror"
        local_app_data = temp_root / "localappdata"
        app_data = temp_root / "appdata"
        task_name = f"FileInNOutDesktopLiveVerify-{secrets.token_hex(8)}"
        registry_name = f"FileInNOutDesktopLiveVerify-{secrets.token_hex(8)}"

        env = os.environ.copy()
        env["LOCALAPPDATA"] = str(local_app_data)
        env["APPDATA"] = str(app_data)

        run([
            shell,
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            installer,
            "-InstallDir",
            install_dir,
            "-SyncDir",
            owner_root,
            "-Server",
            base_url,
            "-Email",
            args.admin_email,
            "-Password",
            admin_password,
            "-PythonExe",
            PYTHON,
            "-Configure",
            "-NoStartMenuShortcuts",
            "-NoRegisterApp",
            "-TaskName",
            task_name,
            "-RegistryKeyName",
            registry_name,
        ], env=env, timeout=180)

        cmd_path = install_dir / "fileinnout-desktop.cmd"
        if not cmd_path.is_file():
            raise RuntimeError(f"installed desktop command is missing: {cmd_path}")

        stamp = time.strftime("%Y%m%d%H%M%S")
        folder_name = f"installed-live-{stamp}"
        folder = owner_root / folder_name
        folder.mkdir(parents=True)
        expected = "installed desktop live sync smoke\n"
        (folder / "installed.txt").write_text(expected, encoding="utf-8")

        run(["cmd", "/c", cmd_path, "sync", "--dir", owner_root], env=env, timeout=300)
        mirror_root.mkdir()
        run(["cmd", "/c", cmd_path, "init", "--dir", mirror_root], env=env, timeout=120)
        run(["cmd", "/c", cmd_path, "pull", "--dir", mirror_root], env=env, timeout=300)

        mirrored_file = mirror_root / folder_name / "installed.txt"
        if not mirrored_file.is_file():
            raise RuntimeError("installed desktop pull did not download uploaded smoke file")
        actual = mirrored_file.read_text(encoding="utf-8")
        if actual != expected:
            raise RuntimeError(f"installed desktop pull content mismatch: {actual!r}")

        shutil.rmtree(folder)
        run(["cmd", "/c", cmd_path, "sync", "--dir", owner_root], env=env, timeout=300)
        run(["cmd", "/c", cmd_path, "pull", "--dir", mirror_root], env=env, timeout=300)
        if (mirror_root / folder_name).exists():
            raise RuntimeError("installed desktop pull did not remove deleted smoke folder")

        uninstaller = install_dir / "uninstall-windows.ps1"
        if uninstaller.is_file():
            run([
                shell,
                "-ExecutionPolicy",
                "Bypass",
                "-File",
                uninstaller,
                "-InstallDir",
                install_dir,
                "-SyncDir",
                owner_root,
                "-TaskName",
                task_name,
                "-RegistryKeyName",
                registry_name,
            ], env=env, timeout=180, check=False)

        print("PASS installed desktop live sync upload/pull/delete", flush=True)


def request_json(method, url, *, body=None, token=None, expected=(200, 201, 204)):
    data = None
    headers = {}
    if token:
        headers["Authorization"] = "Bearer " + token
    if body is not None:
        data = json.dumps(body, ensure_ascii=False).encode("utf-8")
        headers["Content-Type"] = "application/json"

    request = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            payload = response.read()
            if response.status not in expected:
                raise RuntimeError(f"{method} {url} status {response.status}: {payload!r}")
            if not payload:
                return None
            text = payload.decode("utf-8", errors="replace")
            try:
                return json.loads(text)
            except json.JSONDecodeError:
                return text
    except urllib.error.HTTPError as error:
        payload = error.read().decode("utf-8", errors="replace")
        if error.code in expected:
            return payload
        raise RuntimeError(f"{method} {url} HTTP {error.code}: {payload}") from error


def login_token(base_url, email, password):
    data = request_json("POST", f"{base_url}/login", body={"email": email, "password": password})
    if not isinstance(data, dict) or not data.get("accessToken"):
        raise RuntimeError(f"login did not return an access token for {email}")
    return data["accessToken"]


def fetch_verify_token(args, email, db_password):
    escaped = email.replace("'", "''")
    sql = (
        "SELECT token FROM email_verify "
        f"WHERE email='{escaped}' "
        "ORDER BY expiry_date DESC LIMIT 1;"
    )
    completed = subprocess.run(
        [
            "docker",
            "exec",
            f"{args.container_prefix}-mariadb",
            "mariadb",
            "-uroot",
            f"-p{db_password}",
            "-N",
            "-B",
            "web",
            "-e",
            sql,
        ],
        cwd=ROOT,
        text=True,
        encoding="utf-8",
        errors="replace",
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        timeout=60,
    )
    if completed.returncode != 0:
        emit(completed.stdout)
        raise RuntimeError(f"failed to fetch verification token for {email}")

    token = completed.stdout.strip().splitlines()
    if not token:
        raise RuntimeError(f"no verification token found for {email}")
    return token[-1].strip()


def verify_shared_e2e(args, admin_password, db_password):
    base_url = f"http://localhost:{args.backend_port}/api"
    recipient_email = shared_recipient_email(args)
    recipient_password = shared_recipient_password(args)

    if args.admin_only_shared_e2e:
        login_token(base_url, recipient_email, recipient_password)
        print(f"PASS local shared admin bootstrap/login - {recipient_email}", flush=True)
        request_json("POST", f"{base_url}/user/signup", body={
            "email": f"blocked-shared-{int(time.time())}@fileinnout.local",
            "name": "Blocked Shared User",
            "password": generated_secret("blocked-share"),
        }, expected=(403,))
        print("PASS admin-only signup blocked during shared E2E", flush=True)
    else:
        request_json("POST", f"{base_url}/user/signup", body={
            "email": recipient_email,
            "name": "Local Shared User",
            "password": recipient_password,
        })
        verify_token = fetch_verify_token(args, recipient_email, db_password)
        request_json("GET", f"{base_url}/user/verify?token={urllib.parse.quote(verify_token, safe='')}")
        login_token(base_url, recipient_email, recipient_password)
        print(f"PASS local shared recipient signup/login - {recipient_email}", flush=True)

    run([
        PYTHON,
        "desktop-client/verify_live_desktop_sync.py",
        "--server",
        base_url,
        "--owner-email",
        args.admin_email,
        "--owner-password",
        admin_password,
        "--recipient-email",
        recipient_email,
        "--recipient-password",
        recipient_password,
    ], timeout=600)


def parse_args():
    parser = argparse.ArgumentParser(description="Run a local Docker smoke test for the two-VM FileInNOut stack.")
    parser.add_argument("--backend-port", default="18080")
    parser.add_argument("--frontend-port", default="18081")
    parser.add_argument("--db-port", default="13306")
    parser.add_argument("--redis-port", default="16379")
    parser.add_argument("--minio-port", default="19000")
    parser.add_argument("--minio-console-port", default="19001")
    parser.add_argument("--websocket-port", default="21234")
    parser.add_argument("--dependency-host", default="host.docker.internal")
    parser.add_argument("--container-prefix", default="fileinnout-smoke")
    parser.add_argument("--admin-email", default="admin@fileinnout.local")
    parser.add_argument("--admin-password", default=os.environ.get("FILEINNOUT_LOCAL_ADMIN_PASSWORD", ""))
    parser.add_argument("--db-password", default=os.environ.get("FILEINNOUT_LOCAL_DB_PASSWORD", ""))
    parser.add_argument("--minio-access-key", default=os.environ.get("FILEINNOUT_LOCAL_MINIO_ACCESS_KEY", ""))
    parser.add_argument("--minio-secret-key", default=os.environ.get("FILEINNOUT_LOCAL_MINIO_SECRET_KEY", ""))
    parser.add_argument("--minio-image-tag", default=os.environ.get("FILEINNOUT_LOCAL_MINIO_IMAGE_TAG", ""))
    parser.add_argument("--shared-e2e", action="store_true", help="Run the stack with signups enabled and verify live desktop shared-folder E2E.")
    parser.add_argument(
        "--admin-only-shared-e2e",
        action="store_true",
        help="Run APP_ADMIN_ONLY=true with a bootstrapped second admin and verify live desktop shared-folder E2E.",
    )
    parser.add_argument("--shared-recipient-email", default=os.environ.get("FILEINNOUT_LOCAL_SHARED_RECIPIENT_EMAIL", ""))
    parser.add_argument("--shared-recipient-password", default=os.environ.get("FILEINNOUT_LOCAL_SHARED_RECIPIENT_PASSWORD", ""))
    parser.add_argument("--skip-installed-desktop-smoke", action="store_true", help="Skip live sync through the installed Windows desktop command.")
    parser.add_argument("--skip-build", action="store_true")
    parser.add_argument("--keep-running", action="store_true")
    return parser.parse_args()


def main():
    args = parse_args()
    if args.shared_e2e and args.admin_only_shared_e2e:
        raise RuntimeError("--shared-e2e cannot be combined with --admin-only-shared-e2e.")
    ensure_local_secrets(args)
    ensure_shared_recipient(args)

    vm151_env, vm152_env, admin_password = write_smoke_env(args)
    db_password = args.db_password
    vm151_project = f"{args.container_prefix}-vm151"
    vm152_project = f"{args.container_prefix}-vm152"
    vm151_compose = DEPLOY_DIR / "docker-compose.vm151.yml"
    vm152_compose = DEPLOY_DIR / "docker-compose.vm152.yml"

    try:
        compose_down(vm151_project, vm151_compose, vm151_env)
        compose_down(vm152_project, vm152_compose, vm152_env)

        compose_up(vm152_project, vm152_compose, vm152_env, build=not args.skip_build)
        wait_url(f"http://localhost:{args.minio_port}/minio/health/live", timeout_seconds=120)
        wait_url(f"http://localhost:{args.websocket_port}/readyz", timeout_seconds=180)

        compose_up(vm151_project, vm151_compose, vm151_env, build=not args.skip_build)
        wait_url(f"http://localhost:{args.backend_port}/api/actuator/health", timeout_seconds=240)
        wait_url(f"http://localhost:{args.frontend_port}", timeout_seconds=120)
        wait_url(f"http://localhost:{args.frontend_port}/wss/statusz", timeout_seconds=120)

        if args.admin_only_shared_e2e:
            verify_admin_only(args, admin_password)
            verify_installed_desktop_sync(args, admin_password)
            verify_shared_e2e(args, admin_password, db_password)
            print("DONE local docker admin-only shared-folder E2E verification", flush=True)
        elif args.shared_e2e:
            verify_installed_desktop_sync(args, admin_password)
            verify_shared_e2e(args, admin_password, db_password)
            print("DONE local docker shared-folder E2E verification", flush=True)
        else:
            verify_admin_only(args, admin_password)
            verify_installed_desktop_sync(args, admin_password)
            print("DONE local docker smoke verification", flush=True)
    except Exception:
        compose_logs(vm151_project, vm151_compose, vm151_env)
        compose_logs(vm152_project, vm152_compose, vm152_env)
        raise
    finally:
        if args.keep_running:
            print(f"KEEP running. Admin password: {admin_password}", flush=True)
            print(f"Frontend: http://localhost:{args.frontend_port}", flush=True)
            print(f"Backend: http://localhost:{args.backend_port}/api", flush=True)
        else:
            compose_down(vm151_project, vm151_compose, vm151_env)
            compose_down(vm152_project, vm152_compose, vm152_env)
            vm151_env.unlink(missing_ok=True)
            vm152_env.unlink(missing_ok=True)


if __name__ == "__main__":
    try:
        main()
    except RuntimeError as error:
        print(f"FAIL {error}", flush=True)
        raise SystemExit(1) from error
