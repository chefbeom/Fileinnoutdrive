# FileInNOut Desktop Client

FileInNOut Desktop Client는 FileInNOut Drive의 Windows 데스크탑 동기화 클라이언트입니다. 설정한 클라우드 폴더를 일반 Windows 폴더와 동기화하고, Windows 알림 영역의 초록색 폴더 아이콘으로 실행됩니다.

## 빠른 확인

- 설치 패키지는 `package-windows-exe.ps1` 또는 `package-windows.ps1`로 생성합니다.
- 설치 후 `FileInNOut Desktop`은 Windows 알림 영역 tray에서 실행됩니다.
- 설치 프로그램은 바탕화면 바로가기, 시작 메뉴 바로가기, Windows 시작 시 실행, 프로그램 설치/제거 등록을 지원합니다.
- 제거는 설치된 `uninstall-windows.ps1` 또는 Windows 프로그램 설치/제거 목록에서 진행합니다.
- 패키지 검증은 `verify_windows_package.ps1`, 설치 동작 검증은 `verify_windows_install.ps1`로 확인합니다. 패키지 경로 탐색, 필수 파일 목록, manifest checksum 검증은 `verify_windows_package_helpers.ps1`에 분리되어 있습니다.
- Python이 `PATH`에 없으면 `-PythonPath` 또는 `-PythonExe`로 실제 `python.exe` 경로를 넘깁니다.
- 토큰과 로그인 상태는 로컬 설정에 저장됩니다. 민감 값은 명령 인자 대신 표준 입력 또는 보호 저장 방식을 사용합니다.

## Windows 설치

```powershell
powershell -ExecutionPolicy Bypass -File .\desktop-client\install-windows.ps1
```

웹 다운로드용 setup 실행 파일은 진행률 표시와 바로가기 선택 옵션이 있는 작은 설치 화면을 엽니다. 설치가 끝나면 `FileInNOut Desktop`이 Windows tray에서 실행됩니다. 초록색 폴더 아이콘을 더블 클릭하면 설정과 관리 화면을 열 수 있습니다.

설치 위치는 기본적으로 다음 경로입니다.

```text
%LOCALAPPDATA%\FileInNOutDesktop
```

로그인과 동기화 폴더 설정은 다음 파일에 저장됩니다.

```text
%LOCALAPPDATA%\FileInNOutDesktop\config.json
```

Windows VM 또는 데스크탑 배포용 ZIP을 만들려면 다음 명령을 사용합니다.

```powershell
powershell -ExecutionPolicy Bypass -File .\desktop-client\package-windows.ps1
powershell -ExecutionPolicy Bypass -File .\desktop-client\verify_windows_package.ps1
```

웹 다운로드용 데스크탑 ZIP을 만들 때는 Python runtime을 함께 지정할 수 있습니다.

```powershell
$env:FILEINNOUT_PYTHON_RUNTIME="C:\Path\To\PortablePython"
powershell -ExecutionPolicy Bypass -File .\desktop-client\package-windows-exe.ps1
```

다운로드 ZIP은 `frontend\public\downloads\FileInNOutDesktop.zip`에 생성되고, 버전이 붙은 `FileInNOutDesktop-<version>.zip` 파일도 함께 생성됩니다. 프론트엔드 다운로드 버튼은 캐시된 예전 EXE 경로가 남지 않도록 버전이 붙은 ZIP 경로를 사용합니다.

## 설치 옵션

Python이 설치되어 있지만 `PATH`에 없으면 설치 시 절대 경로를 지정합니다.

```powershell
powershell -ExecutionPolicy Bypass -File .\install-windows.ps1 -PythonExe C:\Path\To\python.exe
```

한 번에 설치, 로그인, 동기화 폴더 설정, 시작 프로그램 등록, 즉시 실행까지 진행할 수 있습니다.

```powershell
powershell -ExecutionPolicy Bypass -File .\desktop-client\install-windows.ps1 `
  -Configure `
  -SyncDir C:\FileInNOut `
  -Server http://YOUR_HOST/api `
  -Email admin@fileinnout.local `
  -PythonExe C:\Path\To\python.exe `
  -InstallStartupTask `
  -StartNow `
  -CreateDesktopShortcut
```

무인 설치가 필요하면 `-Password "<password>"`를 추가할 수 있습니다. 설치 프로그램은 비밀번호를 자식 프로세스 인자가 아니라 표준 입력으로 전달합니다.

환경별 기본 서버는 `-Server http://YOUR_HOST/api` 또는 `FILEINNOUT_DESKTOP_SERVER`로 지정합니다. 내장 fallback은 로컬 개발용 `http://localhost/api`입니다. 운영 패키지는 실제 backend URL을 주입해야 합니다.

