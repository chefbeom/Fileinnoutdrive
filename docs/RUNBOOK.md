# FileInNOut 운영 Runbook

이 문서는 운영 담당자가 배포 전 점검, 장애 확인, DB 변경 순서를 빠르게 확인할 수 있도록 정리합니다. 운영 배포 기준은 `devops/Helm`입니다.

## 배포 전 점검

1. 앱 이미지가 `latest`가 아닌 명시 tag 또는 `sha256` digest로 고정됐는지 확인한다. Docker Compose를 쓰는 경우 앱 `COMPOSE_IMAGE_TAG`와 MinIO `MINIO_IMAGE_TAG`를 모두 명시한다.
2. private values 또는 CI secret으로 `backend.secretEnv` 값을 주입한다.
3. `APP_CORS_ALLOWED_ORIGIN_PATTERNS`가 비어 있지 않고 실제 프론트엔드 origin만 포함하는지 확인한다. 이 값은 `APP_FRONTEND_URL`로 fallback되지 않는다.
4. `APP_CORS_ALLOW_DEVELOPMENT_ORIGIN_PATTERNS=false`인지 확인한다.
6. `APP_DOCS_PUBLIC_OPENAPI=false`인지 확인한다.
7. HTTPS 운영 환경에서는 `APP_SECURE_COOKIE=true`인지 확인한다.
8. `APP_COOKIE_SAME_SITE`가 도메인 구성과 맞는지 확인한다.
9. `node devops/scripts/verify-deployment-source.mjs`를 실행한다.
10. Run `node devops/scripts/verify-security-boundaries.mjs`.
11. `node devops/scripts/verify-doc-encoding.mjs`를 실행한다.
12. `APP_STORAGE_ORPHAN_CLEANUP_ENABLED=false` 또는 운영자가 승인한 값인지 확인하고, 실제 삭제 전에는 `APP_STORAGE_ORPHAN_CLEANUP_DRY_RUN=true`로 orphan cleanup 로그를 먼저 확인한다.
13. 가능하면 `helm template`을 명시 tag 또는 digest로 렌더링한다. production overlay는 `devops/Helm/values.production.example.yaml` 구조를 따른다.
14. rollout 후 backend, frontend, websocket pod 상태와 이벤트를 확인한다.

## 기본 Health 경로

- 공개 backend health: `/api/actuator/health`
- 인증 필요 backend version: `/api/test/version`
- realtime health: `/wss/statusz`
- MinIO health: `/minio/health/live`

`/api/test/version`은 인증된 호출에서만 사용합니다. `APP_HEALTH_EXPOSE_VERSION=true`인 경우에도 build version만 반환하고 pod name이나 timestamp는 반환하지 않습니다.

Swagger/OpenAPI(`/api/swagger-ui/**`, `/api/v3/api-docs/**`)도 기본적으로 인증이 필요합니다. 개발 또는 격리된 내부 환경에서만 `APP_DOCS_PUBLIC_OPENAPI=true`로 공개합니다.

## 로그인 장애 대응

확인 순서:

1. backend pod/container 로그에서 `/login`, `/auth/reissue`, `JwtFilter` 오류를 확인한다.
2. `APP_BACKEND_URL`, `APP_FRONTEND_URL`, secure cookie 설정이 실제 scheme/domain과 맞는지 확인한다.
3. refresh cookie가 브라우저에 저장되는지 확인한다.
4. Redis 연결 장애가 세션/실시간 기능에 영향을 주는지 확인한다.
5. 관리자 전용 모드에서 일반 회원가입과 OAuth 진입점이 차단되어야 하는지 확인한다.

복구 기준:

- 관리자 계정은 `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_ADDITIONAL_USERS`로 bootstrap할 수 있습니다.
- 운영에서 secret을 바꾸면 backend rollout을 수행하고 기존 refresh session 영향 범위를 공지합니다.

## 파일 업로드와 다운로드 장애 대응

확인 순서:

1. backend 로그에서 MinIO/S3 exception, presigned URL 생성 실패, DB transaction 오류를 확인한다.
2. object storage 내부 endpoint와 public endpoint가 각각 pod 내부와 사용자 브라우저에서 접근 가능한지 확인한다.
3. MariaDB 파일 메타데이터와 object storage 객체 존재 여부를 비교한다.
4. orphan object 또는 orphan metadata가 확인되면 수동 삭제 전에 백업을 확보한다.

