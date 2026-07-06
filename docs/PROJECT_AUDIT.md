# FileInNOut Drive 프로젝트 전체 감사 리포트

작성일: 2026-07-03
최종 갱신: 2026-07-06

이 문서는 현재 저장소 기준으로 프론트엔드, 백엔드, 데스크탑 클라이언트, 배포 자료, README와 운영 문서를 함께 점검한 결과입니다. `node_modules`, 빌드 산출물, 테스트 캐시, 패키지 산출물은 분석 대상에서 제외했습니다.

## 요약

FileInNOut Drive는 파일 업로드/다운로드, 공유, 잠금, 관리자 기능, 워크스페이스 편집, 데스크탑 동기화, Kubernetes 배포 자료를 포함합니다. 최근 보완으로 문서 체계, 운영 보안 경계, 배포 기준, 테스트 기반은 개선됐지만, 일부 대형 파일과 배포 소스 중복, 운영 자동화 부족은 계속 관리해야 합니다.

현재 개선된 부분입니다.

- 루트 `README.md`, `frontend/README.md`, `desktop-client/README.md`와 `docs/` 문서 체계를 복구했고, 문서 검증이 mojibake 패턴까지 감지하도록 보강했습니다.
- `devops/Helm`을 canonical deployment source로 선언했습니다.
- Helm 이미지 기본값에서 `latest`를 제거하고 명시 tag 또는 `sha256` digest를 요구하도록 정리했습니다.
- 운영 기본 CORS는 `APP_CORS_ALLOWED_ORIGIN_PATTERNS` allowlist 기반이며, 값이 비어 있으면 `APP_FRONTEND_URL`로 fallback하지 않습니다. wildcard/private origin pattern은 개발 flag가 켜진 경우에만 허용됩니다.
- `/api/test/version`은 기본 비공개이며 `/api/actuator/health`를 공개 health 경로로 사용합니다.
- 파일, 공유, 업로드, 워크스페이스 asset 영역에서 storage I/O와 DB transaction 경계를 분리했습니다.
- 프론트엔드에는 Vitest, Playwright, public asset 검증을 추가했습니다.
- 데스크탑 설치 패키지는 시작 프로그램, 바로가기, 프로그램 설치/제거 등록, uninstall 검증까지 포함합니다.
- `WorkSpace.vue` has been split into scoped styles plus workspace composables/services for theme synchronization (`useWorkspaceThemeSync.js`), state, shell state (`useWorkspaceShellState.js`), SSE role-change handling (`useWorkspaceSseRoleChange.js`), document navigation (`useWorkspaceDocumentNavigation.js`), route/window lifecycle, members, share actions, asset actions, collection refresh, revisions, focus navigation, home panel rendering (`WorkspaceHomePanel.vue`), collaboration panel rendering (`WorkspaceCollaborationPanel.vue`), workload panel rendering (`WorkspaceWorkloadPanel.vue`), full-text search panel rendering (`WorkspaceFullTextPanel.vue`), overview floating panel bridge rendering (`WorkspaceOverviewPanels.vue`), comments, realtime connection/events, autosave, page metadata, document link/copy/Markdown export actions (`useWorkspaceDocumentLinkActions.js`), subpage creation/focus actions (`useWorkspaceSubpageActions.js`), document loading/UUID invite redirect (`useWorkspaceDocumentLoader.js`), save/persist state handling (`useWorkspacePersistence.js`), editor setup/destroy lifecycle (`useWorkspaceEditorSetup.js`), route/storage/editor watcher glue (`useWorkspaceLifecycleWatchers.js`), task panel rendering (`WorkspaceTaskPanel.vue`), review/comment panel rendering (`WorkspaceReviewPanel.vue`), assets panel rendering (`WorkspaceAssetsPanel.vue`), history panel rendering (`WorkspaceHistoryPanel.vue`), linked panel rendering (`WorkspaceLinkedPanel.vue`), linked/history floating panel bridge rendering (`WorkspaceLinkedHistoryPanels.vue`), quick block insert panel rendering (`WorkspaceBlockInsertPanel.vue`), outline panel rendering (`WorkspaceOutlinePanel.vue`), inbox panel rendering (`WorkspaceInboxPanel.vue`), summary panel rendering (`WorkspaceSummaryPanel.vue`), activity panel rendering (`WorkspaceActivityPanel.vue`), calendar panel rendering (`WorkspaceCalendarPanel.vue`), timeline panel rendering (`WorkspaceTimelinePanel.vue`), schedule/inbox floating panel bridge rendering (`WorkspaceScheduleInboxPanels.vue`), board panel rendering (`WorkspaceBoardPanel.vue`), database/board floating panel bridge rendering (`WorkspaceDatabaseBoardPanels.vue`), page tree panel rendering (`WorkspacePageTreePanel.vue`), page tree floating panel bridge rendering (`WorkspacePageTreeBridge.vue`), workspace-scoped normalization (`useWorkspaceNormalization.js`), document favorite actions (`useWorkspaceDocumentFavorites.js`), preference storage key/state wiring (`useWorkspacePreferenceStores.js`), page database panel rendering (`WorkspacePageDatabasePanel.vue`), workspace notice toast (`WorkspaceNoticeToast.vue`), confirm dialog (`WorkspaceConfirmDialog.vue`), command palette rendering (`WorkspaceCommandPalette.vue`), main layout model/action bridge (`useWorkspaceMainLayoutBridge.js`), main layout bridge rendering (`WorkspaceMainLayoutBridge.vue`), document sidebar and editor shell composition (`WorkspaceMainLayout.vue`), document sidebar rendering (`WorkspaceDocumentSidebar.vue`), page header rendering (`WorkspacePageHeader.vue`), presence popover rendering (`WorkspacePresencePopover.vue`), editor toolbar rendering (`WorkspaceEditorToolbar.vue`), property panel rendering (`WorkspacePropertyPanel.vue`), inline assets section rendering (`WorkspaceInlineAssetsSection.vue`), inline block bar rendering (`WorkspaceInlineBlockBar.vue`), editor lock overlay rendering (`WorkspaceEditorLockOverlay.vue`), remote cursor overlay rendering (`WorkspaceRemoteCursorsOverlay.vue`), editor shell rendering/ref forwarding (`WorkspaceEditorShell.vue`), floating sidebar panel stack model/action bridge (`useWorkspaceFloatingPanelStackBridge.js`), floating sidebar panel stack rendering (`WorkspaceFloatingPanelStack.vue`), floating sidebar/tab shell rendering (`WorkspaceFloatingSidebar.vue`), utility panel stack rendering (`WorkspaceUtilityPanels.vue`), and review/assets floating panel bridge rendering (`WorkspaceReviewAssetsPanels.vue`) and runtime lifecycle/editor setup/watcher wiring (`useWorkspaceRuntimeLifecycle.js`).
- EditorJS document analysis, quick block/page-link/checklist block factory logic, checklist task snapshot mutations, block comment DOM decorations, block focus/navigation helpers, block anchor selection lifecycle, snapshot parsing/workspace metadata helpers, image asset tracking helpers, title/Yjs binding helpers, awareness presence/cursor view-model helpers, cursor presence event payload helpers, presence event lifecycle binding, Yjs local sync/remote render orchestration, and realtime status logging helpers are split into `editorDocumentAnalysis.js`, `editorBlockFactory.js`, `editorTaskMutations.js`, `editorBlockComments.js`, `editorBlockNavigation.js`, `editorBlockSelectionController.js`, `editorSnapshot.js`, `editorImageAssets.js`, `editorTitleBinding.js`, `editorAwareness.js`, `editorPresenceEvents.js`, `editorPresenceController.js`, `editorYjsSync.js`, and `editorRealtimeStatus.js` with focused tests. `editor.js` is now below 800 lines.
- `OpenHexagonArena.vue` is now below 800 lines after moving canvas metrics, avatar image loading, obstacle/world/core/player/overlay drawing to `openHexagonCanvasRenderer.js` and scoped styles to `OpenHexagonArena.css`; `openHexagonCanvasRenderer.test.js` covers metrics and avatar loading.
- Desktop Python CLI parsing, account/login/logout/init/add-sync-folder commands, status/doctor/storage commands, and share/address commands are split into `fileinnout_desktop_parser.py`, `fileinnout_desktop_account_commands.py`, `fileinnout_desktop_status_commands.py`, and `fileinnout_desktop_share_commands.py`. Sync logic is split into `fileinnout_desktop_sync.py`, `fileinnout_desktop_sync_local.py`, `fileinnout_desktop_sync_shared.py`, `fileinnout_desktop_sync_moves.py`, and `fileinnout_desktop_drive_adoption.py`; drive hub path/link calculation is split into `fileinnout_desktop_drive_hub.py`; share address and pending-share helpers are split into `fileinnout_desktop_sharing.py`. `verify_desktop_client.py` fake API fixture, drive-root/Explorer scenarios, share/pending-share command scenarios, and upload/delete/move/read-only sync transfer scenarios are split into `verify_desktop_client_fakes.py`, `verify_desktop_client_drive_scenarios.py`, `verify_desktop_client_share_scenarios.py`, and `verify_desktop_client_sync_scenarios.py`.
- C# tray entry point, tray controller action/sync flow (`DesktopTrayControllerActions.cs`), tray menu builder (`DesktopTrayMenu.cs`), tray icon/visual helper (`DesktopTrayVisuals.cs`), SettingsForm shared UI factories (`DesktopUiControls.cs`), SettingsForm storage/status text helper (`DesktopSettingsText.cs`), SettingsForm dialog/error text helper (`DesktopSettingsDialogText.cs`), Explorer text, Explorer desktop.ini branding (`DesktopExplorerBranding.cs`), drive hub link-name calculation, Explorer namespace registration (`DesktopExplorerNamespace.cs`), drive hub link mapping (`DesktopDriveHubLinks.cs`), drive hub maintenance (`DesktopDriveHubMaintenance.cs`), drive/subst mapping (`DesktopDriveMapping.cs`), folder profile rules (`DesktopFolderProfileRules.cs`), desktop path rules (`DesktopPathRules.cs`), sync output summary/translation/balloon text, auto-sync pause/resume status/notification text, update manifest/version guidance, recent sync activity/issue parsing, storage/pending-share CLI output parsing, desktop file/cloud search (`DesktopSearchService.cs`), tray preference persistence (`DesktopTrayPreferences.cs`), tray config/token persistence, FileSystemWatcher/pending-change tracking, and targeted sync command planning are split into `DesktopProgram.cs`, `DesktopTrayControllerActions.cs`, `DesktopTrayMenu.cs`, `DesktopTrayVisuals.cs`, `DesktopUiControls.cs`, `DesktopSettingsText.cs`, `DesktopSettingsDialogText.cs`, `DesktopExplorerText.cs`, `DesktopExplorerBranding.cs`, `DesktopSyncText.cs`, `DesktopUpdateService.cs`, `DesktopSyncState.cs`, `DesktopDataReader.cs`, `DesktopSearchService.cs`, `DesktopTrayConfigStore.cs`, `DesktopTrayPreferences.cs`, `DesktopExplorerNamespace.cs`, `DesktopDriveHubLinks.cs`, `DesktopDriveHubMaintenance.cs`, `DesktopDriveMapping.cs`, `DesktopFolderProfileRules.cs`, `DesktopPathRules.cs`, `DesktopChangeTracker.cs`, and `DesktopSyncCommandRunner.cs`; Windows package/install/verify/uninstall scripts include the required helper files, package path/required-file/manifest checksum verifier helpers are split into `verify_windows_package_helpers.ps1`, source-install tray compile/copy fallback now includes split C# tray helpers, installer shell/Explorer/registry helpers are split into `install-windows-shell.ps1`, installer drive mapping/drive hub routines are split into `install-windows-drive-hub.ps1`, installer payload copy/source-install fallback build is split into `install-windows-payload.ps1`, the setup wizard C# source is split into `FileInNOutDesktopSetup.cs`, and the setup wizard form is split into `FileInNOutDesktopSetupForm.cs`.