설치 프로그램은 `FileInNOut Desktop` 시작 메뉴 폴더를 만들고, tray 설정 열기, 동기화 폴더 열기, 수동 sync, `doctor --local-only`, 제거 바로가기를 생성합니다. `-NoStartMenuShortcuts`로 시작 메뉴 바로가기를 건너뛸 수 있습니다. 현재 사용자 기준 Windows 설치 앱 목록 등록은 `-NoRegisterApp`으로 건너뛸 수 있습니다.

## Tray 앱 사용

설치 후 Windows 알림 영역에서 초록색 FileInNOut 폴더 아이콘을 확인합니다.

- 아이콘 더블 클릭: FileInNOut Desktop 설정 열기
- `Open sync folder`: 설정된 로컬 동기화 폴더 열기
- `Sync now`: 로컬 변경 업로드와 클라우드 변경 다운로드 즉시 실행
- `Open FileInNOut web`: 웹 앱 열기
- `Pause sync` / `Resume sync`: 백그라운드 자동 동기화 중지 또는 재개
- `Auto sync`: 20초 주기와 로컬 변경 감지 기반 자동 동기화
- `Notifications`: 동기화 결과 알림 표시

설정 창은 로그인 전에는 초록색 FileInNOut 로그인 화면을 표시하고, 로그인 후에는 사용자 정보, 드라이브 용량, 동기화 폴더, 동기화 방향, 공유 제어, 현재 상태, 진단 정보, 최근 동기화 활동, 로컬/클라우드 통합 검색을 보여줍니다.

Explorer에서는 동기화된 파일이나 폴더를 우클릭해 `FileInNOut` 메뉴를 사용할 수 있습니다. 대상 sync, 웹에서 열기, 링크 복사, 상태 확인, 공유, 동기화 폴더 추가를 실행할 수 있습니다.

## 제거

설치된 제거 스크립트는 다음 경로에 복사됩니다.

```powershell
powershell -ExecutionPolicy Bypass -File "$env:LOCALAPPDATA\FileInNOutDesktop\uninstall-windows.ps1"
```

기본 제거는 command wrapper, client script, 시작 프로그램 등록을 제거하고 저장된 설정과 동기화 폴더는 보존합니다. 로컬 앱 설정과 초기화된 동기화 폴더까지 제거하려면 다음 옵션을 사용합니다.

```powershell
powershell -ExecutionPolicy Bypass -File "$env:LOCALAPPDATA\FileInNOutDesktop\uninstall-windows.ps1" -RemoveConfig -RemoveSyncDir
```

`-RemoveSyncDir`은 대상 폴더에 `.fileinnout\state.json`이 있을 때만 삭제를 허용합니다.

## 로그인

backend URL을 직접 사용합니다.

```powershell
%LOCALAPPDATA%\FileInNOutDesktop\fileinnout-desktop.cmd login --server http://YOUR_HOST/api --email admin@fileinnout.local
```

## 로컬 동기화 폴더 생성

```powershell
mkdir C:\FileInNOut
%LOCALAPPDATA%\FileInNOutDesktop\fileinnout-desktop.cmd init --dir C:\FileInNOut
```

`init` 이후에는 동기화 폴더가 사용자 설정에 저장되므로 이후 명령에서 `--dir`을 생략할 수 있습니다.

## 1회 동기화

```powershell
%LOCALAPPDATA%\FileInNOutDesktop\fileinnout-desktop.cmd sync-configured
```

backend에 접속하지 않고 로컬 상태만 확인하려면 다음 명령을 사용합니다.

```powershell
%LOCALAPPDATA%\FileInNOutDesktop\fileinnout-desktop.cmd status --local-only
```

더 자세한 로컬 진단은 다음 명령을 사용합니다.

```powershell
%LOCALAPPDATA%\FileInNOutDesktop\fileinnout-desktop.cmd doctor --local-only
```

로그인 후 `--local-only`를 생략하면 backend health와 원격 파일 목록 접근도 함께 확인합니다.

## 계속 동기화

```powershell
%LOCALAPPDATA%\FileInNOutDesktop\fileinnout-desktop.cmd watch-configured --interval 20
```

설치 프로그램으로 Windows 로그온 시 watcher를 등록할 수 있습니다.

```powershell
powershell -ExecutionPolicy Bypass -File .\desktop-client\install-windows.ps1 `
  -SyncDir C:\FileInNOut `
  -InstallStartupTask
```

## 폴더 공유

데스크탑 UI에서 설정된 동기화 폴더를 직접 공유할 수 있습니다. CLI에서는 먼저 동기화 폴더 안에 폴더를 만들고 push합니다.

```powershell
%LOCALAPPDATA%\FileInNOutDesktop\fileinnout-desktop.cmd push
```

상대 경로로 공유합니다.

```powershell
%LOCALAPPDATA%\FileInNOutDesktop\fileinnout-desktop.cmd share --path TeamFolder --email teammate@example.com --permission WRITE
```

새로 만든 로컬 폴더는 `--push-first`로 먼저 업로드한 뒤 공유할 수 있습니다.