복구 기준:

- DB에는 있지만 object가 없으면 사용자에게 재업로드를 요청하거나 메타데이터를 이관/정리한다.
- object는 있지만 DB가 없으면 orphan cleanup dry-run 결과에 포함되는지 먼저 확인한다.
- 자동 정리는 `APP_STORAGE_ORPHAN_CLEANUP_ENABLED=true`일 때만 실행된다. 기본값은 dry-run이므로 실제 삭제 전 `APP_STORAGE_ORPHAN_CLEANUP_DRY_RUN=false` 변경 승인을 별도로 남긴다.
- 반복 장애면 upload completion과 storage I/O 경계를 분리하는 보상 작업을 우선 적용한다.

## 공유와 권한 장애 대응

확인 순서:

1. 공유 대상 사용자, 그룹, 권한, 상속 상태를 확인한다.
2. `FileShare`와 공유 감사 로그가 같은 이벤트를 가리키는지 확인한다.
3. 공유 취소 뒤 수신자 목록, 다운로드, 데스크탑 동기화가 차단되는지 확인한다.
4. 링크 공유는 만료 시간, 다운로드 제한, 비밀번호 검증 상태를 함께 확인한다.

복구 기준:

- 잘못 열린 공유는 즉시 취소하고 감사 로그를 보존한다.
- 권한 상속 오류는 하위 파일의 공유 관계를 재계산한 뒤 수신자 목록을 재검증한다.

## WebSocket/Yjs 장애 대응

확인 순서:

1. `/wss/statusz` 응답을 확인한다.
2. `YJS_AUTH_REQUIRED`, backend authorize endpoint, Redis 연결을 확인한다.
3. frontend realtime URL과 ingress websocket upgrade 설정을 확인한다.
4. Redis pub/sub prefix 충돌 또는 snapshot 저장 지연을 확인한다.

복구 기준:

- realtime 장애 중에도 문서 조회와 저장 API가 가능한지 분리해서 확인한다.
- websocket 서버 rollout은 프론트 연결 재시도 동작과 함께 확인한다.

## 데스크탑 클라이언트 장애 대응

확인 순서:

1. `%LOCALAPPDATA%\FileInNOutDesktop\logs`와 데스크탑 context log를 확인한다.
2. 설정 파일 `config.json`의 server URL, profile, sync folder 경로를 확인한다.
3. 토큰 저장소 접근 실패 여부를 확인한다.
4. 시작 프로그램, shortcut, 프로그램 설치/제거 등록 상태를 확인한다.
5. READ/DOWNLOAD 공유 폴더가 로컬에서 쓰기 가능하게 풀리지 않았는지 확인한다.

복구 기준:

- 설정은 보존하고 프로그램 파일만 재설치하는 경로를 먼저 사용한다.
- 사용자 sync folder는 명시 요청 없이 삭제하지 않는다.
- 제거 테스트는 `verify_windows_install.ps1`, 패키지 테스트는 `verify_windows_package.ps1`로 확인한다.

## DB 변경 대응

상세 절차는 [DB_MIGRATION_RUNBOOK.md](DB_MIGRATION_RUNBOOK.md)를 따른다.

기본 원칙:

- 백업 없이 운영 DB 변경을 적용하지 않는다.
- additive schema 변경을 먼저 적용한다.
- drop, not-null 강화, unique 강화는 별도 window에서 처리한다.
- 적용 전후 row count, schema diff, 앱 버전, 실행자를 기록한다.

## 배포 rollback 기준

- 인증 또는 관리자 접근이 깨지면 즉시 backend rollback을 고려한다.
- 파일 업로드 완료 뒤 DB/object 불일치가 늘어나면 신규 업로드를 차단하고 원인 파악을 우선한다.
- Helm 값 오류면 같은 chart에 이전 명시 image tag 또는 digest를 주입해 rollback한다.
- DB destructive migration 이후에는 앱 rollback만으로 복구되지 않을 수 있으므로 DB runbook을 먼저 확인한다.
