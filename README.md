# FileInNOut Drive

FileInNOut Drive는 웹 기반 파일 드라이브, 공유 폴더, 워크스페이스 문서, 관리자 화면, Windows 데스크탑 동기화 클라이언트를 함께 제공하는 파일 관리 프로젝트입니다. 핵심 기능은 파일 업로드와 다운로드, 폴더 관리, 파일 잠금, 공유 권한, 공유 링크 정책, 워크스페이스 협업, 알림, 관리자 운영 기능입니다.

## 주요 기능

- 파일과 폴더 업로드, 다운로드, 이동, 이름 변경, 휴지통, 영구 삭제
- 파일 잠금과 공유 권한 관리
- 공유 링크 만료 시간, 다운로드 제한, 비밀번호 보호
- 워크스페이스 문서와 멤버 역할 관리
- 관리자 사용자, 저장소, 공유, 운영 상태 관리
- MinIO 또는 S3 호환 오브젝트 스토리지 연동
- Redis 기반 세션, 캐시, 실시간 기능 보조
- Windows 데스크탑 클라이언트 기반 로컬 폴더 동기화
- Kubernetes Helm 기반 배포 자료

## 기술 스택

| 영역 | 기술 |
| --- | --- |
| Backend | Java 17, Spring Boot, Spring Security, JPA, Gradle |
| Frontend | Vue 3, Vite, Pinia, Vitest, Playwright |
| Realtime | WebSocket, STOMP, Yjs |
| Storage | MariaDB, Redis, MinIO/S3 호환 스토리지 |
| Desktop | C# tray app, Python sync CLI, PowerShell packaging |
| DevOps | Docker, Helm, Kubernetes, Jenkins |

## 저장소 구조

```text
.
|-- backend/                  Spring Boot backend
|-- frontend/                 Vue/Vite frontend
|-- desktop-client/           Windows desktop tray/sync/installer
|-- devops/                   Docker, Helm, Jenkins deployment sources
|-- deploy/two-vm/            two-VM deployment helpers
|-- docs/                     audit, runbook, user flows, desktop sync design
```

## 아키텍처 개요

```text
Browser / Desktop Client
        |
        v
Frontend SPA ---- WebSocket/Yjs ---- websocket-server
        |
        v
Spring Boot Backend
   |        |        |
   v        v        v
MariaDB   Redis   MinIO/S3
```

## 로컬 개발 준비

필수 도구는 다음과 같습니다.

- JDK 17
- Node.js/npm
- Docker 또는 로컬 MariaDB, Redis, MinIO
- Windows 데스크탑 패키징 작업 시 PowerShell, .NET, Windows 환경

현재 워크스페이스에서는 JDK가 `C:\jdk-17`에 있는 것으로 확인했습니다. PowerShell에서 백엔드 명령을 실행할 때는 다음처럼 지정할 수 있습니다.

```powershell
$env:JAVA_HOME='C:\jdk-17'
$env:Path="$env:JAVA_HOME\bin;$env:Path"
```

## 백엔드 실행

```powershell
cd backend
$env:JAVA_HOME='C:\jdk-17'
$env:Path="$env:JAVA_HOME\bin;$env:Path"
.\gradlew.bat bootRun
```

로컬 DB, Redis, MinIO 값은 `backend/src/main/resources/application-local.yml` 또는 실행 환경 변수로 주입합니다.

## 프론트엔드 실행

```powershell
cd frontend
npm install
npm run dev
```

프론트엔드 API base URL, WebSocket endpoint, 배포 URL은 `.env` 또는 Vite 환경 변수 기준으로 맞춥니다.

## 주요 환경 변수

실제 이름은 `backend/src/main/resources/application.yml`, `application-local.yml`, `application-prod.yml`을 기준으로 확인합니다.

| 분류 | 예시 |
| --- | --- |
| DB | `DB_URL`, `DB_ID`, `DB_PASS`, `DB_SERVER`, `SPRING_FLYWAY_*` |
| Redis | `REDIS_HOST`, `REDIS_PORT`, `REDIS_SENTINEL_MASTER`, `REDIS_SENTINEL_NODES` |
| Storage | `MINIO_*`, `S3AMAZON_*`, `APP_STORAGE_ORPHAN_CLEANUP_*` |
| Security | `JWT_KEY`, OAuth2 client secret, CORS allowlist |
| Cookie | `APP_SECURE_COOKIE`, `APP_COOKIE_SAME_SITE` |
| CORS | `APP_CORS_ALLOWED_ORIGIN_PATTERNS`, `APP_CORS_ALLOW_DEVELOPMENT_ORIGIN_PATTERNS` |
| Docs | `APP_DOCS_PUBLIC_OPENAPI` |