```powershell
%LOCALAPPDATA%\FileInNOutDesktop\fileinnout-desktop.cmd share --path TeamFolder --email teammate@example.com --permission WRITE --push-first
```

여러 수신자는 `--email`을 반복하거나 쉼표로 구분해 전달합니다.

공유 명령은 `fileinnout://shared/<owner-email>/<folder>` 형식의 주소를 출력합니다. 받는 사람은 Windows Run, File Explorer, 데스크탑 설정 창의 shared-address 입력, 또는 다음 명령으로 주소를 열 수 있습니다.

```powershell
%LOCALAPPDATA%\FileInNOutDesktop\fileinnout-desktop.cmd open-address --address "fileinnout://shared/owner%40example.com/TeamFolder"
```

클라이언트는 필요한 경우 pending share를 수락하고, 공유 폴더 동기화 profile을 만들거나 갱신하고, 즉시 동기화한 뒤 FileInNOut drive의 `Shared\<owner-email>\...` 아래에 연결합니다.

## 현재 동작 기준

- 로컬 파일 업로드는 웹 앱과 같은 presigned upload 흐름을 사용합니다.
- 원격 파일 다운로드는 인증된 backend download endpoint를 사용합니다.
- 로그인 시 받은 refresh token을 저장합니다. access token 만료로 HTTP 401이 발생하면 `/auth/reissue`로 새 token을 받고 원래 요청을 재시도합니다.
- backend는 refresh token을 email 단일 값으로 덮어쓰지 않고 login session 단위로 저장합니다. 같은 계정의 웹 로그인과 데스크탑 로그인이 서로를 무효화하지 않습니다.
- `sync-configured`는 전체 cloud drive가 아니라 설정된 folder mapping만 동기화합니다. 각 mapping은 `two-way`, `upload`, `download` 중 하나를 사용할 수 있습니다.
- `.fileinnout` state 파일, 임시 다운로드 파일, Office lock 파일, `.crdownload`, `.tmp`, `.part`, `.swp` 같은 로컬 임시 파일은 무시합니다.
- 로컬 파일 삭제는 같은 파일이 이전 동기화 state에 있고 원격에도 남아 있을 때 remote trash로 반영됩니다.
- 수신한 READ-only 공유 파일은 로컬에서 read-only 속성을 적용하고, 쓰기 권한이 없는 변경은 업로드하지 않습니다.
- WRITE 권한으로 받은 공유 폴더는 다시 공유할 수 있습니다.

## 검증

패키지 생성과 검증:

```powershell
powershell -ExecutionPolicy Bypass -File .\desktop-client\package-windows.ps1 -Version local-check
powershell -ExecutionPolicy Bypass -File .\desktop-client\verify_windows_package.ps1 -PackagePath .\desktop-client\dist\FileInNOutDesktop-local-check.zip
```

Python 모듈 컴파일:

```powershell
cd desktop-client
Get-ChildItem -Filter *.py | ForEach-Object { python -m py_compile $_.FullName }
```

오프라인 클라이언트 검증:

```powershell
python desktop-client\verify_desktop_client.py
```

단위 테스트:

```powershell
cd desktop-client
python -m unittest discover -p "test_fileinnout_desktop_*.py"
```

## 패키지 구성

내부 패키지 ZIP에는 installer script, installer helper scripts, uninstaller, Python client modules, 설치 smoke verifier, README, manifest가 포함됩니다. Installer helper는 shell/Explorer 등록, drive hub 구성, payload 복사와 source-install tray fallback build로 분리되어 있습니다. Python modules는 config, path, file attribute, API, token security, local state/lock, account command, remote item/path state, web/share-address, pending share helper, sync profile rules, diagnostics, Windows drive integration, sync engine으로 분리되어 있습니다.

tray package에는 desktop settings form, UI controls, CLI/hidden command execution, shared drive/path rules, Explorer text/desktop.ini branding helpers, sync state/activity/issue helper, local search, data reading/storage and pending-share parsing, update check helper, dynamic Explorer drive launching, Windows Cloud Files registration helper가 포함됩니다. manifest는 각 파일의 SHA-256 checksum과 byte size를 기록합니다.

## 문제 대응

- 설치 후 tray icon이 보이지 않으면 시작 메뉴의 `FileInNOut Desktop`을 실행합니다.
- Python을 찾지 못하면 `-PythonExe C:\Path\To\python.exe`를 지정합니다.
- 시작 프로그램 task 등록이 권한 문제로 실패하면 installer는 Startup folder shortcut fallback을 사용합니다.
- 동기화가 반복 실패하면 `doctor --local-only`로 로컬 상태를 확인하고, 로그인 뒤에는 `doctor`로 backend 접근까지 확인합니다.
- 공유 폴더가 보이지 않으면 `pending-shares`, `accept-share`, `open-address` 명령으로 수락 상태와 로컬 연결 상태를 확인합니다.