## 우선순위 결론

### P0: 운영 안전성

1. 스토리지 I/O와 DB 정합성
   - 업로드, 공유 저장, 워크스페이스 asset 저장, 드라이브 복사, 영구 삭제 경로에서 DB transaction과 외부 object storage 작업을 분리했습니다.
   - DB rollback 시 생성된 object를 정리하고, DB commit 뒤 삭제 object를 정리하는 경계를 검증 스크립트로 고정했습니다.
   - DB에서 참조하지 않는 cloud bucket object를 찾는 기본 비활성/dry-run orphan cleanup job을 추가했습니다. metadata reconciliation과 outbox 기반 보상 작업은 장기 과제로 남아 있습니다.

2. 배포 소스 일원화
   - 기준 배포 소스는 `devops/Helm`입니다.
   - `backend/helm`, `devops/Kubes`, `frontend/k8s`는 legacy/quarantine 자료로 취급해야 합니다.
   - 장기적으로 legacy manifest를 제거하거나 Helm에서 생성되는 산출물로 전환해야 합니다. 현재는 삭제 승인 전까지 `devops/LEGACY_DEPLOYMENT_LOCK.json`으로 legacy 파일 drift를 차단합니다.

3. 운영 보안 설정
   - CORS, 공개 health/version endpoint, OpenAPI 공개 여부, secret 주입 방식은 검증 스크립트로 관리됩니다.
   - public values에는 실제 secret을 넣지 말고 CI secret, private values, sealed secret 중 하나를 사용해야 합니다.

### P1: 유지보수성과 회귀 방지

1. 대형 파일 추가 분리
   - `WorkSpace.vue` remains the main large frontend refactoring candidate. `OpenHexagonArena.vue`, `editor.js`, workspace CSS groups, `FileInNOutDesktopTray.cs`, `SettingsForm.cs`, `install-windows.ps1`, `verify_windows_package.ps1`, and `AdministratorView.vue` are now below 800 lines; remaining orchestration can still move into focused helpers.
   - 계산 로직, API adapter, UI panel, OS integration adapter 순서로 작게 나누는 방식이 안전합니다.

2. 테스트 범위 확장
   - 백엔드 전체 테스트, 프론트 unit/build/e2e, 데스크탑 오프라인/패키지 검증은 통과했습니다.
   - mock 기반 파일 업로드, 다운로드, 공유, 잠금 브라우저 E2E는 추가됐습니다. 실제 서버 연동, 대용량/오류/권한별 다운로드, 폴더 업로드 E2E는 남아 있습니다.
   - 데스크탑은 실제 서버 연동, 충돌, 재시작, 오프라인 뒤 재동기화 시나리오 검증이 추가로 필요합니다.

3. 문서 운영
   - README는 시작 문서로 유지하고 상세 문서는 `docs/`에 분리했습니다.
   - 릴리스마다 API, DB migration, 배포 변수, rollback 기준을 갱신해야 합니다.

### P2: 저장소 위생

1. 정적 산출물 관리
   - `frontend/public/legup/ladder`의 반복 Next export 산출물은 제거/축소했습니다.
   - public asset 검증으로 빌드 산출물이 다시 커밋되지 않게 해야 합니다.

2. 줄바꿈 정책
   - `git diff --check` 기준 whitespace 오류는 없습니다.
   - 다수 파일에서 CRLF/LF 변환 경고가 표시됩니다. `.gitattributes` 기준으로 한 번 정규화하는 별도 커밋이 필요합니다.

## 대형 파일 현황

2026-07-06 기준 주요 대형/최근 축소 코드/문서 파일입니다. Lockfile과 빌드 산출물은 제외했습니다.

| 라인 | 파일 | 판단 |
| ---: | --- | --- |
| 1,834 | `frontend/src/views/workspace/WorkSpace.vue` | Theme synchronization, workspace state, shell state, SSE role-change handling, document navigation, runtime lifecycle/editor setup/watcher wiring (`useWorkspaceRuntimeLifecycle.js`), preference storage key/state wiring (`useWorkspacePreferenceStores.js`), document actions, page tree/overview/database/board/schedule/history/review/assets floating panel bridges, workspace notice/confirm/share overlays (`WorkspaceOverlays.vue`), command palette/action wiring (`WorkspaceCommandPalette.vue`, `useWorkspaceCommandCenter.js`), document sidebar/editor main layout (`WorkspaceMainLayout.vue`), main layout model/action bridge (`useWorkspaceMainLayoutBridge.js`, `WorkspaceMainLayoutBridge.vue`), derived workspace state (`useWorkspaceDerivedState.js`), document action messages (`workspaceDocumentMessages.js`), shared workspace state forwarding (`workspaceState` spread), page header, floating sidebar panel stack bridge (`useWorkspaceFloatingPanelStackBridge.js`), floating sidebar panel stack (`WorkspaceFloatingPanelStack.vue`), floating sidebar/tab shell, utility panel stack, presence popover, editor toolbar/property/inline assets/block bar, editor shell/ref forwarding, remote cursor overlay, and workspace-scoped normalization are split out; remaining document/editor/sidebar orchestration still needs reduction. |
| 688 | `desktop-client/FileInNOutDesktopTray.cs` | Entry point, tray menu builder (`DesktopTrayMenu.cs`), tray visuals (`DesktopTrayVisuals.cs`), Explorer text, Explorer desktop.ini branding (`DesktopExplorerBranding.cs`), Explorer namespace registration (`DesktopExplorerNamespace.cs`), drive hub naming/link mapping, drive hub junction/owner maintenance (`DesktopDriveHubMaintenance.cs`), drive/subst mapping (`DesktopDriveMapping.cs`), folder profile normalization/removal/signature (`DesktopFolderProfileRules.cs`), path rules, sync text and auto-sync pause/resume messages, update checks, activity/search parsing, CLI output parsing, tray preference/config/token persistence, watcher/pending-change tracking, targeted sync command planning, and user action/sync controller flow are split out; the tray shell is now below 800 lines, while remaining Windows integration can still be narrowed further. |
| 769 | `desktop-client/install-windows.ps1` | Shell/Explorer namespace/registry/context-menu/shortcut helpers are split into `install-windows-shell.ps1`; drive letter mapping, drive hub junction maintenance, shared-owner hub grouping, and sync-folder profile discovery are split into `install-windows-drive-hub.ps1`; payload copy and source-install tray fallback build are split into `install-windows-payload.ps1`; the installer shell is now below 800 lines. |
| 738 | `desktop-client/verify_windows_package.ps1` | Package path resolution, required package file list, and manifest checksum validation are split into `verify_windows_package_helpers.ps1`; the package verifier shell is now below 800 lines. |
| 755 | `desktop-client/SettingsForm.cs` | Settings action/refresh/search/share handlers are split into `SettingsFormActions.cs`; shared text-box, label, button, checkbox, dropdown, list, and readonly log factories live in `DesktopUiControls.cs`; storage/status label composition lives in `DesktopSettingsText.cs`; dialog/error titles and browse-folder text live in `DesktopSettingsDialogText.cs`. The form shell is now below 800 lines. |
| 637 | `frontend/src/legup/openhexagon/OpenHexagonArena.vue` | Display name, geometry, color, time formatting, sector-boundary, and match-status helper logic moved to `openHexagonViewModel.js`; obstacle difficulty, deterministic world rotation, obstacle generation, and collision checks moved to `openHexagonObstacleModel.js`; primary button/status/player display/overlay text moved to `openHexagonUiModel.js`; canvas metrics, avatar loading, and obstacle/world/core/player/overlay drawing moved to `openHexagonCanvasRenderer.js`; scoped styles moved to `OpenHexagonArena.css`. The arena shell now owns socket/game-loop/input orchestration and is below 800 lines. |
| 710 | `frontend/src/components/workspace/editor.js` | EditorJS setup remains the owner for editor instance wiring, while document outline/task/stat/search/link extraction, block factories, checklist mutations, block comments, block navigation/selection, snapshot metadata, image asset tracking, title/Yjs binding, awareness/presence, Yjs sync, and realtime status logging are split into focused helpers with tests. The editor shell is now below 800 lines. |
| 471 | `frontend/src/views/workspace/styles/11-linked-history.css` | Former `11-linked-comments-editor.css` was split into linked/history, comments, floating asset, and editor body styles. |
| 400 | `frontend/src/views/workspace/styles/11-comments.css` | Comment filters, composer, mention menu, comment list, edit, resolve, and empty-state styles are isolated. |
| 348 | `frontend/src/views/workspace/styles/10-calendar-inbox.css` | Former `10-planning-tasks.css` was split into timeline, calendar/inbox, activity/block insert, task list, and outline styles. |
| 249 | `frontend/src/views/workspace/styles/10-task-list.css` | Task panel styles are isolated from planning/timeline styles. |
| 683 | `frontend/src/views/dashboard/AdministratorView.vue` | Admin share-audit/date/status formatting is split into `adminDashboardFormat.js`; storage/user/share/session/plan view models are split into `adminDashboardViewModels.js`; storage panel rendering moved to `AdminStorageSection.vue`; plan panel rendering moved to `AdminPlanSection.vue`. The file is now below 800 lines. |





## 프론트엔드 평가

개선된 점입니다.

