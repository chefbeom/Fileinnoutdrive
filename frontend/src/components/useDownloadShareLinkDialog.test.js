import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCollectionActionAvailability } from "@/components/file/fileCollectionViewModel.js";

const mockApi = vi.hoisted(() => ({
  createDownloadShareLink: vi.fn(),
  fetchFileDownloadShareLinks: vi.fn(),
  revokeDownloadShareLink: vi.fn(),
}));

vi.mock("@/api/filesApi.js", () => mockApi);

import { useDownloadShareLinkDialog } from "./useDownloadShareLinkDialog.js";

describe("useDownloadShareLinkDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi.fetchFileDownloadShareLinks.mockResolvedValue([]);
  });

  it("opens for an owned unlocked file and creates a default 30m 1-download presigned share link", async () => {
    const file = { id: 42, idx: 42, name: "report.pdf", type: "file", nodeType: "FILE" };
    const createdLink = {
      idx: 101,
      token: "tok-30m-1",
      fileIdx: 42,
      maxDownloads: 1,
      downloadCount: 0,
      remainingDownloads: 1,
      expiresAt: "2026-11-14T03:00:00",
      status: "ACTIVE",
    };
    mockApi.createDownloadShareLink.mockResolvedValue(createdLink);

    const dialog = useDownloadShareLinkDialog();
    await dialog.openDialog(file);

    expect(dialog.isOpen.value).toBe(true);
    expect(mockApi.fetchFileDownloadShareLinks).toHaveBeenCalledWith(42);
    expect(dialog.resolvedDurationMinutes.value).toBe(30);
    expect(dialog.resolvedMaxDownloads.value).toBe(1);

    const result = await dialog.createLink();
    expect(result).toEqual(createdLink);
    expect(mockApi.createDownloadShareLink).toHaveBeenCalledWith(42, {
      expiresInMinutes: 30,
      maxDownloads: 1,
    });
    expect(dialog.issuedLink.value).toEqual(createdLink);
    expect(dialog.existingLinks.value[0]).toEqual(createdLink);
    expect(dialog.getSharePageUrl("tok-30m-1")).toContain("/share-link/tok-30m-1");
    expect(dialog.getDirectDownloadUrl("tok-30m-1")).toContain("/file/share-links/public/tok-30m-1/download");
  });

  it("supports custom minutes, unlimited count, and optional password validation", async () => {
    const file = { id: 7, name: "archive.zip", type: "file" };
    mockApi.createDownloadShareLink.mockResolvedValue({
      idx: 202,
      token: "tok-custom",
      status: "ACTIVE",
    });

    const dialog = useDownloadShareLinkDialog();
    await dialog.openDialog(file);

    dialog.durationMode.value = "custom_minutes";
    dialog.customMinutes.value = 120;
    dialog.limitMode.value = "unlimited";
    dialog.password.value = "ab";

    const invalid = await dialog.createLink();
    expect(invalid).toBeNull();
    expect(dialog.errorMessage.value).toContain("4자");
    expect(mockApi.createDownloadShareLink).not.toHaveBeenCalled();

    dialog.password.value = "safe1234";
    await dialog.createLink();
    expect(mockApi.createDownloadShareLink).toHaveBeenCalledWith(7, {
      expiresInMinutes: 120,
      maxDownloads: null,
      password: "safe1234",
    });
  });

  it("revokes an active link and updates state", async () => {
    const file = { id: 9, name: "note.txt", type: "file" };
    mockApi.fetchFileDownloadShareLinks.mockResolvedValue([
      { idx: 50, token: "rev-tok", status: "ACTIVE", maxDownloads: 3, downloadCount: 1 },
    ]);
    mockApi.revokeDownloadShareLink.mockResolvedValue({
      idx: 50,
      token: "rev-tok",
      status: "REVOKED",
      revoked: true,
    });

    const dialog = useDownloadShareLinkDialog();
    await dialog.openDialog(file);
    dialog.issuedLink.value = { idx: 50, token: "rev-tok", status: "ACTIVE" };

    await dialog.revokeLink(50);

    expect(mockApi.revokeDownloadShareLink).toHaveBeenCalledWith(50);
    expect(dialog.existingLinks.value[0].status).toBe("REVOKED");
    expect(dialog.issuedLink.value.status).toBe("REVOKED");
  });

  it("rejects ineligible files in openDialog and action availability helper", async () => {
    const onError = vi.fn();
    const dialog = useDownloadShareLinkDialog({ onError });

    await dialog.openDialog({ id: 1, name: "Folder", type: "folder" });
    await dialog.openDialog({ id: 2, name: "Locked.pdf", type: "file", lockedFile: true });
    await dialog.openDialog({ id: 3, name: "Shared.pdf", type: "file", sharedWithMe: true });

    expect(dialog.isOpen.value).toBe(false);
    expect(onError).toHaveBeenCalledTimes(3);

    expect(getCollectionActionAvailability({ id: 10, type: "file" }, {}).canShareDownloadLink).toBe(true);
    expect(getCollectionActionAvailability({ id: 11, type: "folder" }, {}).canShareDownloadLink).toBe(false);
    expect(getCollectionActionAvailability({ id: 12, type: "file", lockedFile: true }, {}).canShareDownloadLink).toBe(false);
    expect(getCollectionActionAvailability({ id: 13, type: "file", spaceType: "VAULT" }, {}).canShareDownloadLink).toBe(false);
    expect(getCollectionActionAvailability({ id: 14, type: "file" }, { hiddenContext: true }).canShareDownloadLink).toBe(false);
  });
});
