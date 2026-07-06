import { computed, ref, unref } from "vue";
import { fetchGroupOverview, shareFilesWithTargets } from "@/api/groupApi.js";
import {
  aggregateBaseShareInfoEntries,
  buildBaseSharePolicyOptions,
  normalizeBaseSharePermission,
} from "./baseFileViewModel.js";

export const BASE_SHARE_PERMISSION_OPTIONS = [
  { value: "WRITE", label: "전체 허용" },
  { value: "READ", label: "보기만" },
  { value: "DOWNLOAD", label: "보기 + 다운로드" },
  { value: "UPLOAD", label: "업로드만" },
];

const normalizeShareTargets = (value) => {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (value) return [value];
  return [];
};

const buildShareOverviewUsers = (overview) => {
  const directRelationships = overview?.uncategorizedRelationships || [];
  const groupedRelationships = (overview?.groupDetails || [])
    .flatMap((group) => group.relationships || []);
  const relationshipMap = new Map();

  [...directRelationships, ...groupedRelationships].forEach((relationship) => {
    if (!relationship?.relationshipId || relationshipMap.has(relationship.relationshipId)) {
      return;
    }
    relationshipMap.set(relationship.relationshipId, relationship);
  });

  return [...relationshipMap.values()];
};

export function useBaseFileShareDialog({ fileStore, canCreateShares, selectedOwnedShareableFiles }) {
  const shareTargets = ref([]);
  const shareInfo = ref([]);
  const shareEmail = ref("");
  const sharePermission = ref("WRITE");
  const shareExpiresAt = ref("");
  const shareDownloadLimit = ref("");
  const sharePassword = ref("");
  const shareCancelEmail = ref("");
  const shareError = ref("");
  const isSharing = ref(false);
  const isShareInfoLoading = ref(false);
  const shareGroupOverview = ref(null);
  const isShareGroupOverviewLoading = ref(false);
  const shareTargetUserIds = ref([]);
  const shareTargetGroupIds = ref([]);
  const sharePendingInvites = ref([]);

  const shareOverviewGroups = computed(() => shareGroupOverview.value?.groups || []);
  const shareOverviewUsers = computed(() => buildShareOverviewUsers(shareGroupOverview.value));
  const buildSharePolicyOptions = () => buildBaseSharePolicyOptions({
    expiresAt: shareExpiresAt.value,
    downloadLimit: shareDownloadLimit.value,
    sharePassword: sharePassword.value,
  });

  const resetShareForm = () => {
    shareEmail.value = "";
    sharePermission.value = "WRITE";
    shareExpiresAt.value = "";
    shareDownloadLimit.value = "";
    sharePassword.value = "";
    shareCancelEmail.value = "";
    shareError.value = "";
    shareTargetUserIds.value = [];
    shareTargetGroupIds.value = [];
    sharePendingInvites.value = [];
  };

  const loadShareInfo = async () => {
    shareInfo.value = [];
    shareError.value = "";
    if (!shareTargets.value.length || shareTargets.value.some((file) => file?.sharedWithMe)) return;
    isShareInfoLoading.value = true;
    try {
      const shareResponses = await Promise.all(
        shareTargets.value.map(async (file) => {
          const items = await fileStore.fetchShareInfo(file.id);
          return (items || []).map((item) => ({
            ...item,
            fileOriginName: item?.fileOriginName || file?.name || file?.fileOriginName || "",
          }));
        }),
      );
      shareInfo.value = aggregateBaseShareInfoEntries(shareResponses.flat());
    } catch (error) {
      shareError.value = error?.response?.data?.message || error?.message || "공유 정보를 불러오지 못했습니다.";
    } finally {
      isShareInfoLoading.value = false;
    }
  };

  const loadShareGroupOverview = async () => {
    isShareGroupOverviewLoading.value = true;

    try {
      shareGroupOverview.value = await fetchGroupOverview();
    } catch (error) {
      shareGroupOverview.value = null;
      shareError.value = error?.response?.data?.message || error?.message || "그룹 목록을 불러오지 못했습니다.";
    } finally {
      isShareGroupOverviewLoading.value = false;
    }
  };

  const openShareDialog = async (files = unref(selectedOwnedShareableFiles)) => {
    const canShare = Boolean(unref(canCreateShares));
    const nextTargets = normalizeShareTargets(files)
      .filter((file) => !file?.sharedWithMe && !file?.lockedFile && !file?.isTrash && (canShare || file?.sharedFile));
    if (!nextTargets.length) {
      window.alert(canShare ? "공유할 수 있는 항목을 선택해 주세요." : "현재 멤버십에서는 새 공유를 추가할 수 없습니다.");
      return;
    }
    shareTargets.value = nextTargets;
    resetShareForm();
    await loadShareGroupOverview();
    await loadShareInfo();
  };

  const closeShareDialog = () => {
    shareTargets.value = [];
    shareInfo.value = [];
    resetShareForm();
    isShareInfoLoading.value = false;
    isSharing.value = false;
  };

  const submitShare = async () => {
    if (!shareTargets.value.length) return;
    if (!unref(canCreateShares)) {
      shareError.value = "현재 멤버십에서는 새 공유를 추가할 수 없습니다.";
      return;
    }
    const recipientEmail = shareEmail.value.trim();
    const selectedUserIds = shareTargetUserIds.value.filter(Boolean);
    const selectedGroupIds = shareTargetGroupIds.value.filter(Boolean);
    if (!recipientEmail && !selectedUserIds.length && !selectedGroupIds.length) {
      shareError.value = "공유할 사용자, 그룹, 이메일 중 하나 이상을 선택해 주세요.";
      return;
    }
    isSharing.value = true;
    shareError.value = "";
    try {
      const result = await shareFilesWithTargets({
        fileIds: shareTargets.value.map((file) => file.id),
        userIds: selectedUserIds,
        groupIds: selectedGroupIds,
        emails: recipientEmail ? [recipientEmail] : [],
        permission: normalizeBaseSharePermission(sharePermission.value),
        ...buildSharePolicyOptions(),
      });
      await fileStore.refreshAll();
      shareEmail.value = "";
      shareExpiresAt.value = "";
      shareDownloadLimit.value = "";
      sharePassword.value = "";
      shareTargetUserIds.value = [];
      shareTargetGroupIds.value = [];
      sharePendingInvites.value = result?.pendingInvites || [];
      await loadShareInfo();
    } catch (error) {
      shareError.value = error?.response?.data?.message || error?.message || "파일을 공유하지 못했습니다.";
    } finally {
      isSharing.value = false;
    }
  };

  const cancelShare = async (recipientEmail = shareCancelEmail.value) => {
    if (!shareTargets.value.length) return;
    const normalizedEmail = String(recipientEmail || "").trim();
    if (!normalizedEmail) {
      shareError.value = "공유 취소할 이메일을 입력해 주세요.";
      return;
    }
    isSharing.value = true;
    shareError.value = "";
    try {
      await fileStore.cancelSharedFiles(shareTargets.value.map((file) => file.id), normalizedEmail);
      shareCancelEmail.value = "";
      await loadShareInfo();
    } catch (error) {
      shareError.value = error?.response?.data?.message || error?.message || "공유를 취소하지 못했습니다.";
    } finally {
      isSharing.value = false;
    }
  };

  return {
    shareTargets,
    shareInfo,
    shareEmail,
    sharePermission,
    shareExpiresAt,
    shareDownloadLimit,
    sharePassword,
    shareCancelEmail,
    shareError,
    isSharing,
    isShareInfoLoading,
    isShareGroupOverviewLoading,
    shareOverviewGroups,
    shareOverviewUsers,
    shareTargetUserIds,
    shareTargetGroupIds,
    sharePendingInvites,
    openShareDialog,
    closeShareDialog,
    submitShare,
    cancelShare,
  };
}