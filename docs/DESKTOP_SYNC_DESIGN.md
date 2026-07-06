# FileInNOut 데스크탑 동기화 설계

이 문서는 Windows 데스크탑 클라이언트의 현재 동작과 리팩토링 경계를 정리합니다.

## 구성 요소

| 구성 요소 | 역할 |
| --- | --- |
| `FileInNOutDesktopTray.cs` | Windows tray UI, 설정 창, 사용자 동작, 프로세스 실행, 알림 |
| `fileinnout_desktop.py` | CLI entrypoint, sync orchestration, 호환 wrapper |
| `fileinnout_desktop_api.py` | backend API helper |
| `fileinnout_desktop_config.py` | 설정 파일, 계정별 profile, 서버 URL 관리 |
| `fileinnout_desktop_files.py` | 파일 속성, tree snapshot, 읽기 전용 처리 helper |
| `fileinnout_desktop_paths.py` | 로컬 경로와 FileInNOut drive path helper |
| `fileinnout_desktop_security.py` | token 저장, DPAPI/ProtectedData 연동 |
| `fileinnout_desktop_windows.py` | drive mapping, Explorer context, shortcut/registry 연동 |
| `install-windows.ps1` | 설치, 시작 프로그램, 바로가기, 프로그램 제거 등록 |
| `uninstall-windows.ps1` | 제거, 시작 프로그램/바로가기/설치 등록 해제 |

## 동기화 모델

1. 사용자는 하나 이상의 로컬 폴더를 sync profile로 등록한다.
2. 각 profile은 계정과 서버 URL 기준으로 분리된다.
3. 로컬 상태는 `.fileinnout/state.json`에 저장한다.
4. 업로드와 다운로드는 backend 파일 API를 사용한다.
5. refresh token은 보호 저장소에 저장하고 access token 만료 시 `/auth/reissue`로 재발급한다.
6. 공유 폴더는 `Shared/<owner-email>/<path>` 형태로 매핑한다.
7. My Drive와 Shared는 웹과 데스크탑에서 같은 계정 기준 파일 상태를 바라봐야 한다.

## 충돌 처리

- 로컬과 원격이 마지막 동기화 이후 모두 변경되면 로컬 파일은 conflict copy로 보존한다.
- 원격 최신본은 원래 경로에 내려받는다.
- READ/DOWNLOAD 공유 폴더의 로컬 변경은 업로드하지 않고 다음 pull에서 원격 상태로 복구한다.
- WRITE 공유 폴더의 변경은 소유자의 cloud folder에 업로드한다.
- 삭제 충돌은 사용자 데이터 보존을 우선하며, 자동 영구 삭제를 피한다.

## 권한 모델

| 권한 | 데스크탑 동작 |
| --- | --- |
| READ | 다운로드 가능, 로컬 변경 업로드 금지, 읽기 전용 속성 적용 |
| DOWNLOAD | 다운로드 가능, 로컬 변경 업로드 금지 |
| UPLOAD | 새 파일 업로드 가능, 기존 파일 수정/삭제는 backend 정책을 따른다 |
| WRITE | 추가, 수정, 삭제를 양방향 동기화 |

## 설치와 제거 모델

설치 시 수행 작업:

1. `%LOCALAPPDATA%\FileInNOutDesktop`에 클라이언트를 복사한다.
2. command wrapper와 tray 실행 파일을 생성한다.
3. 선택적으로 Start Menu shortcut, desktop shortcut, startup 등록을 만든다.
4. current-user installed app registry에 등록해 Windows 프로그램 설치/제거에 표시한다.
5. 설정이 제공되면 로그인과 sync folder 초기화를 수행한다.

제거 시 수행 작업:

1. tray/watcher 프로세스와 startup 등록을 정리한다.
2. shortcut과 installed app registry를 제거한다.
3. 기본값으로 config와 sync folder는 보존한다.
4. `-RemoveConfig`, `-RemoveSyncDir`가 명시된 경우에만 사용자 데이터를 삭제한다.

## 보안 기준

- 비밀번호는 프로세스 인자에 노출하지 않고 stdin 기반 전달을 사용한다.
- token은 DPAPI/ProtectedData 기반 저장소를 사용한다.
- 로그에는 access token, refresh token, 비밀번호, presigned URL secret을 남기지 않는다.
- 서버 URL 기본값은 개발 IP에 고정하지 않고 설치 인자 또는 `FILEINNOUT_DESKTOP_SERVER`로 주입한다.

## 테스트와 검증

- `python desktop-client/verify_desktop_client.py`
- `python -m unittest discover -s desktop-client -p "test_fileinnout_desktop*.py"`
- `powershell -File desktop-client/verify_windows_package.ps1`
- `powershell -File desktop-client/verify_windows_install.ps1`
- 실제 서버 연동은 `verify_live_desktop_sync.py`로 별도 환경에서 수행한다.

## 리팩토링 경계

우선순위는 다음과 같습니다.

1. `FileInNOutDesktopTray.cs`에서 UI, process runner, installer state, Windows integration을 분리한다.
2. `fileinnout_desktop.py`에서 sync engine, auth/session, API client, path/config/file helper를 계속 분리한다.
3. `verify_desktop_client.py`는 fixture, fake server, scenario runner 단위로 나눈다.
4. 설치 스크립트는 registry, shortcut, startup, uninstall validation helper를 함수 단위로 분리한다.
5. 실제 sync conflict, 재시작, 오프라인, 토큰 만료 테스트를 자동화한다.