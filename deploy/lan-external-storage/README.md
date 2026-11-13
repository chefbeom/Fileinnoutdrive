# FileInNOut 외부 저장소(Tailscale) 연동 & 내부망(`192.168.35.30`) 전용 배포 가이드

이 디렉터리(`deploy/lan-external-storage`)는 **`mariadb`, `redis`, `minio` 컨테이너를 제외**하고 애플리케이션 컨테이너 3개(`backend`, `websocket`, `frontend`)만 구동하도록 구성된 배포 패키지입니다.

---

## 1. 스토리지 서버 관리자에게 발급받아야 할 정보 체크리스트

외부 데이터 서버(Tailscale IP 예: `100.81.241.98`)에서 아래 3가지 저장소의 접속 정보를 발급받아 알려주시면 바로 배포할 수 있습니다.

### ① MariaDB
- **접속 주소 / 포트**: (예: `100.81.241.98` / `3306`)
- **데이터베이스 이름 (`DB_NAME`)**: (예: `fileinnout`)
- **사용자 ID (`DB_ID`)** 및 **비밀번호 (`DB_PASS`)**
  - *권한 요건*: JPA(`ddl-auto: update`)가 테이블을 자동 생성/갱신할 수 있도록 해당 DB(`fileinnout.*`)에 대한 `ALL PRIVILEGES` 권한 필요

### ② Redis
- **접속 주소 / 포트**: (예: `100.81.241.98` / `6379`)
- **비밀번호 (`REDIS_PASSWORD`)**:
  - *참고*: 현재 코드는 Redis 기본 `default` 사용자 비밀번호 인증(`REDIS_PASSWORD`) 방식을 사용합니다. 만약 Redis 6+ ACL 사용자명(`username` + `password`)이 별도로 지정된 계정이고 키 프리픽스(`fileinnout:*`) 제한이 있다면 함께 알려주세요 (`YJS_REDIS_PREFIX` 및 Spring Redis ACL 설정에 즉시 반영 가능).

### ③ MinIO (S3 호환 스토리지)
- **내부 API 주소 (`MINIO_API`)**: (예: `http://100.81.241.98:9000`)
- **브라우저 공개 주소 (`MINIO_PUBLIC_API`)**:
  - 외부 공개 도메인이 있다면 해당 주소(예: `https://minio-stage.travelslegder.com`)
  - 도메인 없이 Tailscale IP만 열려 있다면 기본값 `http://192.168.35.30:9000`을 그대로 사용하면 됩니다. (`frontend` Nginx 컨테이너가 `192.168.35.30:9000`으로 들어온 LAN 기기의 Presigned URL 파일 업/다운로드 요청을 Tailscale `100.81.241.98:9000`으로 무버퍼 스트리밍 중계하므로 **집 LAN 기기에 Tailscale이 깔려 있지 않아도 파일 업/다운로드가 정상 동작**합니다.)
- **Access Key (`MINIO_NAME`)** 및 **Secret Key (`MINIO_SECRET`)**
- **버킷 이름 (`MINIO_CLOUD_BUCKET`, `MINIO_WORKSPACE_BUCKET`)**:
  - 버킷 2개(예: `fileinnout`, `fileinnout-workspace`) 또는 단일 버킷 1개(둘 다 동일한 버킷명 지정 가능)에 대한 읽기/쓰기(`s3:*` 또는 `readwrite`) 권한

---

## 2. 내부망(`192.168.35.0/24`) 전용 격리 방식

1. **인터페이스 바인딩 격리**:
   - `ports`가 `192.168.35.30:80:80`, `192.168.35.30:9000:9000`으로만 바인딩되어 Tailscale 인터페이스(`100.103.83.66`)나 기존 모니터링 컨테이너(`100.103.83.66:8080`)와 절대 충돌하지 않으며 외부에서도 접근할 수 없습니다.
2. **Nginx 대역 제한 이중 방어**:
   - [`docker/nginx.conf.template`](./docker/nginx.conf.template)에 `allow 192.168.35.0/24; deny all;` 규칙이 적용되어 집 내부 LAN(`192.168.35.1` 게이트웨이 대역) 외의 접근을 차단합니다.

---

## 3. 실행 명령어 (`192.168.35.30` 서버 기준)

```bash
cp deploy/lan-external-storage/.env.example deploy/lan-external-storage/.env
# .env 파일에 발급받은 DB / Redis / MinIO 정보 입력 후:
sudo docker compose --project-name fileinnout-lan \
  --file deploy/lan-external-storage/docker-compose.yml \
  --env-file deploy/lan-external-storage/.env \
  up -d --build
```