민감 정보는 Git에 커밋하지 않습니다. `.env`, kubeconfig, private values, secret 파일은 공개 저장소에 포함하지 않습니다.

## 검증 명령

프론트엔드 단위 테스트:

```powershell
cd frontend
npm run test:unit
```

프론트엔드 E2E 테스트:

```powershell
cd frontend
npm run test:e2e
```

프론트엔드 빌드:

```powershell
cd frontend
npm run build
```

public 정적 산출물 검증:

```powershell
cd frontend
npm run test:public-assets
```

배포 소스 검증:

```powershell
node devops\scripts\verify-deployment-source.mjs
```

보안 경계 검증:

```powershell
node devops\scripts\verify-security-boundaries.mjs
```

이 검증은 개발용 CORS wildcard, 공개 test version/OpenAPI 기본값, timestamp/pod metadata 노출 회귀를 차단합니다.

스토리지 트랜잭션 경계 검증:

```powershell
node devops\scripts\verify-storage-transaction-boundaries.mjs
```

이 검증은 업로드, 공유, 워크스페이스 asset, 영구 삭제 경로에서 object storage I/O가 DB 트랜잭션 안으로 다시 들어가지 않는지 확인합니다. 또한 DB에서 참조하지 않는 cloud bucket object를 찾는 orphan cleanup job이 기본 비활성, dry-run 기본값으로 유지되는지도 확인합니다.

DB migration 검증:

```powershell
node devops\scripts\verify-db-migrations.mjs
```

Flyway runner는 포함되어 있지만 기본값은 `SPRING_FLYWAY_ENABLED=false`입니다. 운영에서 켤 때는 `docs/DB_MIGRATION_RUNBOOK.md` 기준으로 백업, staging 검증, baseline 설정을 먼저 확인합니다.

스토리지 orphan cleanup job은 운영자가 명시적으로 켠 경우에만 동작합니다. 기본값은 `APP_STORAGE_ORPHAN_CLEANUP_ENABLED=false`, `APP_STORAGE_ORPHAN_CLEANUP_DRY_RUN=true`입니다. 실제 삭제를 허용하기 전에는 dry-run 로그의 scanned/referenced/orphan/truncated 값을 먼저 확인합니다.

문서 인코딩 검증:

```powershell
node devops\scripts\verify-doc-encoding.mjs
```

이 검증은 루트 README, desktop client README, `docs/` 운영 문서, 배포 소스 문서의 존재 여부와 mojibake 패턴을 확인합니다.

전체 로컬 검증 게이트:

```powershell
.\scripts\verify-local.ps1
```

빠르게 정책 검증만 확인할 때는 다음처럼 실행합니다.

```powershell
.\scripts\verify-local.ps1 -SkipBackend -SkipFrontend -SkipDesktop
```

Playwright까지 포함한 프론트 E2E는 기본값에서는 제외되어 있으며 release gate에서는 `-IncludeE2E`를 추가합니다.
백엔드 테스트:

```powershell
cd backend
$env:JAVA_HOME='C:\jdk-17'
$env:Path="$env:JAVA_HOME\bin;$env:Path"
.\gradlew.bat test --no-daemon
```

최근 보강된 주요 테스트 범위는 공유 정책, 업로드 예약, 워크스페이스 asset 저장, CORS, 보안 경계, health/version endpoint 접근 제어, OAuth cookie 설정, 관리자 서비스입니다.

## 배포 기준

기준 배포 소스는 `devops/Helm`입니다.

- 운영 배포에서 `latest` tag를 사용하지 않습니다.
- 과거 `lumisia/*` 이미지를 다시 사용하지 않습니다.
- 현재 프로젝트 코드를 기준으로 이미지를 새로 빌드하고 명시 tag 또는 digest를 주입합니다.
- Backend Jenkins 배포는 frontend/websocket image tag가 비어 있거나 `latest`이면 실패해야 합니다.
- Docker Compose smoke/deploy도 `COMPOSE_IMAGE_TAG=<명시 tag>`를 주입해야 하며 app image가 `latest`로 fallback되면 안 됩니다.
- MinIO는 `MINIO_IMAGE_TAG=<명시 MinIO release tag>`를 주입합니다.
- Secret은 Helm public values에 직접 커밋하지 않고 CI/CD secret, private values, sealed secret 중 하나로 주입합니다.
- 공개 health endpoint는 `/api/actuator/health`입니다.

Helm CLI가 설치된 환경에서는 release 전에 template 검증을 실행합니다. 운영 배포는 tag 또는 digest 중 하나만 사용합니다.

