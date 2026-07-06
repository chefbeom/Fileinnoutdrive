import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import { fetchGroupOverview, shareFilesWithTargets } from "@/api/groupApi.js";
import { useBaseFileShareDialog } from "./useBaseFileShareDialog.js";

vi.mock("@/api/groupApi.js", () => ({
  fetchGroupOverview: vi.fn(),
  shareFilesWithTargets: vi.fn(),
}));

const createFileStore = () => ({
  fetchShareInfo: vi.fn(async () => [
    {
      shareIdx: 1,
      fileIdx: 10,
      recipientName: "Lee",
      recipientEmail: "lee@example.com",
      permission: "READ",
      createdAt: "2026-07-05T01:00:00Z",
    },
  ]),
  refreshAll: vi.fn(async () => {}),
  cancelSharedFiles: vi.fn(async () => {}),
});

describe("useBaseFileShareDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchGroupOverview.mockResolvedValue({
      groups: [{ groupId: 7, name: "Dev", relationshipCount: 2 }],
      uncategorizedRelationships: [
        { relationshipId: 3, targetUser: { userId: 9, name: "Kim", email: "kim@example.com" } },
      ],
      groupDetails: [],
    });
    shareFilesWithTargets.mockResolvedValue({ pendingInvites: [] });
  });

  it("opens share dialog and aggregates current share info", async () => {
    const fileStore = createFileStore();
    const dialog = useBaseFileShareDialog({
      fileStore,
      canCreateShares: ref(true),
      selectedOwnedShareableFiles: ref([{ id: 10, name: "report.pdf" }]),
    });

    await dialog.openShareDialog();

    expect(fetchGroupOverview).toHaveBeenCalledTimes(1);
    expect(fileStore.fetchShareInfo).toHaveBeenCalledWith(10);
    expect(dialog.shareTargets.value).toHaveLength(1);
    expect(dialog.shareInfo.value).toMatchObject([
      { recipientEmail: "lee@example.com", permission: "READ", fileNames: ["report.pdf"] },
    ]);
    expect(dialog.shareOverviewGroups.value).toHaveLength(1);
    expect(dialog.shareOverviewUsers.value).toHaveLength(1);
  });

  it("submits share targets with policy options", async () => {
    const fileStore = createFileStore();
    const dialog = useBaseFileShareDialog({
      fileStore,
      canCreateShares: ref(true),
      selectedOwnedShareableFiles: ref([{ id: 10, name: "report.pdf" }]),
    });

    await dialog.openShareDialog();
    dialog.shareEmail.value = "guest@example.com";
    dialog.sharePermission.value = "download";
    dialog.shareExpiresAt.value = "2026-08-01T10:30";
    dialog.shareDownloadLimit.value = "3";
    dialog.sharePassword.value = " secret ";

    await dialog.submitShare();

    expect(shareFilesWithTargets).toHaveBeenCalledWith({
      fileIds: [10],
      userIds: [],
      groupIds: [],
      emails: ["guest@example.com"],
      permission: "DOWNLOAD",
      expiresAt: "2026-08-01T10:30",
      downloadLimit: 3,
      sharePassword: "secret",
    });
    expect(fileStore.refreshAll).toHaveBeenCalledTimes(1);
  });
});