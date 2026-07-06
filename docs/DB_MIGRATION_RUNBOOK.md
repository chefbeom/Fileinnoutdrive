# DB 마이그레이션 Runbook

이 문서는 FileInNOut Drive 운영 DB 변경을 적용할 때의 순서, 검증, rollback 기준을 정리합니다. 현재 저장소에는 Spring Boot Flyway runner와 `backend/src/main/resources/db/migration` additive migration이 있으며, destructive SQL은 별도 수동 승인 절차로 유지합니다.

## 원칙

- 운영 DB 변경은 애플리케이션 배포와 분리해서 계획합니다.
- 한 번의 변경은 가능한 한 `additive change`로 시작합니다. 컬럼/테이블 추가, nullable 추가, 인덱스 추가처럼 기존 코드와 같이 동작하는 변경을 먼저 적용합니다.
- 데이터 삭제, 컬럼 삭제, not-null 강화, unique 강화는 마지막 단계에서 별도 배포로 처리합니다.
- 파일 메타데이터, 공유, refresh token, 버전 테이블은 사용자 접근과 직접 연결되므로 백업과 rollback 절차 없이 적용하지 않습니다.
- SQL 적용자는 실행 전후 DB schema diff, row count, 애플리케이션 버전, 적용 시간을 기록합니다.

## Flyway 적용 상태

- Flyway 의존성은 백엔드에 포함되어 있지만 기본값은 `SPRING_FLYWAY_ENABLED=false`입니다.
- 자동 적용 대상 additive migration은 `backend/src/main/resources/db/migration`에 둡니다.
- 운영에서 켤 때는 `SPRING_FLYWAY_ENABLED=true`로 명시하고, 백업과 staging 검증을 먼저 완료합니다.
- 기존 운영 DB에 수동 SQL이 이미 적용됐을 가능성을 고려해 `SPRING_FLYWAY_BASELINE_ON_MIGRATE=true`를 기본값으로 둡니다.
- `manual-drop-unused-columns.sql`은 destructive 변경이므로 Flyway 자동 migration에 넣지 않습니다.

## 현재 SQL 파일

| 파일 | 목적 | 권장 적용 시점 |
| --- | --- | --- |
| `manual-add-refresh-token-session-columns.sql` | refresh token을 로그인 세션 단위로 관리하기 위한 컬럼 추가 | 인증 코드 배포 전 또는 같은 maintenance window |
| `manual-add-file-share-password-column.sql` | 공유 링크 비밀번호 보호 컬럼 추가 | 공유 정책 코드 배포 전 |
| `manual-add-file-share-policy-columns.sql` | 공유 만료/다운로드 제한 등 정책 컬럼 추가 | 공유 정책 코드 배포 전 |
| `manual-add-file-share-audit-log.sql` | 공유 감사 이벤트 테이블 추가 | 감사 기록 코드 배포 전 |
| `manual-add-file-version-table.sql` | 파일 버전 이력 테이블 추가 | 파일 버전 코드 배포 전 |
| `manual-drop-unused-columns.sql` | 더 이상 쓰지 않는 컬럼 제거 | 모든 앱 인스턴스가 새 코드로 전환되고 rollback 필요성이 사라진 뒤 |

위 additive SQL은 Flyway migration `V20260704_01`부터 `V20260704_05`까지로도 관리합니다. `manual-*.sql`은 운영 검토와 과거 절차 호환을 위한 reference로 남기고, 신규 additive 변경은 `db/migration`에 먼저 추가합니다.

## 표준 적용 순서

1. 배포 대상 app image tag 또는 digest, commit, SQL 파일 목록을 확정한다.
2. 운영 DB 백업을 생성하고 복구 가능성을 확인한다.
3. staging 또는 복제 DB에서 같은 SQL을 먼저 실행한다.
4. additive SQL을 먼저 적용한다.
5. 애플리케이션을 새 image tag 또는 digest로 rollout한다.
6. 신규 코드가 이전 schema와 새 schema 모두에서 기대대로 동작하는지 smoke test를 수행한다.
7. backfill이 필요한 경우 작은 batch로 나누어 실행하고 lock 시간을 기록한다.
8. not-null, unique, foreign key 같은 제약 강화는 데이터 정합성 검사 후 별도 window에서 적용한다.
9. drop SQL은 최소 한 번의 정상 운영 주기를 지나고 rollback 가능성을 제거한 뒤 적용한다.

