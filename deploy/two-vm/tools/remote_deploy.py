import argparse
import base64
import os
from pathlib import Path
import secrets
import shlex
import subprocess
import sys
import tarfile
import tempfile
import time


ROOT = Path(__file__).resolve().parents[3]
DEFAULT_REMOTE_ROOT = "/home/test/fileinnout"
REMOTE_ARCHIVE = "/tmp/fileinnout-two-vm.tar.gz"
DEFAULT_VM151 = "192.168.35.151"
DEFAULT_VM152 = "192.168.35.152"
DEFAULT_USER = "test"


EXCLUDES = {
    ".git",
    ".idea",
    "node_modules",
    "dist",
    "build",
    ".gradle",
    "db",
}


def should_exclude(path: Path) -> bool:
    parts = set(path.parts)
    if parts & EXCLUDES:
        return True
    name = path.name
    return (
        name.endswith(".tar")
        or name.endswith(".tar.gz")
        or name in {".env", ".env.vm151", ".env.vm152"}
    )


def make_jwt_key() -> str:
    return base64.urlsafe_b64encode(secrets.token_bytes(32)).decode().rstrip("=")


def env_text(items: dict[str, str]) -> str:
    return "\n".join(f"{key}={value}" for key, value in items.items()) + "\n"


def build_env_files(default_secret: str, vm151_host: str, vm152_host: str) -> tuple[str, str, str]:
    jwt_key = os.environ.get("FILEINNOUT_JWT_KEY") or make_jwt_key()
    db_pass = os.environ.get("FILEINNOUT_DB_PASS", default_secret)
    minio_user = os.environ.get("FILEINNOUT_MINIO_USER", "minioadmin")
    minio_secret = os.environ.get("FILEINNOUT_MINIO_SECRET", default_secret)
    admin_password = os.environ.get("FILEINNOUT_ADMIN_PASSWORD", default_secret)

    vm151_env = {
        "APP_VERSION": "two-vm-local",
        "PORTONE_SECRET": os.environ.get("FILEINNOUT_PORTONE_SECRET", ""),
        "JWT_KEY": jwt_key,
        "JWT_EXPIRE": "86400000",
        "ADMIN_EMAIL": os.environ.get("FILEINNOUT_ADMIN_EMAIL", "admin@fileinnout.local"),
        "ADMIN_NAME": os.environ.get("FILEINNOUT_ADMIN_NAME", "Administrator"),
        "ADMIN_ROLE": "ROLE_ADMIN",
        "ADMIN_PASSWORD": admin_password,
        "ADMIN_ADDITIONAL_USERS": os.environ.get("FILEINNOUT_ADMIN_ADDITIONAL_USERS", ""),
        "APP_FRONTEND_URL": f"http://{vm151_host}",
        "APP_BACKEND_URL": f"http://{vm151_host}/api",
        "APP_SECURE_COOKIE": "false",
        "APP_ADMIN_ONLY": os.environ.get("FILEINNOUT_ADMIN_ONLY", "true"),
        "REALTIME_UPSTREAM": f"{vm152_host}:1234",
        "DB_SERVER": "org.mariadb.jdbc.Driver",
        "DB_URL": f"jdbc:mariadb://{vm152_host}:3306/web",
        "DB_ID": "root",
        "DB_PASS": db_pass,
        "REDIS_HOST": vm152_host,
        "REDIS_PORT": "6379",
        "REDIS_SENTINEL_MASTER": "",
        "REDIS_SENTINEL_NODES": "",
        "REDIS_PASSWORD": "",
        "GOOGLE_CLIENT_ID": os.environ.get("FILEINNOUT_GOOGLE_CLIENT_ID", "dummy-google-client-id"),
        "GOOGLE_CLIENT_SECRET": os.environ.get("FILEINNOUT_GOOGLE_CLIENT_SECRET", "dummy-google-client-secret"),
        "NAVER_CLIENT_ID": os.environ.get("FILEINNOUT_NAVER_CLIENT_ID", "dummy-naver-client-id"),
        "NAVER_CLIENT_SECRET": os.environ.get("FILEINNOUT_NAVER_CLIENT_SECRET", "dummy-naver-client-secret"),
        "CLIENT_ID": os.environ.get("FILEINNOUT_KAKAO_CLIENT_ID", "dummy-kakao-client-id"),
        "CLIENT_SECRET": os.environ.get("FILEINNOUT_KAKAO_CLIENT_SECRET", "dummy-kakao-client-secret"),
        "MAIL_PORT": os.environ.get("FILEINNOUT_MAIL_PORT", "587"),
        "MAIL_ID": os.environ.get("FILEINNOUT_MAIL_ID", ""),
        "MAIL_PASS": os.environ.get("FILEINNOUT_MAIL_PASS", ""),
        "STORAGE_PROVIDER": "minio",
        "MINIO_API": f"http://{vm152_host}:9000",
        "MINIO_PUBLIC_API": f"http://{vm152_host}:9000",
        "MINIO_NAME": minio_user,
        "MINIO_SECRET": minio_secret,
        "MINIO_CLOUD_BUCKET": "fileinnout",
        "MINIO_WORKSPACE_BUCKET": "fileinnout-workspace",
        "MINIO_REGION": "ap-northeast-2",
        "S3AMAZON_API": "https://s3.ap-northeast-2.amazonaws.com",
        "S3AMAZON_PUBLIC_API": "https://s3.ap-northeast-2.amazonaws.com",
        "S3AMAZON_NAME": "",
        "S3AMAZON_SECRET": "",
        "S3AMAZON_CLOUD_BUCKET": "",
        "S3AMAZON_WORKSPACE_BUCKET": "",
        "S3AMAZON_REGION": "ap-northeast-2",
    }

    vm152_env = {
        "PORT": "1234",
        "HOST": "0.0.0.0",
        "REDIS_NAME": "redis",
        "REDIS_HOST": vm152_host,
        "REDIS_PORT": "6379",
        "REDIS_SENTINEL_MASTER": "",
        "REDIS_SENTINEL_NODES": "",
        "REDIS_PASSWORD": "",
        "BACKEND_HOST": vm151_host,
        "BACKEND_PORT": "8080",
        "YJS_REDIS_PREFIX": "wafflebear:yjs",
        "YJS_SNAPSHOT_SAVE_DELAY_MS": "150",
        "DB_PASS": db_pass,
        "MINIO_NAME": minio_user,
        "MINIO_SECRET": minio_secret,
    }

    return env_text(vm151_env), env_text(vm152_env), admin_password


