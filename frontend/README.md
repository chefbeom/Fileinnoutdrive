# FileInNOut Frontend

FileInNOut Frontend는 FileInNOut Drive의 Vue 3/Vite 기반 웹 클라이언트입니다. 파일 드라이브, 공유 폴더, 워크스페이스 문서, 관리자 화면, 실시간 협업 UI를 제공합니다.

## 주요 화면

- 로그인, 회원가입, OAuth 콜백 처리
- 파일 드라이브, 최근 파일, 휴지통, 공유 파일 화면
- 파일 업로드, 다운로드, 이동, 이름 변경, 잠금, 공유 관리
- 워크스페이스 문서 편집, 댓글, 에셋, 페이지 인덱스, 협업 패널
- 관리자 대시보드, 사용자 관리, 저장소/공유 감사 화면
- Legup 미니게임과 정적 public asset

## 기술 스택

| 영역 | 기술 |
| --- | --- |
| App | Vue 3, Vite, Vue Router, Pinia |
| Test | Vitest, Playwright, happy-dom |
| Realtime | STOMP, SockJS, Yjs |
| Network | Axios interceptor, SSE/EventSource |
| Style | CSS modules by feature folder, Font Awesome classes |

## 로컬 실행

```powershell
cd frontend
npm install
npm.cmd run dev
```

기본 개발 서버는 Vite 설정을 따릅니다. 백엔드 API 주소는 환경 변수 또는 `src/utils/backendUrl.js` 경로의 설정을 확인합니다.

## 빌드

```powershell
cd frontend
npm.cmd run build
```

빌드 결과는 `frontend/dist`에 생성됩니다. 운영 배포 이미지는 현재 프로젝트 코드 기준으로 다시 빌드해야 하며, 예전 `lumisia/frontend:latest` 이미지를 재사용하지 않습니다.

## 테스트

전체 unit test:

```powershell
cd frontend
npm.cmd run test:unit
```

핵심 정적 검증:

```powershell
cd frontend
npm.cmd run test:public-assets
npm.cmd run test:workspace-readonly
npm.cmd run test:workspace-collab-ui
npm.cmd run test:chat-room-ui
```

E2E test:

```powershell
cd frontend
npm.cmd run test:e2e
```

Playwright는 실제 backend 또는 mock 가능한 테스트 환경이 필요합니다. 로그인, 업로드, 다운로드, 공유, 관리자 화면은 별도 fixture와 테스트 계정 준비가 필요합니다.

## 디렉터리 구조

```text
frontend/
|-- src/api/                    backend API wrapper
|-- src/components/             shared UI components
|-- src/stores/                 Pinia state stores
|-- src/views/dashboard/        drive/admin dashboard views
|-- src/views/workspace/        workspace editor, panels, composables, services
|-- src/legup/                  game views and sockets
|-- public/                     static assets served as-is
|-- scripts/                    local verification scripts
```

## 워크스페이스 개발 규칙

`src/views/workspace/WorkSpace.vue`는 아직 큰 orchestration 파일입니다. 새 기능은 가능한 한 아래 위치로 분리합니다.

- UI 패널: `src/views/workspace/components/Workspace*.vue`
- Main document/sidebar/editor bridge rendering: `src/views/workspace/components/WorkspaceMainLayoutBridge.vue`
- Main document/sidebar/editor shell composition: `src/views/workspace/components/WorkspaceMainLayout.vue`
- Main document/sidebar/editor model/action bridge: `src/views/workspace/composables/useWorkspaceMainLayoutBridge.js`
- Floating sidebar panel stack composition: `src/views/workspace/components/WorkspaceFloatingPanelStack.vue`
- Floating sidebar stack model/action bridge: `src/views/workspace/composables/useWorkspaceFloatingPanelStackBridge.js`
- 상태와 lifecycle: `src/views/workspace/composables/useWorkspace*.js`
- 순수 변환/정렬/필터: `src/views/workspace/services/workspace*.js`
- 반복 옵션/상수: `src/constants/workspaceOptions.js`

새 composable 또는 service를 추가하면 가능한 한 같은 폴더에 `*.test.js`를 함께 추가합니다.

## public asset 주의사항

`frontend/public` 아래 파일은 Vite 번들 분석 밖에서 그대로 배포됩니다. Next.js 빌드 산출물, 중복 정적 파일, 출처가 불명확한 asset은 직접 넣지 말고 소스 기반 재빌드 또는 별도 asset package로 관리합니다.

## 운영 배포 주의사항

- Kubernetes 배포 source of truth는 `devops/Helm`입니다.
- frontend image tag는 `latest`가 아니라 명시 tag 또는 digest를 사용합니다.
- API, WebSocket, SSE origin은 운영 환경 변수로 명시합니다.
- CORS origin은 backend의 `APP_CORS_ALLOWED_ORIGIN_PATTERNS` allowlist와 맞춰야 합니다.