## 적용 전 체크리스트

- [ ] DB 백업 파일 또는 snapshot ID가 있다.
- [ ] SQL 파일이 적용 대상 환경과 같은 DB 엔진/MariaDB 버전에서 검증됐다.
- [ ] `CREATE INDEX IF NOT EXISTS` 같은 문법이 운영 MariaDB 버전에서 지원되는지 확인했다.
- [ ] SQL이 대량 lock을 만들 수 있는지 확인했다.
- [ ] 애플리케이션 새 버전이 기존 schema에서 boot 가능한지 확인했다.
- [ ] rollback 시 되돌릴 app image tag 또는 digest와 values 파일이 준비됐다.
- [ ] 관련 smoke test 계정과 테스트 파일/공유 데이터가 준비됐다.

## 적용 후 검증

공통 확인:

```sql
SHOW TABLES;
SHOW COLUMNS FROM refresh_token;
SHOW COLUMNS FROM file_share;
SHOW TABLES LIKE 'file_share_audit_log';
SHOW TABLES LIKE 'file_version';
```

인증 확인:

- 웹 로그인 후 access token 만료 상황에서 `/auth/reissue`가 성공하는지 확인한다.
- 웹 로그인과 데스크탑 로그인 한쪽이 다른 쪽 refresh session을 무효화하지 않는지 확인한다.
- 로그아웃 후 refresh cookie/session이 제거되는지 확인한다.

공유 확인:

- 비밀번호 없는 공유 링크가 기존처럼 동작하는지 확인한다.
- 비밀번호가 설정된 공유 링크가 비밀번호 없이는 차단되는지 확인한다.
- 만료 시간과 다운로드 제한이 적용되는지 확인한다.
- 공유 생성, 변경, 취소, 다운로드 이벤트가 `file_share_audit_log`에 남는지 확인한다.

파일 버전 확인:

- 같은 경로 파일 교체 업로드 시 이전 버전이 보존되는지 확인한다.
- 최신 파일 다운로드와 특정 버전 다운로드가 구분되는지 확인한다.
- 파일 삭제/휴지통 이동 시 버전 데이터 정합성이 유지되는지 확인한다.

## Rollback 기준

SQL 적용 직후 앱 배포 전 문제가 생긴 경우:

- additive SQL만 적용했다면 앱은 기존 버전으로 유지한다.
- 테이블/컬럼 추가만 된 상태는 보통 즉시 drop하지 않고 후속 점검 대상으로 남긴다.
- 인덱스 생성 실패 또는 lock 문제가 발생하면 실패 SQL과 DB 상태를 기록하고 maintenance window를 종료한다.

앱 배포 후 문제가 생긴 경우:

- 먼저 app image tag 또는 digest를 이전 버전으로 rollback한다.
- 새 코드가 생성한 데이터가 이전 코드와 충돌하는지 확인한다.
- 공유 정책/감사/파일 버전 데이터는 삭제하지 않고 보존한다.
- DB 구조를 되돌려야 할 경우 백업 복구 또는 검증된 down SQL을 사용한다. 운영에서 즉석 drop/update를 작성하지 않는다.

## 장기 개선

- 신규 additive 변경은 Flyway migration으로만 추가하고, 기존 manual reference SQL과의 중복을 줄인다.
- migration 파일명에 순번과 적용 버전을 포함한다. 예: `V20260703_01__add_file_share_audit_log.sql`.
- CI에서 `node devops/scripts/verify-db-migrations.mjs`, migration dry-run, schema validation을 수행한다.
- release note에 `DB 변경 있음/없음`, `rollback 가능 범위`, `backfill 필요 여부`를 필수 항목으로 둔다.
- `manual-drop-unused-columns.sql` 같은 destructive migration은 별도 승인과 운영 evidence를 요구한다.