- Vitest 기반 unit test와 Playwright e2e가 추가되어 인증 흐름, 관리자 권한 가드, 관리자 사용자 상태 변경, 공유 감사 로그, 세션 종료, 파일 업로드, 파일 다운로드, 파일 공유, 파일 잠금, workspace helper가 검증됩니다.
- `WorkSpace.vue` has been split into scoped styles plus workspace composables/services for theme synchronization (`useWorkspaceThemeSync.js`), state, shell state (`useWorkspaceShellState.js`), SSE role-change handling (`useWorkspaceSseRoleChange.js`), document navigation (`useWorkspaceDocumentNavigation.js`), route/window lifecycle, members, share actions, asset actions, collection refresh, revisions, focus navigation, home panel rendering (`WorkspaceHomePanel.vue`), collaboration panel rendering (`WorkspaceCollaborationPanel.vue`), workload panel rendering (`WorkspaceWorkloadPanel.vue`), full-text search panel rendering (`WorkspaceFullTextPanel.vue`), overview floating panel bridge rendering (`WorkspaceOverviewPanels.vue`), comments, realtime connection/events, autosave, page metadata, document link/copy/Markdown export actions (`useWorkspaceDocumentLinkActions.js`), subpage creation/focus actions (`useWorkspaceSubpageActions.js`), document loading/UUID invite redirect (`useWorkspaceDocumentLoader.js`), save/persist state handling (`useWorkspacePersistence.js`), editor setup/destroy lifecycle (`useWorkspaceEditorSetup.js`), route/storage/editor watcher glue (`useWorkspaceLifecycleWatchers.js`), task panel rendering (`WorkspaceTaskPanel.vue`), review/comment panel rendering (`WorkspaceReviewPanel.vue`), assets panel rendering (`WorkspaceAssetsPanel.vue`), history panel rendering (`WorkspaceHistoryPanel.vue`), linked panel rendering (`WorkspaceLinkedPanel.vue`), linked/history floating panel bridge rendering (`WorkspaceLinkedHistoryPanels.vue`), quick block insert panel rendering (`WorkspaceBlockInsertPanel.vue`), outline panel rendering (`WorkspaceOutlinePanel.vue`), inbox panel rendering (`WorkspaceInboxPanel.vue`), summary panel rendering (`WorkspaceSummaryPanel.vue`), activity panel rendering (`WorkspaceActivityPanel.vue`), calendar panel rendering (`WorkspaceCalendarPanel.vue`), timeline panel rendering (`WorkspaceTimelinePanel.vue`), schedule/inbox floating panel bridge rendering (`WorkspaceScheduleInboxPanels.vue`), board panel rendering (`WorkspaceBoardPanel.vue`), database/board floating panel bridge rendering (`WorkspaceDatabaseBoardPanels.vue`), page tree panel rendering (`WorkspacePageTreePanel.vue`), page tree floating panel bridge rendering (`WorkspacePageTreeBridge.vue`), workspace-scoped normalization (`useWorkspaceNormalization.js`), document favorite actions (`useWorkspaceDocumentFavorites.js`), preference storage key/state wiring (`useWorkspacePreferenceStores.js`), page database panel rendering (`WorkspacePageDatabasePanel.vue`), workspace notice toast (`WorkspaceNoticeToast.vue`), confirm dialog (`WorkspaceConfirmDialog.vue`), command palette rendering (`WorkspaceCommandPalette.vue`), main layout model/action bridge (`useWorkspaceMainLayoutBridge.js`), main layout bridge rendering (`WorkspaceMainLayoutBridge.vue`), document sidebar and editor shell composition (`WorkspaceMainLayout.vue`), document sidebar rendering (`WorkspaceDocumentSidebar.vue`), page header rendering (`WorkspacePageHeader.vue`), presence popover rendering (`WorkspacePresencePopover.vue`), editor toolbar rendering (`WorkspaceEditorToolbar.vue`), property panel rendering (`WorkspacePropertyPanel.vue`), inline assets section rendering (`WorkspaceInlineAssetsSection.vue`), inline block bar rendering (`WorkspaceInlineBlockBar.vue`), editor lock overlay rendering (`WorkspaceEditorLockOverlay.vue`), remote cursor overlay rendering (`WorkspaceRemoteCursorsOverlay.vue`), editor shell rendering/ref forwarding (`WorkspaceEditorShell.vue`), floating sidebar panel stack model/action bridge (`useWorkspaceFloatingPanelStackBridge.js`), floating sidebar panel stack rendering (`WorkspaceFloatingPanelStack.vue`), floating sidebar/tab shell rendering (`WorkspaceFloatingSidebar.vue`), utility panel stack rendering (`WorkspaceUtilityPanels.vue`), and review/assets floating panel bridge rendering (`WorkspaceReviewAssetsPanels.vue`) and runtime lifecycle/editor setup/watcher wiring (`useWorkspaceRuntimeLifecycle.js`).
- 기존 `WorkSpace.css`의 대형 스타일은 `frontend/src/views/workspace/styles/` 아래 scoped external stylesheet로 분리했고, 페이지 header 스타일은 `03-page-header.css`로, 플로팅 사이드바 wrapper/tab 스타일은 `04-floating-sidebar.css`로 이동했습니다.
- upload 상태 helper, chat room view-model helper, file table view-model helper, profile modal view-model helper, workspace readonly view-model helper, workspace collection refresh helper, workspace revision action helper, workspace focus navigation helper, workspace comment composer helper, workspace share action helper, workspace realtime notification helper, workspace realtime connection/event helper 테스트를 추가했습니다.
- public asset 검증 스크립트가 반복 산출물 유입을 차단합니다.

남은 일입니다.

- `WorkSpace.vue` is still the largest frontend file. Theme synchronization is now shared through `useWorkspaceThemeSync.js`, the editor shell/header/template/ref-forwarding section lives in `WorkspaceEditorShell.vue`, the overview floating panel bridge now lives in `WorkspaceOverviewPanels.vue`, the page tree floating panel bridge now lives in `WorkspacePageTreeBridge.vue`, the database/board floating panel bridge now lives in `WorkspaceDatabaseBoardPanels.vue`, the schedule/inbox floating panel bridge now lives in `WorkspaceScheduleInboxPanels.vue`, the linked/history floating panel bridge now lives in `WorkspaceLinkedHistoryPanels.vue`, and the review/assets floating panel bridge now lives in `WorkspaceReviewAssetsPanels.vue`, floating sidebar panel model/action bridge now lives in `useWorkspaceFloatingPanelStackBridge.js`, floating sidebar panel composition now lives in `WorkspaceFloatingPanelStack.vue`, document sidebar/editor shell composition now lives in `WorkspaceMainLayout.vue`, and runtime lifecycle/editor setup/watcher wiring now lives in `useWorkspaceRuntimeLifecycle.js`, and preference storage key/state wiring now lives in `useWorkspacePreferenceStores.js`; remaining document/editor/sidebar orchestration should continue moving into focused components.
- Former large workspace CSS files `11-linked-comments-editor.css` and `10-planning-tasks.css` were split into focused files; remaining CSS work is incremental cleanup, not a single oversized-file blocker.
- `AdministratorView.vue` is now below 800 lines after moving storage panel rendering to `AdminStorageSection.vue`, plan panel rendering to `AdminPlanSection.vue`, and storage/user/share/session/plan view-model calculations into focused service helpers with tests. Remaining user/share/session panels can still be split further. `FilesUpload.vue` is now below 800 lines after moving upload menu rendering, progress panel rendering/styles, and panel title/subtitle/ETA text into `FilesUploadMenu.vue`, `FilesUploadProgressPanel.vue`, and `uploadState.js`. `FileCollectionView.vue` is now below 800 lines after moving table rendering, grid/icon rendering, and shared collection styles into `FileCollectionTable.vue`, `FileCollectionGrid.vue`, and `FileCollectionView.css`, while keeping layout/metadata/action/drag calculations in `fileCollectionViewModel.js`. `Header.vue` is now below 800 lines after moving scoped styles to `Header.css`, while keeping search labels/counts, profile values, game access, avatar initials, and notification normalization in `headerViewModel.js`. `BaseFileView.vue` now reuses `baseFileViewModel.js` for extension collection, local filtering/sorting, selected file groups, toolbar metadata, pagination, server list query construction, share display dates, share permission/policy labels, policy option normalization, shared file labels, and recipient aggregation. Toolbar rendering, selection action bar, pagination bar, share dialog, folder property dialog, folder rename dialog, related styles, and share dialog state/actions are split into focused components/composables/CSS files; `BaseFileView.vue` is now below 800 lines. `ChatRoom.vue` is now below 800 lines after moving message/read/upload calculations into `chatRoomViewModel.js` and participant panel rendering into `ChatParticipantsPanel.vue`. `ProfileModal.vue` is now below 800 lines after moving form/view-model logic into `profileModalViewModel.js` and scoped styles into `ProfileModal.css`. `FileTable.vue`, `WorkSpaceReadOnly.vue`, `FilesUploadWidget.vue`, and `useFileStore.js` are now below 800 lines after moving display, preview, selection/drag, grid class, asset normalization, read-only EditorJS rendering logic, floating upload status panel, exit dialog, widget styles, file normalization, shared desktop path decoration, asset URL reuse, ID/path normalization, and drive query comparison into focused helpers/components/model modules.
- Playwright는 핵심 인증/관리자/파일 업로드/다운로드/공유/잠금 mock 플로우를 커버합니다. 실제 서버 smoke, 대용량/오류/권한별 다운로드, 폴더 업로드, 공유 취소 플로우는 추가되어야 합니다.

## 백엔드 평가

개선된 점입니다.

- CORS와 공개 endpoint 설정을 운영 기본값에서 제한했고, CORS allowlist 누락 시 frontend-url fallback이 발생하지 않도록 고정했습니다.
- 스토리지 I/O와 DB transaction 경계를 검증하는 `devops/scripts/verify-storage-transaction-boundaries.mjs`가 추가됐고, workspace asset cloud object cleanup scheduling은 `WorkspaceAssetObjectCleanupScheduler`로, 공유 파일 rollback object cleanup은 `ShareObjectCleanupScheduler`로, 공유 응답 매핑은 `ShareResponseMapper`로, 공유 파일 접근/전송 흐름은 `ShareFileAccessService`로, 파일 영구 삭제 after-commit cleanup은 `FileObjectCleanupScheduler`로, 업로드 object storage I/O는 `UploadObjectStorageService`로, 업로드 rollback/commit object cleanup scheduling은 `UploadObjectCleanupScheduler`로, 채팅 첨부 storage I/O는 `ChatAttachmentStorageService`로, 공유/파일 트리 순회는 `ShareFileTree`와 `FileTreeRules`로 분리됐으며, orphan cleanup job의 비활성/dry-run 기본값도 회귀 검증합니다.
- 공유 정책, 공유 감사, 공유 응답 매핑, 파일 버전, object 삭제/다운로드 helper, upload object rule/cleanup scheduler 테스트가 보강됐습니다.
- Flyway runner와 additive DB migration 파일을 추가했고, 기본값은 운영자가 명시적으로 켤 때만 동작하도록 비활성화했습니다.
- 전체 Gradle 테스트가 통과했습니다.