```powershell
helm template fileinnout-dev devops\Helm --namespace fileinnoutdrive-dev `
  --set-string backend.image.tag=<tag> `
  --set-string frontend.image.tag=<tag> `
  --set-string websocket.image.tag=<tag>
```

Digest 기반 배포를 검증할 때는 tag를 비우고 digest를 지정합니다.

```powershell
helm template fileinnout-dev devops\Helm --namespace fileinnoutdrive-dev `
  --set-string backend.image.digest=sha256:<digest> `
  --set-string frontend.image.digest=sha256:<digest> `
  --set-string websocket.image.digest=sha256:<digest>
```

## 보안 기준

- 운영 CORS는 `APP_CORS_ALLOWED_ORIGIN_PATTERNS`에 명시한 실제 origin만 허용합니다. 값이 비어 있으면 `APP_FRONTEND_URL`로 fallback하지 않습니다.
- wildcard/private origin pattern은 `APP_CORS_ALLOW_DEVELOPMENT_ORIGIN_PATTERNS=true`인 개발 환경에서만 사용합니다.
- refresh/OAuth cookie는 `HttpOnly`로 발급하고 운영 HTTPS 환경에서는 `APP_SECURE_COOKIE=true`를 사용합니다.
- cookie SameSite 정책은 `APP_COOKIE_SAME_SITE`로 관리합니다. `SameSite=None`은 HTTPS/Secure cookie와 함께만 사용합니다.
- Swagger/OpenAPI는 기본적으로 인증 뒤에만 접근 가능하게 두고, 개발 또는 격리된 내부 환경에서만 `APP_DOCS_PUBLIC_OPENAPI=true`로 공개합니다.
- JWT, refresh token, OAuth secret, MinIO secret, DB password는 로그와 문서에서 마스킹합니다.
- presigned URL은 필요한 범위와 TTL만 허용합니다.

## 현재 개선 백로그

1. `frontend/src/views/workspace/WorkSpace.vue`를 composable, service, panel component로 계속 분리합니다.
2. `desktop-client/FileInNOutDesktopTray.cs`와 `desktop-client/fileinnout_desktop.py`를 UI, auth/session, API client, sync engine, Windows adapter로 분리합니다.
3. `FileUpDownloadMinioService`의 version, thumbnail, download 흐름에서 저장소 I/O와 DB transaction 경계를 계속 좁힙니다.
4. `ShareService`를 정책 검증, 권한 계산, 감사 기록, 저장소 복사 orchestration으로 분리합니다.
5. `UploadService.complete`를 명시적인 orchestration 구조로 바꿔 외부 I/O가 DB transaction 안에 오래 머물지 않게 합니다.
6. 프론트엔드 Vitest 범위를 로그인 유지, 업로드/다운로드, 공유 폴더, 관리자 화면 흐름으로 확장합니다.
7. Playwright E2E를 로그인 세션에서 업로드, 공유, 관리자 화면까지 확장합니다.
8. 데스크탑 설치, 제거, 시작 프로그램, shortcut 검증을 Windows 장기 검증 기준으로 유지합니다.
9. legacy 배포 자료는 `devops/Helm`과 drift가 생기지 않도록 deprecated 처리하거나 제거합니다.
10. Swagger/OpenAPI 산출물과 README의 API/환경 변수 설명은 release마다 갱신합니다.

## 관련 문서

- 프로젝트 감사 리포트: [docs/PROJECT_AUDIT.md](docs/PROJECT_AUDIT.md)
- 아키텍처 관계도: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- 사용자 흐름: [docs/USER_FLOWS.md](docs/USER_FLOWS.md)
- 운영 Runbook: [docs/RUNBOOK.md](docs/RUNBOOK.md)
- DB 마이그레이션 Runbook: [docs/DB_MIGRATION_RUNBOOK.md](docs/DB_MIGRATION_RUNBOOK.md)
- 데스크탑 동기화 설계: [docs/DESKTOP_SYNC_DESIGN.md](docs/DESKTOP_SYNC_DESIGN.md)
- 배포 소스 기준: [devops/DEPLOYMENT_SOURCE.md](devops/DEPLOYMENT_SOURCE.md)

## 작업 원칙

- 작은 단위로 변경하고 테스트를 함께 추가합니다.
- 공개되면 안 되는 파일은 커밋하지 않습니다.
- 운영 배포는 이미지 tag, Secret 주입, namespace, PV/PVC, ingress를 명시적으로 확인합니다.
- 사용자 데이터 정합성과 파일 객체 정리는 DB transaction 실패와 rollback까지 고려합니다.