def make_archive() -> Path:
    archive_path = Path(tempfile.gettempdir()) / "fileinnout-two-vm.tar.gz"
    if archive_path.exists():
        archive_path.unlink()

    with tarfile.open(archive_path, "w:gz") as archive:
        for path in ROOT.rglob("*"):
            relative = path.relative_to(ROOT)
            if should_exclude(relative):
                continue
            archive.add(path, arcname=str(relative))
    return archive_path


class Remote:
    def __init__(self, host: str, username: str, password: str):
        try:
            import paramiko
        except ImportError as exc:
            raise RuntimeError("paramiko is required for remote deployment. Install paramiko or run on a Python environment that includes it.") from exc

        self.host = host
        self.username = username
        self.password = password
        self.client = paramiko.SSHClient()
        self.client.set_missing_host_key_policy(paramiko.AutoAddPolicy())

    def __enter__(self):
        self.client.connect(
            hostname=self.host,
            username=self.username,
            password=self.password,
            look_for_keys=False,
            allow_agent=False,
            timeout=20,
        )
        return self

    def __exit__(self, exc_type, exc, tb):
        self.client.close()

    def run(self, command: str, timeout: int = 600, sudo: bool = False) -> str:
        if sudo:
            quoted = shlex.quote(command)
            command = f"printf '%s\\n' {shlex.quote(self.password)} | sudo -S bash -lc {quoted}"

        stdin, stdout, stderr = self.client.exec_command(command, timeout=timeout)
        out = stdout.read().decode("utf-8", errors="replace")
        err = stderr.read().decode("utf-8", errors="replace")
        status = stdout.channel.recv_exit_status()
        if status != 0:
            raise RuntimeError(
                f"[{self.host}] command failed ({status}): {command}\nSTDOUT:\n{out}\nSTDERR:\n{err}"
            )
        return out + err

    def upload(self, local: Path, remote: str):
        with self.client.open_sftp() as sftp:
            sftp.put(str(local), remote)

    def write_text(self, remote: str, text: str):
        with self.client.open_sftp() as sftp:
            with sftp.file(remote, "w") as file:
                file.write(text)