남은 일입니다.

- DB migration runner는 추가됐습니다. 다만 전체 base schema bootstrap, destructive migration 승인 절차, 실제 운영 dry-run evidence는 아직 필요합니다.
- cloud bucket orphan object cleanup job은 추가됐습니다. 다만 orphan metadata reconciliation과 관리자 dry-run 화면은 아직 없습니다.
- controller/security/integration test는 보강됐지만 전체 도메인 대비 더 필요합니다.
- `ShareService`는 공유 파일 트리 순회, rollback object cleanup, 응답 매핑, 공유 파일 접근/전송 흐름을 각각 `ShareFileTree`, `ShareObjectCleanupScheduler`, `ShareResponseMapper`, `ShareFileAccessService`로 분리했고 600줄 미만으로 축소했습니다. `FileUpDownloadMinioService`는 after-commit cleanup, 파일 트리 순회, 저장소 요약 계산을 `FileObjectCleanupScheduler`, `FileTreeRules`, `FileStorageSummaryService`로 분리했습니다. 두 서비스 모두 정책/목록/이동 orchestration은 계속 줄일 여지가 있습니다.

## 데스크탑 클라이언트 평가

개선된 점입니다.

- Python CLI는 config/API/path/file/state/remote/web/diagnostics/sync/drive hub/sharing helper와 account command helper로 분리됐고, `fileinnout_desktop.py`는 744줄로 800줄 아래입니다.
- C# tray has split Cloud Files integration, tray context menu rendering (`DesktopTrayMenu.cs`), SettingsForm shared UI factories (`DesktopUiControls.cs`) for labels, text boxes, buttons, checkboxes, dropdowns, lists, and readonly logs, SettingsForm storage/status text composition (`DesktopSettingsText.cs`), SettingsForm dialog/error text (`DesktopSettingsDialogText.cs`), Explorer text, Explorer desktop.ini branding, Explorer namespace registration, drive hub link mapping, drive hub junction/owner maintenance (`DesktopDriveHubMaintenance.cs`), drive/subst mapping (`DesktopDriveMapping.cs`), folder profile normalization/removal/signature (`DesktopFolderProfileRules.cs`), tray preference persistence (`DesktopTrayPreferences.cs`), sync output text, update checks, sync activity/issue state, desktop file/cloud search, watcher/change tracking, and targeted sync command planning into focused helpers.
- Windows 설치 ZIP 검증은 manifest, Python 모듈 포함, 분리된 shell/drive-hub/payload 설치 helper와 setup wizard/form template 포함, 시작 프로그램 fallback, 시작 메뉴/바탕화면 바로가기, 프로그램 설치/제거 등록, 제거 절차까지 확인합니다.
- 로그인 비밀번호는 CLI 인자로 직접 넘기지 않고 stdin 경로를 사용할 수 있습니다.

남은 일입니다.

- Frontend `WorkSpace.vue` is still large. `OpenHexagonArena.vue`, `editor.js`, and the former large workspace CSS groups are now below 800 lines after helper/style extraction. `FileInNOutDesktopTray.cs`, `SettingsForm.cs`, `install-windows.ps1`, `verify_windows_package.ps1`, `package-windows-exe.ps1`, `FileInNOutDesktopSetup.cs`, and `FileInNOutDesktopSetupForm.cs` are also below 800 lines after partial/helper extraction.
- 실제 서버 연동 sync conflict, 재시작 뒤 복구, offline 뒤 재동기화, Windows Explorer Cloud Files 상태 표시 테스트가 필요합니다.
- 설치 스크립트는 drive mapping/drive hub helper 분리가 끝났지만, 설치 단계 orchestration, 레지스트리 등록, 바로가기 생성, 시작 프로그램 등록은 계속 나눌 여지가 있습니다.

## 배포와 운영 문서 평가

개선된 점입니다.

- `devops/DEPLOYMENT_SOURCE.md`가 배포 기준을 설명합니다.
- `devops/Helm/values.production.example.yaml`이 운영 values 예시 역할을 합니다.
- `devops/LEGACY_DEPLOYMENT_LOCK.json`은 남아 있는 legacy 배포 파일의 정규화 hash를 고정해 무단 수정과 파일 추가를 검증에서 실패시킵니다.
- `docs/RUNBOOK.md`, `docs/DB_MIGRATION_RUNBOOK.md`, `docs/ARCHITECTURE.md`, `docs/DESKTOP_SYNC_DESIGN.md`, `docs/USER_FLOWS.md`가 추가되어 README 부담을 줄였습니다.
- `devops/scripts/verify-deployment-source.mjs`, `verify-security-boundaries.mjs`, `verify-doc-encoding.mjs`, `verify-storage-transaction-boundaries.mjs`가 배포/문서/보안/정합성 기준을 고정합니다.

남은 일입니다.

- `scripts/verify-local.ps1`로 문서/보안/배포 소스/스토리지/DB migration과 선택형 프론트/백엔드/데스크탑 테스트를 한 번에 실행할 수 있습니다. CI release gate 연결은 남아 있습니다.
- 실제 Kubernetes namespace 배포 smoke test와 rollback 결과를 문서화해야 합니다.
- private values와 secret 주입 방식은 환경별 runbook으로 더 구체화해야 합니다.

## 검증 기록

2026-07-04부터 2026-07-06까지 확인한 결과입니다.

- `desktop-client`: `<bundled-python> -m py_compile desktop-client\fileinnout_desktop.py desktop-client\fileinnout_desktop_account_commands.py desktop-client\fileinnout_desktop_status_commands.py desktop-client\fileinnout_desktop_share_commands.py`: 통과; Python account command extraction syntax verified
- `desktop-client`: `<bundled-python> desktop-client\verify_desktop_client.py`: 통과; password stdin/direct, add-sync-folder, drive/share/sync offline scenarios verified after account command extraction
- `desktop-client`: `powershell -ExecutionPolicy Bypass -File desktop-client\package-windows.ps1 -Version codex-account-helper-check`: 통과; `fileinnout_desktop_account_commands.py` 포함 패키지 생성 및 tray C# compile 검증
- `desktop-client`: `powershell -ExecutionPolicy Bypass -File desktop-client\verify_windows_package.ps1 -PackagePath desktop-client\dist\FileInNOutDesktop-codex-account-helper-check.zip -PythonPath <bundled-python>`: 통과; manifest, Python module compile, install/uninstall smoke verified with account command helper
- `desktop-client`: `powershell -ExecutionPolicy Bypass -File desktop-client\package-windows.ps1 -Version codex-branding-helper-check`: 통과; `DesktopExplorerBranding.cs` 포함 패키지 생성 및 tray C# compile 검증
- `desktop-client`: `powershell -ExecutionPolicy Bypass -File desktop-client\verify_windows_package.ps1 -PackagePath desktop-client\dist\FileInNOutDesktop-codex-branding-helper-check.zip -PythonPath <bundled-python>`: 통과; manifest, source helper inclusion, Python module compile, install/uninstall smoke verified
- `desktop-client`: `powershell -ExecutionPolicy Bypass -File desktop-client\package-windows.ps1 -Version codex-toggle-helper-check`: 통과; `DesktopSyncText.AutoSyncToggle*` 포함 패키지 생성 및 tray C# compile 검증
- `desktop-client`: `powershell -ExecutionPolicy Bypass -File desktop-client\verify_windows_package.ps1 -PackagePath desktop-client\dist\FileInNOutDesktop-codex-toggle-helper-check.zip -PythonPath <bundled-python>`: 통과; manifest, Korean pause/resume token, Python module compile, install/uninstall smoke verified
- `desktop-client`: `powershell -ExecutionPolicy Bypass -File desktop-client\package-windows.ps1 -Version codex-sync-text-wrapper-check`: 통과; SettingsForm 텍스트 normalization 호출을 `DesktopSyncText`로 직접 연결하고 tray 공개 래퍼 제거 후 C# compile 검증
- `desktop-client`: `powershell -ExecutionPolicy Bypass -File desktop-client\verify_windows_package.ps1 -PackagePath desktop-client\dist\FileInNOutDesktop-codex-sync-text-wrapper-check.zip -PythonPath <bundled-python>`: 통과; manifest, split helper inclusion, Python module compile, install/uninstall smoke verified
- `desktop-client`: `powershell -ExecutionPolicy Bypass -File desktop-client\package-windows.ps1 -Version codex-korean-controller-path-check`: 통과; current Korean controller path 위임으로 unreachable duplicate branch 제거 후 C# compile 검증
- `desktop-client`: `powershell -ExecutionPolicy Bypass -File desktop-client\verify_windows_package.ps1 -PackagePath desktop-client\dist\FileInNOutDesktop-codex-korean-controller-path-check.zip -PythonPath <bundled-python>`: 통과; manifest, split helper inclusion, Python module compile, install/uninstall smoke verified
- `desktop-client`: `powershell -ExecutionPolicy Bypass -File desktop-client\package-windows.ps1 -Version codex-tray-actions-partial-check`: 통과; `DesktopTrayControllerActions.cs` partial 분리 후 C# compile 검증
- `desktop-client`: `powershell -ExecutionPolicy Bypass -File desktop-client\verify_windows_package.ps1 -PackagePath desktop-client\dist\FileInNOutDesktop-codex-tray-actions-partial-check.zip -PythonPath <bundled-python>`: 통과; manifest includes `DesktopTrayControllerActions.cs`, split helper inclusion, Python module compile, install/uninstall smoke verified
- `desktop-client`: `powershell -ExecutionPolicy Bypass -File desktop-client\package-windows.ps1 -Version codex-settings-actions-partial-check`: 통과; `SettingsFormActions.cs` partial 분리 후 C# compile 검증
- `desktop-client`: `powershell -ExecutionPolicy Bypass -File desktop-client\verify_windows_package.ps1 -PackagePath desktop-client\dist\FileInNOutDesktop-codex-settings-actions-partial-check.zip -PythonPath <bundled-python>`: 통과; manifest includes `SettingsFormActions.cs`, split helper inclusion, Python module compile, install/uninstall smoke verified
- `desktop-client`: `powershell -ExecutionPolicy Bypass -File desktop-client\package-windows.ps1 -Version codex-installer-payload-helper-check`: 통과; `install-windows-payload.ps1` helper 분리 후 C# compile/package 검증
- `desktop-client`: `powershell -ExecutionPolicy Bypass -File desktop-client\verify_windows_package.ps1 -PackagePath desktop-client\dist\FileInNOutDesktop-codex-installer-payload-helper-check.zip -PythonPath <bundled-python>`: 통과; manifest includes `install-windows-payload.ps1`, PowerShell parser checks, Python module compile, install/uninstall smoke verified
- `node devops/scripts/verify-deployment-source.mjs`: 통과
- `scripts/verify-local.ps1 -IncludeE2E`: 문서/보안/배포/스토리지/DB migration, 프론트 public/unit/build/e2e, 백엔드 Gradle tests 통과; 데스크탑 단계는 로컬 `python` alias 부재로 중단됨
- `scripts/verify-local.ps1 -SkipBackend -SkipFrontend -Python <bundled-python>`: 통과; 데스크탑 `py_compile`, Python unittest 41 tests, offline verification 통과
- `scripts/verify-local.ps1 -JavaHome C:\jdk-17 -Python <bundled-python>`: 통과; 문서/보안/배포/스토리지/DB migration, 프론트 public/unit/build 155 files / 594 tests, 백엔드 Gradle tests, 데스크탑 `py_compile`/Python unittest 41 tests/offline verification, git whitespace check 통과
- `node devops/scripts/verify-doc-encoding.mjs`: 통과, 16 markdown files
- `node devops/scripts/verify-security-boundaries.mjs`: 통과

