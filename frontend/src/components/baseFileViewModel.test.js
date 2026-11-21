import { describe, expect, it } from "vitest";

import {
  aggregateBaseShareInfoEntries,
  buildBaseActiveFilterChips,
  buildBaseSharePolicyOptions,
  buildBaseCustomSizeRangeLabel,
  buildBasePageCount,
  buildBasePageNumbers,
  buildBaseServerListQuery,
  buildBaseToolbarMetaLabel,
  buildBaseTotalSizeLabel,
  buildCurrentFolderVisibleSummary,
  buildFolderSummaryCards,
  buildSelectedBaseFileGroups,
  collectBaseFileExtensions,
  filterAndSortBaseFiles,
  formatBaseSharedFilesLabel,
  formatBaseSharePermissionLabel,
  formatBaseSharePolicyLabel,
  getSelectedBaseFiles,
  hasBaseSearchFilters,
  matchesBaseFileSizeFilter,
  paginateBaseFiles,
  resolveEffectivePageSize,
  resolveEmptyFolderNavigationState,
} from "./baseFileViewModel.js";

const MB = 1024 * 1024;

describe("baseFileViewModel", () => {
  it("builds extension options and folder summaries", () => {
    const files = [
      { id: 1, type: "file", extension: "PDF", sizeBytes: 2 * MB },
      { id: 2, type: "folder", fileFormat: "txt", sizeBytes: 9 * MB },
      { id: 3, type: "file", fileFormat: "pdf", sizeBytes: 3 * MB },
    ];

    expect(collectBaseFileExtensions({ files })).toEqual(["pdf", "txt"]);
    expect(collectBaseFileExtensions({ useServerPaging: true, serverExtensions: ["docx"] })).toEqual(["docx"]);

    const summary = buildCurrentFolderVisibleSummary({ id: 10 }, files);
    expect(summary).toMatchObject({ visibleChildCount: 3, visibleFileCount: 2, visibleFolderCount: 1, visibleSizeLabel: "5.00 MB" });
    expect(buildCurrentFolderVisibleSummary(null, files)).toBeNull();
    expect(buildFolderSummaryCards(summary).map((card) => card.key)).toEqual(["items", "files", "folders", "size"]);
  });

  it("builds search chips and filters files", () => {
    const searchState = {
      searchQuery: "owner",
      extensionFilter: "pdf",
      sizeFilter: "custom",
      customMinSize: "1",
      customMaxSize: "10",
      statusFilter: "shared-owned",
    };
    const files = [
      { id: 1, name: "Plan.pdf", extension: "pdf", ownerEmail: "owner@example.com", sharedFile: true, sizeBytes: 2 * MB, updatedAt: "2026-07-05T00:00:00Z" },
      { id: 2, name: "Big.pdf", extension: "pdf", ownerEmail: "owner@example.com", sharedFile: true, sizeBytes: 20 * MB, updatedAt: "2026-07-06T00:00:00Z" },
      { id: 3, name: "Other.txt", extension: "txt", ownerEmail: "owner@example.com", sizeBytes: 2 * MB, updatedAt: "2026-07-07T00:00:00Z" },
    ];

    expect(buildBaseCustomSizeRangeLabel(searchState)).toBe("1MB ~ 10MB");
    expect(hasBaseSearchFilters(searchState)).toBe(true);
    expect(buildBaseActiveFilterChips(searchState, "name-asc", {
      sizeOptionLabelMap: { custom: "사용자 설정" },
      statusOptionLabelMap: { "shared-owned": "내가 공유" },
      sortOptions: [{ label: "이름 오름차순", value: "name-asc" }],
    })).toEqual(["검색: owner", "확장자: PDF", "크기: 사용자 설정", "상태: 내가 공유", "정렬: 이름 오름차순"]);
    expect(matchesBaseFileSizeFilter(files[0], searchState)).toBe(true);
    expect(matchesBaseFileSizeFilter(files[1], searchState)).toBe(false);
    expect(filterAndSortBaseFiles(files, searchState, "updatedAt-desc").map((file) => file.id)).toEqual([1]);
  });

  it("builds selection groups and pagination", () => {
    const files = [
      { id: 1, type: "file", downloadUrl: "/a", sizeBytes: MB },
      { id: 2, type: "file", sharedWithMe: true, downloadable: true, sizeBytes: MB },
      { id: 3, type: "file", sharedFile: true, sizeBytes: MB },
      { id: 4, type: "file", lockedFile: true, sizeBytes: MB },
    ];
    const selected = getSelectedBaseFiles(files, [1, "2", 3, 4]);
    const groups = buildSelectedBaseFileGroups(selected, { sharedLibrary: true, canCreateShares: true });

    expect(selected).toHaveLength(4);
    expect(groups.downloadableFiles.map((file) => file.id)).toEqual([1, 2]);
    expect(groups.sharedFiles.map((file) => file.id)).toEqual([2]);
    expect(groups.ownedShareableFiles.map((file) => file.id)).toEqual([1, 3]);
    expect(groups.cancelableSentSharedFiles.map((file) => file.id)).toEqual([3]);
    expect(groups.lockCandidates.map((file) => file.id)).toEqual([1, 3]);
    expect(groups.lockedFiles.map((file) => file.id)).toEqual([4]);

    const driveSelected = getSelectedBaseFiles([
      ...files,
      { id: 5, type: "folder", fileSaveName: "folder-5", sizeBytes: 0 },
      { id: 6, type: "folder", isVaultSpace: true, sizeBytes: 0 },
    ], [1, 2, 3, 4, 5, 6]);
    const driveGroups = buildSelectedBaseFileGroups(driveSelected, { sharedLibrary: false, canCreateShares: true });
    expect(driveGroups.vaultMovableFiles.map((file) => file.id)).toEqual([1, 5]);
    expect(buildSelectedBaseFileGroups(driveSelected, { sharedLibrary: false, vaultMode: true }).vaultMovableFiles).toEqual([]);

    expect(buildBaseTotalSizeLabel(files)).toBe("4.00 MB");
    expect(buildBaseToolbarMetaLabel({ filteredFiles: files, totalSizeLabel: "4.00 MB" })).toBe("4개 항목 · 총 4.00 MB");
    expect(buildBaseToolbarMetaLabel({ useServerPaging: true, drivePageInfo: { totalCount: 10 }, filteredFiles: files, totalSizeLabel: "4.00 MB" }))
      .toBe("총 10개 항목 · 현재 페이지 4개 · 총 4.00 MB");
    expect(buildBasePageCount({ filteredFiles: files, pageSize: 2 })).toBe(2);
    expect(buildBasePageCount({ useServerPaging: true, drivePageInfo: { totalPage: 7 }, filteredFiles: files, pageSize: 2 })).toBe(7);
    expect(paginateBaseFiles({ filteredFiles: files, currentPage: 2, pageSize: 2 }).map((file) => file.id)).toEqual([3, 4]);
    expect(buildBasePageNumbers(4, 9)).toEqual([2, 3, 4, 5, 6]);
  });

  it("builds server list queries", () => {
    expect(buildBaseServerListQuery({ useServerPaging: false })).toBeNull();
    expect(buildBaseServerListQuery({
      useServerPaging: true,
      currentFolderId: 9,
      currentPage: 3,
      pageSize: 20,
      sortOption: "name-asc",
      searchState: {
        searchQuery: " report ",
        extensionFilter: "pdf",
        sizeFilter: "lte10",
        customMinSize: "",
        customMaxSize: "",
        statusFilter: "locked",
      },
    })).toEqual({
      parentId: 9,
      page: 2,
      size: 20,
      sortOption: "name-asc",
      searchQuery: "report",
      searchScope: "current",
      searchRootFolderId: null,
      extensionFilter: "pdf",
      sizeFilter: "lte10",
      customMinSize: "",
      customMaxSize: "",
      statusFilter: "locked",
      vaultMode: false,
      includeHidden: false,
      trashedOnly: false,
    });
    expect(buildBaseServerListQuery({
      useServerPaging: true,
      searchState: {
        searchQuery: ".pdf",
        searchScope: "root",
        searchRootFolderId: 42,
        extensionFilter: "*.jpg, .png",
      },
      vaultMode: true,
      includeHidden: true,
      trashedOnly: true,
    })).toMatchObject({
      searchScope: "root",
      searchRootFolderId: 42,
      extensionFilter: "jpg, png",
      vaultMode: true,
      includeHidden: true,
      trashedOnly: true,
    });
  });

  it("supports multi-extension filters, inline extensions, and search scope chips", () => {
    const sampleFiles = [
      { id: 1, name: "2026 계약 보고서.pdf", extension: "pdf", type: "file", sizeBytes: 100 },
      { id: 2, name: "logo.png", extension: "png", type: "file", sizeBytes: 100 },
      { id: 3, name: "notes.txt", extension: "txt", type: "file", sizeBytes: 100 },
    ];

    expect(filterAndSortBaseFiles(sampleFiles, { searchQuery: "계약 .pdf" }).map((f) => f.id)).toEqual([1]);
    expect(filterAndSortBaseFiles(sampleFiles, { extensionFilter: ".pdf, png" }).map((f) => f.id)).toEqual([1, 2]);
    expect(hasBaseSearchFilters({ searchScope: "root" })).toBe(true);
    expect(hasBaseSearchFilters({ extensionFilter: ".pdf, png" })).toBe(true);
    expect(
      buildBaseActiveFilterChips(
        {
          searchScope: "root",
          searchRootFolderId: 10,
          extensionFilter: ".pdf, png",
        },
        "updatedAt-desc",
        { rootFolders: [{ id: 10, name: "자료" }] },
      ),
    ).toEqual(["위치: 루트 (자료)", "확장자: PDF, PNG"]);
  });
  it("aggregates shared recipients and formats share policy labels", () => {
    const entries = aggregateBaseShareInfoEntries([
      { recipientEmail: "User@example.com", recipientName: "User", permission: "READ", fileOriginName: "a.txt", createdAt: "2026-07-01T00:00:00Z" },
      { recipientEmail: "user@example.com", permission: "WRITE", fileOriginName: "b.txt", createdAt: "2026-07-02T00:00:00Z", downloadLimit: 3, downloadCount: 1, passwordProtected: true },
      { recipientEmail: "other@example.com", permission: "UPLOAD", fileOriginName: "c.txt", createdAt: "2026-07-03T00:00:00Z", expired: true },
    ]);

    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ recipientEmail: "other@example.com", permission: "UPLOAD", fileCount: 1 });
    expect(entries[1]).toMatchObject({ recipientEmail: "User@example.com", permission: "WRITE", fileCount: 2, downloadLimit: 3, passwordProtected: true });
    expect(formatBaseSharedFilesLabel(entries[1])).toBe("a.txt, b.txt");
    expect(formatBaseSharePermissionLabel("DOWNLOAD")).toBe("보기 + 다운로드");
    expect(formatBaseSharePolicyLabel(entries[1])).toContain("다운로드: 1/3");
    expect(formatBaseSharePolicyLabel(entries[1])).toContain("비밀번호 보호");
    expect(buildBaseSharePolicyOptions({ expiresAt: "2026-07-20", downloadLimit: "3.7", sharePassword: " secret " })).toEqual({
      expiresAt: "2026-07-20",
      downloadLimit: 3,
      sharePassword: "secret",
    });
  });

  it("resolves empty folder parent and back-history navigation states accurately", () => {
    expect(resolveEmptyFolderNavigationState({
      showFolderNavigation: true,
      currentFolderId: null,
      currentFolder: null,
    })).toEqual({
      inSubfolder: false,
      parentId: null,
      parentLabel: "",
      hasHistoryBack: false,
      historyBackId: null,
      historyBackLabel: "",
      isHistorySameAsParent: false,
      canGoBack: false,
    });

    expect(resolveEmptyFolderNavigationState({
      showFolderNavigation: true,
      currentFolderId: 20,
      currentFolder: { id: 20, name: "temp", parentId: null },
      folderPathSegments: [
        { id: null, name: "홈" },
        { id: 20, name: "temp" },
      ],
      backStackEntry: { id: null, label: "홈" },
    })).toEqual({
      inSubfolder: true,
      parentId: null,
      parentLabel: "홈",
      hasHistoryBack: true,
      historyBackId: null,
      historyBackLabel: "홈",
      isHistorySameAsParent: true,
      canGoBack: true,
    });

    expect(resolveEmptyFolderNavigationState({
      showFolderNavigation: true,
      currentFolderId: 20,
      currentFolder: { id: 20, name: "temp", parentId: null },
      folderPathSegments: [
        { id: null, name: "홈" },
        { id: 20, name: "temp" },
      ],
      backStackEntry: { id: 99, label: "서브" },
    })).toEqual({
      inSubfolder: true,
      parentId: null,
      parentLabel: "홈",
      hasHistoryBack: true,
      historyBackId: 99,
      historyBackLabel: "서브",
      isHistorySameAsParent: false,
      canGoBack: true,
    });

    expect(resolveEmptyFolderNavigationState({
      showFolderNavigation: true,
      isVaultTrashView: true,
      currentFolderId: 20,
      currentFolder: { id: 20, name: "temp", parentId: null },
    }).canGoBack).toBe(false);
  });

  it("subtracts 1 slot from effective page size when the parent folder navigator button is shown", () => {
    expect(resolveEffectivePageSize(50, false)).toBe(50);
    expect(resolveEffectivePageSize(50, true)).toBe(49);
    expect(resolveEffectivePageSize(30, true)).toBe(29);
    expect(resolveEffectivePageSize(20, true)).toBe(19);
    expect(resolveEffectivePageSize(10, true)).toBe(9);
    expect(resolveEffectivePageSize(1, true)).toBe(1);
  });
});