def install_docker(remote: Remote):
    print(f"[{remote.host}] ensuring Docker is installed", flush=True)
    compose_version = os.environ.get("DOCKER_COMPOSE_VERSION", "v2.29.7")
    remote.run(
        "if ! command -v docker >/dev/null 2>&1; then "
        "apt-get update && "
        "DEBIAN_FRONTEND=noninteractive apt-get install -y docker.io curl ca-certificates; "
        "fi; "
        "if ! docker compose version >/dev/null 2>&1; then "
        "mkdir -p /usr/local/lib/docker/cli-plugins && "
        f"curl -fsSL https://github.com/docker/compose/releases/download/{compose_version}/docker-compose-linux-x86_64 "
        "-o /usr/local/lib/docker/cli-plugins/docker-compose && "
        "chmod +x /usr/local/lib/docker/cli-plugins/docker-compose; "
        "fi; "
        "systemctl enable --now docker; "
        f"usermod -aG docker {shlex.quote(remote.username)} || true; "
        "docker --version; docker compose version",
        timeout=900,
        sudo=True,
    )


def deploy_project(remote: Remote, archive: Path, remote_root: str, env_name: str, env_text_value: str):
    print(f"[{remote.host}] uploading project archive", flush=True)
    remote.run(f"rm -rf {shlex.quote(remote_root)} && mkdir -p {shlex.quote(remote_root)}")
    remote.upload(archive, REMOTE_ARCHIVE)
    remote.run(
        f"tar -xzf {shlex.quote(REMOTE_ARCHIVE)} -C {shlex.quote(remote_root)} && "
        f"mkdir -p {shlex.quote(remote_root)}/deploy/two-vm"
    )
    remote.write_text(f"{remote_root}/deploy/two-vm/{env_name}", env_text_value)


def compose_up(remote: Remote, remote_root: str, compose_file: str, env_file: str):
    print(f"[{remote.host}] starting {compose_file}", flush=True)
    remote.run(
        f"cd {shlex.quote(remote_root)} && "
        f"docker compose -f {shlex.quote(compose_file)} --env-file {shlex.quote(env_file)} up -d --build",
        timeout=2400,
        sudo=True,
    )


def check(remote: Remote, command: str, timeout: int = 300, sudo: bool = False):
    print(f"[{remote.host}] check: {command}", flush=True)
    output = remote.run(command, timeout=timeout, sudo=sudo)
    print(output.strip(), flush=True)