- `backend`: CORS allowlist/preflight targeted test: 통과
- `node devops/scripts/verify-storage-transaction-boundaries.mjs`: 통과
- `node devops/scripts/verify-db-migrations.mjs`: 통과
- `git diff --check`: whitespace 오류 없음, CRLF/LF 변환 경고만 표시
- `backend`: `gradlew.bat test --no-daemon`: 통과
- `backend`: 파일/공유/업로드/workspace asset targeted test, `ShareFileTreeTest`, `ShareObjectCleanupSchedulerTest`, `ShareTreeStatusServiceTest`, `ShareResponseMapperTest`, `ShareFileAccessServiceTest`, `ShareServiceTest`, `FileTreeRulesTest`, `FileObjectCleanupSchedulerTest`, `FileStorageSummaryServiceTest`, `FileUpDownloadMinioServiceTest`, `WorkspaceAssetObjectCleanupSchedulerTest`, `UploadServiceTest`, `UploadObjectCleanupSchedulerTest`: 통과
- `frontend`: `npm.cmd run test:unit`: 통과, 136 files / 525 tests, includes `WorkspaceNoticeToast`, `WorkspaceConfirmDialog`, `WorkspaceCommandPalette`, `WorkspaceDocumentSidebar`, `WorkspacePageHeader`, `WorkspaceFloatingSidebar`, `WorkspacePresencePopover`, `WorkspaceEditorToolbar`, `WorkspacePropertyPanel`, `WorkspaceInlineAssetsSection`, `WorkspaceInlineBlockBar`, `WorkspaceEditorLockOverlay`, and `WorkspaceRemoteCursorsOverlay`, `useWorkspaceThemeSync`, `openHexagonViewModel`, `uploadState`, `fileCollectionViewModel`, `headerViewModel`, `baseFileViewModel`, `fileStoreModel`, `BaseFileToolbar`, `BaseFileSelectionBar`, `BaseFilePaginationBar`, `BaseFileShareDialog`, `BaseFolderPropertyDialog`, `BaseFolderRenameDialog`, `useBaseFileShareDialog`, `chatRoomViewModel`, `fileTableViewModel`, `profileModalViewModel`, `workspaceReadOnlyViewModel`, `FilesUploadMenu`, `FilesUploadProgressPanel`, `FileCollectionTable`, `FileCollectionGrid`, `Header.css`, `WorkspaceEditorShell`, `editorDocumentAnalysis`, `AdminStorageSection`, `AdminPlanSection`, `AdministratorView.css`
- `frontend`: `npm.cmd run test:unit -- src/views/workspace/workspaceReadOnlyViewModel.test.js`: passed, 1 file / 4 tests
- `frontend`: `npm.cmd run test:unit -- src/components/profileModalViewModel.test.js`: passed, 1 file / 4 tests; `ProfileModal.vue` scoped styles moved to `ProfileModal.css`
- `frontend`: `npm.cmd run test:unit -- src/components/fileTableViewModel.test.js`: passed, 1 file / 4 tests
- `frontend`: `npm.cmd run test:unit -- src/components/chatRoomViewModel.test.js`: passed, 1 file / 4 tests; `ChatRoom.vue` participant panel moved to `ChatParticipantsPanel.vue`
- `frontend`: `npm.cmd run test:unit -- src/components/baseFileViewModel.test.js`: passed, 1 file / 5 tests
- `frontend`: `npm.cmd run test:unit -- src/components/useBaseFileShareDialog.test.js`: passed, 1 file / 2 tests
- `frontend`: `npm.cmd run test:unit -- src/stores/fileStoreModel.test.js`: passed, 1 file / 4 tests; `useFileStore.js` file normalization, shared desktop path decoration, ID/path normalization, drive query comparison, and asset URL reuse moved to `fileStoreModel.js`
- `frontend`: `npm.cmd run test:unit -- src/components/headerViewModel.test.js`: passed, 1 file / 4 tests
- `frontend`: `npm.cmd run test:unit -- src/components/file/fileCollectionViewModel.test.js`: passed, 1 file / 4 tests
- `frontend`: `npm.cmd run test:unit -- src/components/function/uploadState.test.js`: passed, 1 file / 10 tests; `FilesUpload.vue` upload panel text helpers plus `FilesUploadWidget.vue` floating status panel, exit dialog, and widget stylesheet split verified by build.
- `frontend`: `npm.cmd run test:unit -- src/views/workspace/components/WorkspaceUtilityPanels.test.js`: 통과, 1 file / 3 tests; utility floating panels for activity, quick blocks, tasks, and outline moved to `WorkspaceUtilityPanels.vue`
- `frontend`: `npm.cmd run test:unit -- src/views/workspace/components/WorkspacePageTreeBridge.test.js src/views/workspace/components/WorkspacePageTreePanel.test.js`: 통과, 2 files / 7 tests; page tree floating panel bridge visibility and event forwarding verified
- `frontend`: `npm.cmd run build`: 통과; `WorkspacePageTreeBridge.vue` 분리 후 `WorkSpace.vue` bundle 검증
- `frontend`: `npm.cmd run test:unit -- src/views/workspace/components/WorkspaceOverviewPanels.test.js src/views/workspace/components/WorkspaceHomePanel.test.js src/views/workspace/components/WorkspaceSummaryPanel.test.js src/views/workspace/components/WorkspaceCollaborationPanel.test.js src/views/workspace/components/WorkspaceWorkloadPanel.test.js src/views/workspace/components/WorkspaceFullTextPanel.test.js`: 통과, 6 files / 17 tests; overview floating panel bridge event forwarding verified
- `frontend`: `npm.cmd run build`: 통과; `WorkspaceOverviewPanels.vue` 분리 후 `WorkSpace.vue` bundle 검증
- `frontend`: `npm.cmd run test:unit -- src/views/workspace/components/WorkspaceDatabaseBoardPanels.test.js src/views/workspace/components/WorkspacePageDatabasePanel.test.js src/views/workspace/components/WorkspaceBoardPanel.test.js src/views/workspace/components/WorkspaceScheduleInboxPanels.test.js`: 통과, 4 files / 14 tests; database/board floating panel bridge model/view/bulk/row/drag event forwarding verified
- `frontend`: `npm.cmd run build`: 통과; `WorkspaceDatabaseBoardPanels.vue` 분리 후 `WorkSpace.vue` bundle 검증
- `frontend`: `npm.cmd run test:unit -- src/views/workspace/components/WorkspaceScheduleInboxPanels.test.js src/views/workspace/components/WorkspaceTimelinePanel.test.js src/views/workspace/components/WorkspaceCalendarPanel.test.js src/views/workspace/components/WorkspaceInboxPanel.test.js`: 통과, 4 files / 13 tests; schedule/inbox floating panel bridge filter/action event forwarding verified
- `frontend`: `npm.cmd run build`: 통과; `WorkspaceScheduleInboxPanels.vue` 분리 후 `WorkSpace.vue` bundle 검증
- `frontend`: `npm.cmd run test:unit -- src/views/workspace/components/WorkspaceLinkedHistoryPanels.test.js src/views/workspace/components/WorkspaceLinkedPanel.test.js src/views/workspace/components/WorkspaceHistoryPanel.test.js src/views/workspace/components/WorkspaceReviewAssetsPanels.test.js`: 통과, 4 files / 17 tests; linked/history floating panel bridge event forwarding and subpage input focus ref contract verified
- `frontend`: `npm.cmd run build`: 통과; `WorkspaceLinkedHistoryPanels.vue` 분리 후 `WorkSpace.vue` bundle 검증
- `frontend`: `npm.cmd run test:unit -- src/views/workspace/components/WorkspaceReviewAssetsPanels.test.js src/views/workspace/components/WorkspaceReviewPanel.test.js src/views/workspace/components/WorkspaceAssetsPanel.test.js src/views/workspace/components/WorkspaceUtilityPanels.test.js`: 통과, 4 files / 15 tests; review/assets floating panel bridge event forwarding and comment composer ref contract verified
- `frontend`: `npm.cmd run build`: 통과; `WorkspaceReviewAssetsPanels.vue` 분리 후 `WorkSpace.vue` bundle 검증
- `frontend`: `npm.cmd run build`: 통과; `WorkSpace.vue` compiled after utility panel stack extraction
- `frontend`: `npm.cmd run test:unit -- src/views/workspace/composables/useWorkspaceCommandCenter.test.js src/views/workspace/composables/useWorkspaceCommandPalette.test.js src/views/workspace/components/WorkspaceOverlays.test.js src/views/workspace/components/WorkspaceCommandPalette.test.js src/views/workspace/components/WorkspaceConfirmDialog.test.js src/views/workspace/components/WorkspaceNoticeToast.test.js`: 통과, 6 files / 21 tests; workspace command center and overlay bridge verified
- `frontend`: `npm.cmd run build`: 통과; `WorkspaceOverlays.vue` and `useWorkspaceCommandCenter.js` extraction compiled through Vite
- `frontend`: `npm.cmd run test:unit -- src/views/workspace/components/WorkspaceMainLayout.test.js src/views/workspace/components/WorkspaceDocumentSidebar.test.js src/views/workspace/components/WorkspaceEditorShell.test.js`: 통과, 3 files / 9 tests; main layout/sidebar/editor event forwarding verified
- `frontend`: `npm.cmd run build`: 통과; `WorkspaceMainLayout.vue` extraction compiled through Vite
- `frontend`: `npm.cmd run test:unit -- src/views/workspace/composables/useWorkspaceMainLayoutBridge.test.js src/views/workspace/components/WorkspaceMainLayoutBridge.test.js src/views/workspace/components/WorkspaceMainLayout.test.js`: 통과, 3 files / 7 tests; main layout model/action bridge and existing main layout event forwarding verified
- `frontend`: `npm.cmd run build`: 통과; `WorkspaceMainLayoutBridge.vue` and `useWorkspaceMainLayoutBridge.js` compiled through Vite
- `frontend`: `npm.cmd run test:unit`: 통과, 169 files / 630 tests; main layout bridge tests included in the full unit suite
- `frontend`: `npm.cmd run test:unit -- src/views/workspace/composables/useWorkspacePreferenceStores.test.js src/views/workspace/composables/useWorkspaceFullTextSearch.test.js src/views/workspace/composables/useWorkspacePageIndexFilters.test.js`: 통과, 3 files / 7 tests; WorkSpace setup ordering hazard reduced by passing workspace document/owner sources lazily
- `frontend`: `npm.cmd run build`: 통과; WorkSpace lazy source wiring compiled through Vite
- `frontend`: `npm.cmd run test:unit -- src/views/workspace/composables/useWorkspaceRuntimeLifecycle.test.js src/views/workspace/composables/useWorkspaceFloatingPanelStackBridge.test.js src/views/workspace/composables/useWorkspaceMainLayoutBridge.test.js src/views/workspace/components/WorkspaceFloatingPanelStack.test.js src/views/workspace/components/WorkspaceMainLayoutBridge.test.js`: 통과, 5 files / 10 tests; workspace state spread reduced repeated runtime/main/floating bridge context wiring
- `frontend`: `npm.cmd run build`: 통과; workspace state spread wiring compiled through Vite
- `frontend`: `npm.cmd run test:unit -- src/views/workspace/composables/useWorkspaceDerivedState.test.js src/views/workspace/composables/useWorkspaceAccessState.test.js src/views/workspace/composables/useWorkspaceHomePanels.test.js src/views/workspace/composables/useWorkspaceShellState.test.js src/views/workspace/composables/useWorkspaceMainLayoutBridge.test.js src/views/workspace/composables/useWorkspaceFloatingPanelStackBridge.test.js`: 통과, 6 files / 16 tests; direct WorkSpace derived computed state moved to `useWorkspaceDerivedState.js`
- `frontend`: `npm.cmd run build`: 통과; derived workspace state extraction compiled through Vite
- `frontend`: `npm.cmd run test:unit -- src/views/workspace/services/workspaceDocumentMessages.test.js src/views/workspace/composables/useWorkspaceDocumentSections.test.js src/views/workspace/composables/useWorkspaceDocumentActions.test.js`: 통과, 3 files / 13 tests; document section/action Korean messages moved to `workspaceDocumentMessages.js`
- `frontend`: `npm.cmd run build`: 통과; workspace document message service extraction compiled through Vite
- `frontend`: `npm.cmd run test:unit -- src/views/workspace/components/WorkspaceFloatingPanelStack.test.js src/views/workspace/components/WorkspaceFloatingSidebar.test.js`: 통과, 2 files / 5 tests; floating panel stack action forwarding and ref registration verified
- `frontend`: `npm.cmd run test:unit -- src/views/workspace/composables/useWorkspaceFloatingPanelStackBridge.test.js src/views/workspace/components/WorkspaceFloatingPanelStack.test.js`: 통과, 2 files / 4 tests; floating panel stack model/action bridge verified
- `frontend`: `npm.cmd run test:unit -- src/views/workspace/components/WorkspaceFloatingSidebar.test.js src/views/workspace/components/WorkspaceOverviewPanels.test.js src/views/workspace/components/WorkspacePageTreeBridge.test.js src/views/workspace/components/WorkspaceDatabaseBoardPanels.test.js src/views/workspace/components/WorkspaceScheduleInboxPanels.test.js src/views/workspace/components/WorkspaceUtilityPanels.test.js src/views/workspace/components/WorkspaceLinkedHistoryPanels.test.js src/views/workspace/components/WorkspaceReviewAssetsPanels.test.js`: 통과, 8 files / 28 tests; panel bridge regression verified
- `frontend`: `npm.cmd run build`: 통과; `WorkspaceFloatingPanelStack.vue` extraction compiled through Vite
- `frontend`: `npm.cmd run test:unit -- src/views/workspace/components/WorkspaceEditorShell.test.js`: 통과, 1 file / 2 tests; editor shell DOM ref forwarding and header/toolbar/asset/template/inline-block event forwarding verified
- `frontend`: `npm.cmd run test:unit -- src/components/workspace/editorDocumentAnalysis.test.js`: 통과, 1 file / 4 tests; EditorJS document outline/task/stat/search/link extraction helper verified
- `frontend`: `npm.cmd run test:unit -- src/components/workspace/editorBlockFactory.test.js src/components/workspace/editorDocumentAnalysis.test.js`: 통과, 2 files / 7 tests; EditorJS quick block/page-link/checklist block factory extraction verified
- `frontend`: `npm.cmd run test:unit -- src/components/workspace/editorTaskMutations.test.js src/components/workspace/editorBlockFactory.test.js src/components/workspace/editorDocumentAnalysis.test.js`: 통과, 3 files / 10 tests; EditorJS checklist task path normalization, nested task toggle, and checklist append snapshot mutation verified
- `frontend`: `npm.cmd run test:unit -- src/components/workspace/editorBlockComments.test.js src/components/workspace/editorTaskMutations.test.js src/components/workspace/editorBlockFactory.test.js src/components/workspace/editorDocumentAnalysis.test.js`: 통과, 4 files / 13 tests; EditorJS block comment summary normalization, stale decoration clearing, badge rendering, and badge click forwarding verified
- `frontend`: `npm.cmd run test:unit -- src/components/workspace/editorBlockNavigation.test.js src/components/workspace/editorBlockComments.test.js src/components/workspace/editorTaskMutations.test.js src/components/workspace/editorBlockFactory.test.js src/components/workspace/editorDocumentAnalysis.test.js`: 통과, 5 files / 17 tests; EditorJS active block index resolution, anchor lookup, block holder resolution, and block highlight behavior verified
- `frontend`: `npm.cmd run test:unit -- src/components/workspace/editorSnapshot.test.js src/components/workspace/editorBlockNavigation.test.js src/components/workspace/editorBlockComments.test.js src/components/workspace/editorTaskMutations.test.js src/components/workspace/editorBlockFactory.test.js src/components/workspace/editorDocumentAnalysis.test.js`: 통과, 6 files / 21 tests; EditorJS snapshot parsing, initial seed state, and workspace metadata serialization verified
- `frontend`: `npm.cmd run test:unit -- src/components/workspace/editorImageAssets.test.js src/components/workspace/editorSnapshot.test.js src/components/workspace/editorBlockNavigation.test.js src/components/workspace/editorBlockComments.test.js src/components/workspace/editorTaskMutations.test.js src/components/workspace/editorBlockFactory.test.js src/components/workspace/editorDocumentAnalysis.test.js`: 통과, 7 files / 23 tests; EditorJS image asset map extraction and removed-image cleanup candidate calculation verified
- `frontend`: `npm.cmd run test:unit -- src/components/workspace/editorTitleBinding.test.js src/components/workspace/editorImageAssets.test.js src/components/workspace/editorSnapshot.test.js src/components/workspace/editorBlockNavigation.test.js src/components/workspace/editorBlockComments.test.js src/components/workspace/editorTaskMutations.test.js src/components/workspace/editorBlockFactory.test.js src/components/workspace/editorDocumentAnalysis.test.js`: 통과, 8 files / 27 tests; EditorJS title seeding, title ref binding, local title update, and save-title fallback verified
- `frontend`: `npm.cmd run test:unit -- src/components/workspace/editorAwareness.test.js src/components/workspace/editorTitleBinding.test.js src/components/workspace/editorImageAssets.test.js src/components/workspace/editorSnapshot.test.js src/components/workspace/editorBlockNavigation.test.js src/components/workspace/editorBlockComments.test.js src/components/workspace/editorTaskMutations.test.js src/components/workspace/editorBlockFactory.test.js src/components/workspace/editorDocumentAnalysis.test.js`: 통과, 9 files / 32 tests; EditorJS awareness local state merge, active-user sorting, remote cursor clamping, and Yjs awareness view-model extraction verified
- `frontend`: `npm.cmd run test:unit -- src/components/workspace/editorPresenceEvents.test.js src/components/workspace/editorAwareness.test.js src/components/workspace/editorRealtimeStatus.test.js src/components/workspace/editorTitleBinding.test.js`: 통과, 4 files / 18 tests; EditorJS cursor presence payload extraction verified
- `frontend`: `npm.cmd run build`: 통과; `editorPresenceEvents.js` 분리 후 workspace editor bundle 검증
- `frontend`: `npm.cmd run test:unit -- src/components/workspace/editorPresenceController.test.js src/components/workspace/editorPresenceEvents.test.js src/components/workspace/editorAwareness.test.js src/components/workspace/editorRealtimeStatus.test.js src/components/workspace/editorTitleBinding.test.js`: 통과, 5 files / 21 tests; EditorJS presence event lifecycle binding extraction verified
- `frontend`: `npm.cmd run build`: 통과; `editorPresenceController.js` 분리 후 workspace editor bundle 검증
- `frontend`: `npm.cmd run test:unit -- src/components/workspace/editorYjsSync.test.js src/components/workspace/editorPresenceController.test.js src/components/workspace/editorPresenceEvents.test.js src/components/workspace/editorSnapshot.test.js src/components/workspace/editorAwareness.test.js src/components/workspace/editorRealtimeStatus.test.js src/components/workspace/editorTitleBinding.test.js src/components/workspace/editorImageAssets.test.js src/components/workspace/editorTaskMutations.test.js src/components/workspace/editorBlockFactory.test.js src/components/workspace/editorDocumentAnalysis.test.js`: 통과, 11 files / 41 tests; EditorJS Yjs local sync, suppressed local render, pending remote render, and delayed editor availability verified
- `frontend`: `npm.cmd run build`: 통과; `editorYjsSync.js` 분리 후 workspace editor bundle 검증
- `frontend`: `npm.cmd run test:unit -- src/components/workspace/editorBlockSelectionController.test.js src/components/workspace/editorBlockNavigation.test.js src/components/workspace/editorYjsSync.test.js src/components/workspace/editorPresenceController.test.js src/components/workspace/editorDocumentAnalysis.test.js`: 통과, 5 files / 19 tests; EditorJS block anchor capture/focus/event lifecycle extraction verified
- `frontend`: `npm.cmd run build`: 통과; `editorBlockSelectionController.js` 분리 후 workspace editor bundle 검증
- `frontend`: `npm.cmd run test:unit -- src/components/workspace/editorRealtimeStatus.test.js src/components/workspace/editorAwareness.test.js src/components/workspace/editorTitleBinding.test.js src/components/workspace/editorImageAssets.test.js src/components/workspace/editorSnapshot.test.js src/components/workspace/editorBlockNavigation.test.js src/components/workspace/editorBlockComments.test.js src/components/workspace/editorTaskMutations.test.js src/components/workspace/editorBlockFactory.test.js src/components/workspace/editorDocumentAnalysis.test.js`: 통과, 10 files / 37 tests; EditorJS realtime status formatting/fetching/timer lifecycle extraction verified
- `frontend`: `npm.cmd run build`: 통과; `editorRealtimeStatus.js` 분리 후 workspace editor bundle 검증
- `frontend`: `npm.cmd run build`: 통과; `editorAwareness.js` 분리 후 workspace editor bundle 검증
- `frontend`: `npm.cmd run build`: 통과; `editorTitleBinding.js` 분리 후 workspace editor bundle 검증
- `frontend`: `npm.cmd run build`: 통과; `editorImageAssets.js` 분리 후 workspace editor bundle 검증
- `frontend`: `npm.cmd run build`: 통과; `editorSnapshot.js` 분리 후 workspace editor bundle 검증
- `frontend`: `npm.cmd run build`: 통과; `editorBlockNavigation.js` 분리 후 workspace editor bundle 검증
- `frontend`: `npm.cmd run build`: 통과; `editorBlockComments.js` 분리 후 workspace editor bundle 검증
- `frontend`: `npm.cmd run build`: 통과; `editorTaskMutations.js` 분리 후 workspace editor bundle 검증
- `frontend`: `npm.cmd run build`: 통과; `editorBlockFactory.js` 분리 후 `editor.js` import와 workspace editor bundle 검증
- `frontend`: `npm.cmd run test:unit -- src/views/workspace/composables/useWorkspaceThemeSync.test.js`: passed, 1 file / 4 tests; workspace and read-only workspace theme synchronization helper verified
- `frontend`: `npm.cmd run test:unit -- src/legup/openhexagon/openHexagonViewModel.test.js`: passed, 1 file / 4 tests; OpenHexagon display, geometry, color, match status, difficulty, and sector helper logic verified
- `frontend`: `npm.cmd run test:unit -- src/legup/openhexagon/openHexagonViewModel.test.js src/legup/openhexagon/openHexagonObstacleModel.test.js`: 통과, 2 files / 8 tests; OpenHexagon obstacle generation, deterministic shared rotation, difficulty, and collision model verified
- `frontend`: `npm.cmd run build`: 통과; `openHexagonObstacleModel.js` 분리 후 OpenHexagon/Vite bundle 검증
- `frontend`: `npm.cmd run test:unit -- src/legup/openhexagon/openHexagonViewModel.test.js src/legup/openhexagon/openHexagonObstacleModel.test.js src/legup/openhexagon/openHexagonUiModel.test.js`: 통과, 3 files / 12 tests; OpenHexagon UI labels, player display fallback, local-player state, and overlay text model verified
- `frontend`: `npm.cmd run build`: 통과; `openHexagonUiModel.js` 분리 후 OpenHexagon/Vite bundle 검증
- `frontend`: `npm.cmd run test:unit -- src/legup/openhexagon/openHexagonCanvasRenderer.test.js`: 통과, 1 file / 2 tests; OpenHexagon canvas metrics and avatar image loading verified
- `frontend`: `npm.cmd run test:unit -- src/legup/openhexagon/openHexagonViewModel.test.js src/legup/openhexagon/openHexagonObstacleModel.test.js src/legup/openhexagon/openHexagonUiModel.test.js`: 통과, 3 files / 12 tests; OpenHexagon model/UI regression verified after renderer extraction
- `frontend`: `npm.cmd run build`: 통과; `openHexagonCanvasRenderer.js` and `OpenHexagonArena.css` extraction compiled through Vite
- `frontend`: `npm.cmd run test:unit -- src/views/workspace/composables/useWorkspaceShellState.test.js`: 통과, 1 file / 3 tests
- `frontend`: `npm.cmd run test:unit -- src/views/workspace/composables/useWorkspaceSseRoleChange.test.js`: 통과, 1 file / 3 tests
- `frontend`: `npm.cmd run test:unit -- src/views/workspace/composables/useWorkspaceDocumentNavigation.test.js src/views/workspace/composables/useWorkspaceSseRoleChange.test.js src/views/workspace/composables/useWorkspaceShellState.test.js`: 통과, 3 files / 11 tests
- `frontend`: `npm.cmd run test:unit -- src/views/dashboard/services/adminDashboardFormat.test.js`: 통과, 1 file / 4 tests
- `frontend`: `npm.cmd run test:unit -- src/views/dashboard/services/adminDashboardViewModels.test.js src/views/dashboard/components/AdminPlanSection.test.js`: 통과, 2 files / 7 tests; admin plan summary/mix/row helpers and plan section rendering verified
- `frontend`: `npm.cmd run test:unit -- src/views/dashboard/services/adminDashboardFormat.test.js src/views/dashboard/services/adminDashboardViewModels.test.js`: 통과, 2 files / 9 tests; administrator styles are imported once from `AdministratorView.css`, storage panel rendering moved to `AdminStorageSection.vue`, and plan panel rendering moved to `AdminPlanSection.vue`.
- `frontend`: `npm.cmd run test:public-assets`: 통과
- `frontend`: `npm.cmd run test:workspace-readonly`: 통과
- `frontend`: `npm.cmd run test:workspace-collab-ui`: 통과; componentized workspace/editor sources are included in the verifier.
- `frontend`: `npm.cmd run test:chat-room-ui`: 통과
- `frontend`: `npm.cmd run test:unit -- src/views/workspace/composables/useWorkspacePreferenceStores.test.js`: 통과, 1 file / 2 tests; workspace preference storage key/state wiring extraction verified.
- `frontend`: `npm.cmd run test:unit -- src/views/workspace/composables/useWorkspaceRuntimeLifecycle.test.js`: 통과, 1 file / 1 test; runtime lifecycle/editor setup/watcher wiring extraction verified.
- `frontend`: `npm.cmd run test:workspace-collab-ui`: 통과; `useWorkspaceRuntimeLifecycle.js` 분리 후 workspace collaboration verifier 통과.
- `frontend`: `npm.cmd run build`: 통과; `useWorkspaceRuntimeLifecycle.js` 분리 후 Vite bundle 검증.
- `scripts/verify-local.ps1 -JavaHome C:\jdk-17 -Python <bundled-python>`: 통과; docs/security/deployment/storage/db migration, frontend public assets, unit 166 files / 622 tests, Vite build, backend Gradle tests, desktop `py_compile`/Python unittest 41 tests/offline verification, git whitespace check verified.
- `frontend`: `npm.cmd run test:e2e`: 통과, 9 tests; 로그인 실패 리다이렉트, 관리자 로그인, 일반 사용자 관리자 페이지 접근 차단, 관리자 사용자 상태 변경과 스토리지 탭 렌더링, 공유 감사 로그 표시, 세션 강제 종료, 홈 드라이브 파일 다운로드, 업로드, 공유, 잠금 검증
- `desktop-client`: Python `py_compile`: 통과
- `desktop-client`: Python unittest: 통과, 41 tests
- `desktop-client`: `verify_desktop_client.py`: 통과
- `desktop-client`: `package-windows.ps1 -Version local-sync-command-runner-check`: 통과
- `desktop-client`: `verify_windows_package.ps1 -PackagePath desktop-client/dist/FileInNOutDesktop-local-sync-command-runner-check.zip`: 통과
- `desktop-client`: `package-windows.ps1 -Version namespace-helper-check`: 통과; `DesktopExplorerNamespace.cs` included in tray build/package list
- `desktop-client`: `verify_windows_package.ps1 -PackagePath desktop-client/dist/FileInNOutDesktop-namespace-helper-check.zip -PythonPath <bundled-python>`: 통과; package manifest/helper extraction/install smoke verified
- `desktop-client`: `package-windows.ps1 -Version pathrules-helper-check`: 통과; C# tray package build verified after moving path rules to `DesktopPathRules.cs`
- `desktop-client`: `verify_windows_package.ps1 -PackagePath desktop-client/dist/FileInNOutDesktop-pathrules-helper-check.zip -PythonPath <bundled-python>`: 통과; package manifest/helper extraction/install smoke verified with `DesktopPathRules.SamePath` self-referential junction guard
- `desktop-client`: `package-windows.ps1 -Version tray-visuals-helper-check`: 통과; C# tray package build verified after moving tray icon fallback rendering to `DesktopTrayVisuals.cs`
- `desktop-client`: `verify_windows_package.ps1 -PackagePath desktop-client/dist/FileInNOutDesktop-tray-visuals-helper-check.zip -PythonPath <bundled-python>`: 통과; package manifest/helper extraction/install smoke verified with extracted tray visuals helper
- `desktop-client`: `package-windows.ps1 -Version settings-ui-helper-check`: 통과; C# tray package build verified after moving SettingsForm shared label/text-box factories to `DesktopUiControls.cs`
- `desktop-client`: `verify_windows_package.ps1 -PackagePath desktop-client/dist/FileInNOutDesktop-settings-ui-helper-check.zip -PythonPath <bundled-python>`: 통과; package manifest/helper extraction/install smoke verified with SettingsForm UI helper extraction
- `desktop-client`: `package-windows.ps1 -Version settings-text-helper-check`: 통과; C# tray package build verified after moving SettingsForm storage/status text composition to `DesktopSettingsText.cs`
- `desktop-client`: `verify_windows_package.ps1 -PackagePath desktop-client/dist/FileInNOutDesktop-settings-text-helper-check.zip -PythonPath <bundled-python>`: 통과; package manifest/helper extraction/install smoke verified with SettingsForm text helper extraction
- `desktop-client`: `package-windows.ps1 -Version settings-ui-factory-check`: 통과; C# tray package build verified after moving repeated SettingsForm button/checkbox/dropdown/list/log factories to `DesktopUiControls.cs`
- `desktop-client`: `verify_windows_package.ps1 -PackagePath desktop-client/dist/FileInNOutDesktop-settings-ui-factory-check.zip -PythonPath <bundled-python>`: 통과; package manifest/helper extraction/install smoke verified with expanded SettingsForm UI factories
- `desktop-client`: `package-windows.ps1 -Version tray-menu-helper-check`: 통과; C# tray package build verified after moving tray context menu rendering to `DesktopTrayMenu.cs`
- `desktop-client`: `verify_windows_package.ps1 -PackagePath desktop-client/dist/FileInNOutDesktop-tray-menu-helper-check.zip -PythonPath <bundled-python>`: 통과; package manifest/helper extraction/install smoke verified with extracted tray menu helper
- `desktop-client`: `package-windows.ps1 -Version drive-mapping-helper-check`: 통과; C# tray package build verified after moving subst drive mapping and drive appearance registration to `DesktopDriveMapping.cs`
- `desktop-client`: `verify_windows_package.ps1 -PackagePath desktop-client/dist/FileInNOutDesktop-drive-mapping-helper-check.zip -PythonPath <bundled-python>`: 통과; package manifest/helper extraction/install smoke verified with extracted drive mapping helper
- `desktop-client`: `package-windows.ps1 -Version drive-hub-maintenance-check`: 통과; C# tray package build verified after moving drive hub junction cleanup and shared-owner folder maintenance to `DesktopDriveHubMaintenance.cs`
- `desktop-client`: `verify_windows_package.ps1 -PackagePath desktop-client/dist/FileInNOutDesktop-drive-hub-maintenance-check.zip -PythonPath <bundled-python>`: 통과; package manifest/helper extraction/install smoke verified with extracted drive hub maintenance helper
- `desktop-client`: `package-windows.ps1 -Version folder-profile-rules-check`: 통과; C# tray package build verified after moving folder profile normalization/removal/signature logic to `DesktopFolderProfileRules.cs`
- `desktop-client`: `verify_windows_package.ps1 -PackagePath desktop-client/dist/FileInNOutDesktop-folder-profile-rules-check.zip -PythonPath <bundled-python>`: 통과; package manifest/helper extraction/install smoke verified with extracted folder profile rules helper
- `desktop-client`: `package-windows.ps1 -Version installer-drive-hub-helper-check`: 통과; Windows installer drive mapping and drive hub routines packaged from `install-windows-drive-hub.ps1`
- `desktop-client`: `verify_windows_package.ps1 -PackagePath desktop-client/dist/FileInNOutDesktop-installer-drive-hub-helper-check.zip -PythonPath <bundled-python>`: 통과; package manifest/helper extraction/install smoke verified with dot-sourced installer drive hub helper
- `desktop-client`: `package-windows-exe.ps1 -Version installer-drive-hub-helper-check`: 통과; setup EXE, public installer zip, and desktop update manifest generated with the split installer helper
- `desktop-client`: `verify_windows_package.ps1 -PackagePath desktop-client/dist/FileInNOutDesktop.zip -PythonPath <bundled-python>`: 통과; default ZIP artifact produced by EXE packaging verified with install/uninstall smoke test
- `desktop-client`: `package-windows-exe.ps1 -Version setup-template-valid-check`: 통과; setup wizard source compiled from `FileInNOutDesktopSetup.cs` template
- `desktop-client`: `verify_windows_package.ps1 -PackagePath desktop-client/dist/FileInNOutDesktop.zip -PythonPath <bundled-python>`: 통과; default ZIP artifact verified after setup wizard template extraction and syntax-valid placeholder update
- `desktop-client`: `FileInNOutDesktopSetup.exe --verify`: 통과; generated setup EXE validated embedded payload version `setup-template-valid-check`
- `desktop-client`: `package-windows-exe.ps1 -Version setup-form-split-check`: 통과; setup wizard form compiled from `FileInNOutDesktopSetupForm.cs` alongside `FileInNOutDesktopSetup.cs`
- `desktop-client`: `verify_windows_package.ps1 -PackagePath desktop-client/dist/FileInNOutDesktop.zip -PythonPath <bundled-python>`: 통과; default ZIP artifact verified after setup wizard form extraction
- `desktop-client`: `FileInNOutDesktopSetup.exe --verify`: 통과; generated setup EXE validated embedded payload version `setup-form-split-check`
- `desktop-client`: `package-windows.ps1 -Version installer-shell-helper-check`: 통과; Windows installer shell/Explorer/registry/context-menu/shortcut routines packaged from `install-windows-shell.ps1`
- `desktop-client`: `verify_windows_package.ps1 -PackagePath desktop-client/dist/FileInNOutDesktop-installer-shell-helper-check.zip -PythonPath <bundled-python>`: 통과; package manifest/helper extraction/install smoke verified with dot-sourced installer shell helper
- `desktop-client`: `package-windows-exe.ps1 -Version installer-shell-helper-check`: 통과; setup EXE, public installer zip, and desktop update manifest generated with split shell helper
- `desktop-client`: `verify_windows_package.ps1 -PackagePath desktop-client/dist/FileInNOutDesktop.zip -PythonPath <bundled-python>`: 통과; default ZIP artifact verified after installer shell helper extraction
- `desktop-client`: `FileInNOutDesktopSetup.exe --verify`: 통과; generated setup EXE validated embedded payload version `installer-shell-helper-check`
- `desktop-client`: `package-windows.ps1 -Version tray-preferences-helper-check`: 통과; tray preference JSON load/save logic packaged from `DesktopTrayPreferences.cs`
- `desktop-client`: `verify_windows_package.ps1 -PackagePath desktop-client/dist/FileInNOutDesktop-tray-preferences-helper-check.zip -PythonPath <bundled-python>`: 통과; package manifest/helper extraction/install smoke verified with extracted tray preferences helper
- `desktop-client`: `package-windows-exe.ps1 -Version tray-preferences-helper-check`: 통과; setup EXE, public installer zip, and desktop update manifest generated with split tray preferences helper
- `desktop-client`: `verify_windows_package.ps1 -PackagePath desktop-client/dist/FileInNOutDesktop.zip -PythonPath <bundled-python>`: 통과; default ZIP artifact verified after tray preferences helper extraction
- `desktop-client`: `FileInNOutDesktopSetup.exe --verify`: 통과; generated setup EXE validated embedded payload version `tray-preferences-helper-check`
- `desktop-client`: `package-windows.ps1 -Version settings-dialog-text-helper-check`: 통과; SettingsForm dialog/error text packaged from `DesktopSettingsDialogText.cs`
- `desktop-client`: `verify_windows_package.ps1 -PackagePath desktop-client/dist/FileInNOutDesktop-settings-dialog-text-helper-check.zip -PythonPath <bundled-python>`: 통과; package manifest/helper extraction/install smoke verified with extracted settings dialog text helper
- `desktop-client`: `package-windows-exe.ps1 -Version settings-dialog-text-helper-check`: 통과; setup EXE, public installer zip, and desktop update manifest generated with split settings dialog text helper
- `desktop-client`: `verify_windows_package.ps1 -PackagePath desktop-client/dist/FileInNOutDesktop.zip -PythonPath <bundled-python>`: 통과; default ZIP artifact verified after settings dialog text helper extraction
- `desktop-client`: `FileInNOutDesktopSetup.exe --verify`: 통과; generated setup EXE validated embedded payload version `settings-dialog-text-helper-check`
- `desktop-client`: `package-windows.ps1 -Version installer-source-helper-check`: 통과; source-install tray compile/copy fallback includes split C# helper files
- `desktop-client`: `verify_windows_package.ps1 -PackagePath desktop-client/dist/FileInNOutDesktop-installer-source-helper-check.zip -PythonPath <bundled-python>`: 통과; package manifest/helper extraction/install smoke verified with installer source-helper guard
- `desktop-client`: `package-windows-exe.ps1 -Version installer-source-helper-check`: 통과; setup EXE, public installer zip, and desktop update manifest generated after source-install helper inclusion fix
- `desktop-client`: `verify_windows_package.ps1 -PackagePath desktop-client/dist/FileInNOutDesktop.zip -PythonPath <bundled-python>`: 통과; default ZIP artifact verified after installer source-helper inclusion fix
- `desktop-client`: `FileInNOutDesktopSetup.exe --verify`: 통과; generated setup EXE validated embedded payload version `installer-source-helper-check`
- `desktop-client`: C# tray compile check with `DesktopSearchService.cs`: 통과
- `desktop-client`: C# tray compile check with `DesktopDriveHubLinks.cs`: 통과
- `desktop-client`: PowerShell parse check for install/package/verify scripts after `DesktopExplorerNamespace.cs` package-list update: 통과
- `desktop-client`: PowerShell parse check for `verify_windows_package.ps1` and `verify_windows_package_helpers.ps1`: 통과; package path, required-file, and manifest checksum verifier helpers split
- `desktop-client`: `verify_windows_package.ps1 -PackagePath desktop-client/dist/FileInNOutDesktop-codex-installer-payload-helper-check.zip -PythonPath <bundled-python>`: 통과; split verifier helper dot-source, manifest validation, Python compile, and install/uninstall smoke verified
- `backend`: `ChatAttachmentStorageServiceTest`, `ChatMessageServicePermissionTest`: 통과
- `backend`: `UploadServiceTest`, `UploadObjectStorageServiceTest`: 통과
- `node devops/scripts/verify-storage-transaction-boundaries.mjs`: `ChatMessageService`, `UploadService`, `ShareFileAccessService` MinIO 의존성 분리와 storage/DB transaction 경계 검증

