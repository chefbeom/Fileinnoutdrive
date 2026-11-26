import { describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import { mount } from "@vue/test-utils";
import FileCollectionGrid from "./FileCollectionGrid.vue";
import { FILE_COLLECTION_CONTEXT_KEY } from "./FileCollectionContext.js";

import {
  buildCollectionStyle,
  computeRangeSelectionIds,
  extractCollectionExtension,
  formatCollectionDisplaySize,
  getCollectionActionAvailability,
  getCollectionDragFileIds,
  getCollectionFileExtension,
  getCollectionFileName,
  getCollectionGridClassName,
  getCollectionSentShareLabel,
  getCollectionSharedSourceLabel,
  getCollectionStatusChips,
  isCollectionImage,
  isCollectionManagedThumbnailCandidate,
  isCollectionVideo,
  readCollectionDraggedFileIds,
} from "./fileCollectionViewModel.js";

describe("fileCollectionViewModel", () => {
  it("formats collection layout and file metadata", () => {
    expect(getCollectionGridClassName("icon")).toBe("file-icon-grid");
    expect(getCollectionGridClassName("grid")).toBe("file-card-grid");
    expect(getCollectionGridClassName("table")).toBe("");
    expect(buildCollectionStyle("table", 8)).toBeUndefined();
    expect(buildCollectionStyle("grid", 8)).toMatchObject({
      "--collection-columns": "8",
      "--collection-gap": "16px",
    });
    expect(buildCollectionStyle("grid", 5, "small")).toMatchObject({
      "--collection-columns": "8",
    });
    expect(buildCollectionStyle("icon", 5, "small")).toMatchObject({
      "--collection-columns": "10",
      "--card-preview-height": "auto",
    });
    expect(buildCollectionStyle("icon", 5, "medium")).toMatchObject({
      "--collection-columns": "7",
      "--card-preview-height": "auto",
    });
    expect(buildCollectionStyle("icon", 5, "large")).toMatchObject({
      "--collection-columns": "5",
      "--card-preview-height": "auto",
    });

    expect(extractCollectionExtension("Report.PDF")).toBe("pdf");
    expect(extractCollectionExtension("no-extension")).toBe("");
    expect(getCollectionFileName({ fileOriginName: "origin.txt" })).toBe("origin.txt");
    expect(getCollectionFileExtension({ name: "image.PNG" })).toBe("png");
    expect(formatCollectionDisplaySize({ fileSize: 1536 })).toBe("1.50 KB");
  });

  it("builds shared labels and status chips", () => {
    expect(getCollectionSharedSourceLabel({ ownerEmail: "owner@example.com", sharedAtLabel: "2026-07-05" }))
      .toBe("\uACF5\uC720\uC790: owner@example.com | 2026-07-05");
    expect(getCollectionSentShareLabel({ recipientCount: 2, sharedAtLabel: "2026-07-05" }))
      .toBe("\uACF5\uC720 \uB300\uC0C1 2\uBA85 | 2026-07-05");
    expect(getCollectionStatusChips({ sharedWithMe: true, lockedFile: true }).map((chip) => chip.key))
      .toEqual(["shared-with-me", "locked"]);
    expect(getCollectionStatusChips({ hiddenFolder: true, pinEnabled: true, pinRegistered: true }).map((chip) => chip.key))
      .toEqual(["hidden-folder", "folder-pin"]);
    expect(getCollectionStatusChips({}).map((chip) => chip.key)).toEqual(["normal"]);
  });

  it("classifies media and action availability", () => {
    expect(isCollectionImage({ type: "file", contentType: "image/png" })).toBe(true);
    expect(isCollectionImage({ type: "file", contentType: "image/png" }, true)).toBe(false);
    expect(isCollectionVideo({ type: "file", name: "clip.mp4" })).toBe(true);
    expect(isCollectionManagedThumbnailCandidate({ type: "file", name: "clip.mp4" })).toBe(true);
    expect(isCollectionManagedThumbnailCandidate({ type: "file", name: "large-movie.mp4", sizeBytes: 1_200_000_000 })).toBe(true);
    expect(isCollectionManagedThumbnailCandidate({ type: "folder", name: "clip.mp4" })).toBe(false);

    expect(getCollectionActionAvailability({ type: "file", downloadUrl: "/d" }, {
      canCreateShares: true,
      canCreateLocks: true,
    })).toMatchObject({
      canDownload: true,
      canDelete: true,
      canShare: true,
      canToggleLock: true,
      canMoveToVault: true,
      isMovable: true,
    });
    expect(getCollectionActionAvailability({ type: "file", sharedWithMe: true, downloadable: true })).toMatchObject({
      canDownload: true,
      canDelete: false,
      canSaveShared: true,
      canMoveToVault: false,
      isMovable: false,
    });
    expect(getCollectionActionAvailability({ type: "folder" })).toMatchObject({
      canDownload: true,
      canManageFolder: true,
      canConfigureSecret: true,
      canMoveToVault: true,
      isMovable: true,
    });
    expect(getCollectionActionAvailability({ type: "folder", sharedFile: true }).canMoveToVault).toBe(false);
    expect(getCollectionActionAvailability({ type: "folder", fileSaveName: "shared-storage-7" }).canMoveToVault).toBe(false);
    expect(getCollectionActionAvailability({ type: "file", lockedFile: true }).canMoveToVault).toBe(false);
    expect(getCollectionActionAvailability({ type: "folder", isVaultSpace: true }).canMoveToVault).toBe(false);
    expect(getCollectionActionAvailability({ type: "folder" }, { vaultMode: true }).canMoveToVault).toBe(false);
    expect(getCollectionActionAvailability({ type: "folder" }, { deleteMode: "permanent" }).canMoveToVault).toBe(false);
    expect(getCollectionActionAvailability({ type: "folder" }, { sharedLibrary: true }).canMoveToVault).toBe(false);
    expect(getCollectionActionAvailability({ type: "folder", hiddenFolder: true }, { canCreateShares: true })).toMatchObject({
      canConfigureSecret: true,
      canShare: false,
    });
    expect(getCollectionActionAvailability({ type: "folder", isVaultSpace: true })).toMatchObject({
      canConfigureSecret: false,
      canShare: false,
      canMoveFromVault: false,
    });
    expect(getCollectionActionAvailability({ type: "folder", isVaultSpace: true }, { vaultMode: true })).toMatchObject({
      canMoveToVault: false,
      canMoveFromVault: true,
    });
    expect(getCollectionActionAvailability({ type: "file", isVaultSpace: true, lockedFile: true }, { vaultMode: true }).canMoveFromVault).toBe(false);
    expect(getCollectionActionAvailability({ type: "file", isVaultSpace: true, isTrash: true }, { vaultMode: true }).canMoveFromVault).toBe(false);
    expect(getCollectionActionAvailability({ type: "file", isVaultSpace: true }, { vaultMode: true, deleteMode: "permanent" }).canMoveFromVault).toBe(false);
    expect(getCollectionActionAvailability({ type: "folder", isTrash: true }).canDownload).toBe(false);
    expect(getCollectionActionAvailability({ type: "folder" }, { deleteMode: "permanent" }).canDownload).toBe(false);
    expect(getCollectionActionAvailability({ type: "folder", lockedFile: true }).canDownload).toBe(false);
  });

  it("normalizes drag payloads", () => {
    expect(getCollectionDragFileIds({ id: 7 }, [])).toEqual(["7"]);
    expect(getCollectionDragFileIds({ id: 7 }, [1, "2"])).toEqual(["1", "2"]);
    expect(readCollectionDraggedFileIds('{"fileIds":[1,"2"]}', [])).toEqual(["1", "2"]);
    expect(readCollectionDraggedFileIds("not-json", ["fallback"])).toEqual(["fallback"]);
  });

  it("computes Shift+Click range selection across files (e.g., 5 to 25 out of 1..40)", () => {
    const fortyFiles = Array.from({ length: 40 }, (_, index) => ({
      id: index + 1,
      name: `file-${index + 1}.txt`,
      type: "file",
    }));

    const expectedFiveToTwentyFive = Array.from({ length: 21 }, (_, idx) => String(idx + 5));

    // 5번 파일 선택 후 25번 파일 Shift+클릭
    const forwardSelection = computeRangeSelectionIds(fortyFiles, ["5"], 5, 25, true);
    expect(forwardSelection).toEqual(expectedFiveToTwentyFive);

    // 역방향: 25번 파일 선택 후 5번 파일 Shift+클릭
    const reverseSelection = computeRangeSelectionIds(fortyFiles, ["25"], 25, 5, true);
    expect(reverseSelection.sort((a, b) => Number(a) - Number(b))).toEqual(expectedFiveToTwentyFive);
  });

  it("hides checkboxes in icon mode and applies selected highlight class", async () => {
    const toggleFileSelection = vi.fn();
    const handlePrimaryAction = vi.fn();
    const selectedIdSet = ref(new Set(["101"]));

    const wrapper = mount(FileCollectionGrid, {
      global: {
        provide: {
          [FILE_COLLECTION_CONTEXT_KEY]: {
            files: ref([
              { id: 101, name: "past타", type: "folder" },
              { id: 102, name: "Tgal", type: "folder" },
            ]),
            selectedIdSet,
            showParentNavigator: ref(false),
            fileStore: { goBack: vi.fn() },
            canSelect: ref(true),
            showActions: ref(false),
            deleteMode: ref("trash"),
            viewMode: ref("icon"),
            itemSize: ref("medium"),
            gridClassName: ref("file-icon-grid"),
            collectionStyle: ref({}),
            dragTargetId: ref(null),
            formatDisplaySize: () => "-",
            getFileName: (f) => f.name,
            getFileExtension: () => "",
            getUpdatedAt: () => "-",
            getSharedSourceLabel: () => "",
            getSentShareLabel: () => "",
            getImageCardUrl: () => "",
            getVideoCardUrl: () => "",
            getStatusChips: () => [],
            isImage: () => false,
            isVideo: () => false,
            hasVideoThumbnail: () => false,
            isMovable: () => true,
            canDownload: () => true,
            canSaveShared: () => false,
            canShare: () => true,
            canManageSentShare: () => false,
            canToggleLock: () => true,
            canManageFolder: () => true,
            canRestore: () => false,
            canDelete: () => true,
            isDownloading: () => false,
            toggleFileSelection,
            handlePrimaryAction,
            handlePreviewAssetError: vi.fn(),
            handleThumbnailAssetError: vi.fn(),
            handleDownload: vi.fn(),
            onClickSaveShared: vi.fn(),
            onClickShare: vi.fn(),
            onClickManageSentShare: vi.fn(),
            onClickToggleLock: vi.fn(),
            onClickRenameFolder: vi.fn(),
            onClickShowFolderProperties: vi.fn(),
            onClickRestore: vi.fn(),
            onClickDelete: vi.fn(),
            onDragStart: vi.fn(),
            onDragEnd: vi.fn(),
            onDragOverFolder: vi.fn(),
            onDragLeaveFolder: vi.fn(),
            onDropToFolder: vi.fn(),
            onDragOverParentNavigator: vi.fn(),
            onDragLeaveParentNavigator: vi.fn(),
            onDropToParentNavigator: vi.fn(),
          },
        },
      },
    });

    // 아이콘 보기 모드에서는 체크박스가 없어야 함
    expect(wrapper.findAll('input[type="checkbox"]').length).toBe(0);

    const articles = wrapper.findAll("article.file-entry");
    expect(articles.length).toBe(2);

    // 선택된 아이템(101)은 file-entry--selected 클래스가 적용되어야 함
    expect(articles[0].classes()).toContain("file-entry--selected");
    expect(articles[1].classes()).not.toContain("file-entry--selected");

    // 아이콘 클릭 시 선택 토글이 호출되어야 함
    await articles[1].trigger("click");
    expect(toggleFileSelection).toHaveBeenCalledWith(102, true);

    // 더블클릭 시 폴더/파일 열기(handlePrimaryAction)가 호출되어야 함
    await articles[0].trigger("dblclick");
    expect(handlePrimaryAction).toHaveBeenCalledWith({ id: 101, name: "past타", type: "folder" });
  });
});