def run_admin_only_verification(args, admin_password: str):
    command = [
        sys.executable,
        "deploy/two-vm/tools/verify_admin_only.py",
        "--base-url",
        f"http://{args.vm151}/api",
        "--frontend-url",
        f"http://{args.vm151}",
        "--yjs-url",
        f"http://{args.vm151}/wss/statusz",
        "--admin-email",
        os.environ.get("FILEINNOUT_ADMIN_EMAIL", "admin@fileinnout.local"),
        "--admin-password",
        admin_password,
        "--vm151",
        args.vm151,
        "--vm152",
        args.vm152,
        "--ssh-user",
        args.username,
        "--ssh-password",
        args.password,
        "--remote-root",
        args.remote_root,
    ]
    shared_admin_email = os.environ.get("FILEINNOUT_SHARED_ADMIN_EMAIL", "")
    shared_admin_password = os.environ.get("FILEINNOUT_SHARED_ADMIN_PASSWORD", "")
    if shared_admin_email:
        command.extend(["--shared-admin-email", shared_admin_email])
        command.extend(["--shared-admin-password", shared_admin_password])
    if args.verify_diagnostics_on_fail:
        command.append("--diagnostics-on-fail")
    if args.verify_skip_desktop_sync:
        command.append("--skip-desktop-sync")

    print("running admin-only verification", flush=True)
    completed = subprocess.run(
        command,
        cwd=ROOT,
        text=True,
        encoding="utf-8",
        errors="replace",
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        timeout=900,
    )
    if completed.stdout:
        print(completed.stdout.rstrip(), flush=True)
    if completed.returncode != 0:
        raise RuntimeError(f"admin-only verification failed ({completed.returncode})")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--username", default=DEFAULT_USER)
    parser.add_argument("--password", default=os.environ.get("VM_PASSWORD"))
    parser.add_argument("--vm151", default=os.environ.get("FILEINNOUT_VM151", DEFAULT_VM151), help="Backend/frontend VM host or IP.")
    parser.add_argument("--vm152", default=os.environ.get("FILEINNOUT_VM152", DEFAULT_VM152), help="Data/realtime VM host or IP.")
    parser.add_argument("--remote-root", default=os.environ.get("FILEINNOUT_REMOTE_ROOT", DEFAULT_REMOTE_ROOT))
    parser.add_argument("--skip-install", action="store_true")
    parser.add_argument("--deploy-only", action="store_true")
    parser.add_argument("--verify-admin-only", action="store_true", help="Run verify_admin_only.py after deployment and basic health checks.")
    parser.add_argument("--verify-diagnostics-on-fail", action="store_true", help="Pass --diagnostics-on-fail to admin-only verification.")
    parser.add_argument("--verify-skip-desktop-sync", action="store_true", help="Skip desktop sync inside post-deploy admin-only verification.")
    args = parser.parse_args()

    if not args.password:
        raise SystemExit("Set VM_PASSWORD or pass --password.")
    if args.deploy_only and args.verify_admin_only:
        raise SystemExit("--deploy-only cannot be combined with --verify-admin-only.")

    archive = make_archive()
    vm151_env, vm152_env, admin_password = build_env_files(args.password, args.vm151, args.vm152)

    with Remote(args.vm152, args.username, args.password) as vm152, Remote(args.vm151, args.username, args.password) as vm151:
        if not args.skip_install:
            install_docker(vm152)
            install_docker(vm151)

        deploy_project(vm152, archive, args.remote_root, ".env.vm152", vm152_env)
        deploy_project(vm151, archive, args.remote_root, ".env.vm151", vm151_env)

        compose_up(vm152, args.remote_root, "deploy/two-vm/docker-compose.vm152.yml", "deploy/two-vm/.env.vm152")
        compose_up(vm151, args.remote_root, "deploy/two-vm/docker-compose.vm151.yml", "deploy/two-vm/.env.vm151")

        if not args.deploy_only:
            time.sleep(20)
            check(vm152, "docker ps --format 'table {{.Names}}\\t{{.Status}}\\t{{.Ports}}'", sudo=True)
            check(vm151, "docker ps --format 'table {{.Names}}\\t{{.Status}}\\t{{.Ports}}'", sudo=True)
            check(vm152, "curl -fsS http://localhost:1234/statusz")
            check(vm151, "curl -fsS http://localhost:8080/api/test/version")
            check(vm151, "curl -fsSI http://localhost | head -n 5")

        if args.verify_admin_only:
            run_admin_only_verification(args, admin_password)


if __name__ == "__main__":
    main()