## 추가 기능 제안

개발 범위를 Notion 페이지 또는 블로그 페이지 하나 정도로 제한한다면 우선순위는 다음 순서가 적합합니다.

1. 공유 감사 로그 화면
   - 공유 생성, 권한 변경, 다운로드, 공유 취소 이력을 보여줍니다.
   - 이미 공유 정책/감사 서비스가 보강되어 있어 작은 페이지로 구현하기 가장 적합합니다.

2. 데스크탑 동기화 상태 화면
   - 최근 sync 시간, 실패 항목, 충돌 파일, 연결 서버를 보여줍니다.
   - 데스크탑 기능의 신뢰도를 사용자에게 설명하기 좋습니다.

3. 스토리지 정합성 점검 화면
   - DB metadata와 object storage 불일치 후보를 관리자에게 보여줍니다.
   - 장기적으로 cleanup job과 연결할 수 있습니다.

권장 1순위는 공유 감사 로그 화면입니다. 기존 공유 기능과 직접 연결되고, 페이지 하나 범위로 설계하기 가장 적합합니다.

## 다음 작업 순서

1. `WorkSpace.vue`의 남은 orchestration을 editor/document/asset/task/comment 단위로 계속 분리합니다.
2. `FileInNOutDesktopTray.cs`에 남은 Windows adapter와 Explorer/drive orchestration을 더 좁은 partial/helper로 분리합니다.
3. Split remaining installer startup task/app registration orchestration into focused modules if installer changes continue.
4. `ShareService`의 남은 정책/감사 흐름과 `FileUpDownloadMinioService`의 listing/move/lock orchestration을 더 작은 service로 나눕니다.
5. Playwright E2E를 실제 서버 smoke, 대용량/오류/권한별 다운로드, 폴더 업로드, 공유 취소까지 확장합니다.
6. Helm template 검증과 전체 test suite를 CI release gate에 연결합니다.
