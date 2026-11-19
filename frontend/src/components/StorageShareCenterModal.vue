<script setup>
import { computed, ref, watch } from "vue";
import { useFileStore } from "@/stores/useFileStore.js";
import { fetchGroupOverview, fetchRelationships } from "@/api/groupApi.js";
import {
  cancelCapacityGrant,
  createCapacityGrants,
  createSharedStorage,
  createSharedStorageFolder,
  fetchCapacityShareOverview,
  fetchSharedStorageDetail,
  fetchSharedStorageDownloadUrl,
  fetchSharedStorages,
  inviteSharedStorageMembers,
  requestSharedStorageApproval,
  respondSharedStorageInvite,
  restoreSharedStorage,
  updateSharedStorageContribution,
  uploadFilesToSharedStorage,
  voteSharedStorageApproval,
} from "@/api/storageShareApi.js";

const props = defineProps({
  isOpen: {
    type: Boolean,
    default: false,
  },
  initialPage: {
    type: String,
    default: "spaces",
  },
  initialTargetParentId: {
    type: [Number, String],
    default: null,
  },
  initialStorageIdx: {
    type: [Number, String],
    default: null,
  },
  initialShowDetailSettings: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(["close"]);

const GIGABYTE = 1024 * 1024 * 1024;
const TERABYTE = 1024 * GIGABYTE;

const fileStore = useFileStore();

// 모달 페이지 구성 (역할별 분리)
// - spaces: 공유 폴더(논리적 공유 저장소) 탐색 및 사용
// - create-space: 새 공유 폴더 만들기 (+업로드/폴더 만들기 연동)
// - grant-share: 내 용량 공유·대여하기 (공유자 역할)
// - grant-status: 공유 한 내역 / 공유받은 내역 확인
const activePage = ref(props.initialPage || "spaces");

// 세부 설정 토글 상태 (기본 화면은 단순하게 유지, 필요 시 세부 설정 진입)
const showSpaceDetailSettings = ref(false);
const showCreateSpaceDetail = ref(false);
const showGrantDetail = ref(false);
const grantHistoryRoleTab = ref("outgoing"); // outgoing | incoming
const expandedGrantDetailMap = ref({});

const formatBytes = (bytes) => {
  const size = Number(bytes || 0);
  if (!Number.isFinite(size) || size <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  const unitIndex = Math.min(
    Math.floor(Math.log(size) / Math.log(1024)),
    units.length - 1,
  );
  const value = size / 1024 ** unitIndex;
  const fractionDigits = unitIndex === 0 ? 0 : value >= 100 ? 0 : value >= 10 ? 1 : 2;

  return `${value.toFixed(fractionDigits)} ${units[unitIndex]}`;
};

const formatDate = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

const toLocalDatetimeInputValue = (date) => {
  const d = date instanceof Date ? date : new Date(date);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const parseEmailText = (rawText) => {
  return String(rawText || "")
    .split(/[\s,;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
};

const toBytesFromAmountUnit = (amount, unit) => {
  const num = Number(amount || 0);
  if (!Number.isFinite(num) || num <= 0) return 0;
  return Math.round(num * (unit === "TB" ? TERABYTE : GIGABYTE));
};

const summary = computed(() => fileStore.storageSummary);

// 관계 그룹 & 친구 목록
const groups = ref([]);
const relationships = ref([]);

const loadGroupsAndRelationships = async () => {
  try {
    const [overviewRes, relRes] = await Promise.all([
      fetchGroupOverview().catch(() => null),
      fetchRelationships().catch(() => []),
    ]);
    groups.value = Array.isArray(overviewRes?.groups) ? overviewRes.groups : [];
    const relList = Array.isArray(relRes)
      ? relRes
      : Array.isArray(relRes?.relationships)
        ? relRes.relationships
        : [];
    relationships.value = relList.filter((rel) => rel?.status === "ACTIVE" && rel?.targetUser);
  } catch {
    groups.value = [];
    relationships.value = [];
  }
};

// 용량 공유 / 대여 상태
const capacityOverview = ref(null);
const capacityLoading = ref(false);
const noticeMessage = ref("");
const errorMessage = ref("");
const grantSubmitting = ref(false);

const grantForm = ref({
  grantType: "RECURRING",
  amount: 50,
  unit: "GB",
  rentalDaysPreset: 30,
  startAt: toLocalDatetimeInputValue(new Date()),
  endAt: toLocalDatetimeInputValue(new Date(Date.now() + 30 * 24 * 3600 * 1000)),
  selectedGroupIds: [],
  selectedUserIds: [],
  emailsText: "",
});

const applyRentalPresetDays = (days) => {
  grantForm.value.rentalDaysPreset = days;
  const start = grantForm.value.startAt ? new Date(grantForm.value.startAt) : new Date();
  const base = Number.isNaN(start.getTime()) ? new Date() : start;
  const end = new Date(base.getTime() + days * 24 * 3600 * 1000);
  grantForm.value.startAt = toLocalDatetimeInputValue(base);
  grantForm.value.endAt = toLocalDatetimeInputValue(end);
};

const clearMessages = () => {
  noticeMessage.value = "";
  errorMessage.value = "";
};

const setPage = (page) => {
  clearMessages();
  activePage.value = page;
  if (page !== "spaces") {
    showSpaceDetailSettings.value = false;
  }
};

const toggleGrantDetailCard = (grantIdx) => {
  expandedGrantDetailMap.value = {
    ...expandedGrantDetailMap.value,
    [grantIdx]: !expandedGrantDetailMap.value[grantIdx],
  };
};

const loadCapacityOverview = async () => {
  capacityLoading.value = true;
  try {
    capacityOverview.value = await fetchCapacityShareOverview();
  } catch (err) {
    errorMessage.value = err?.response?.data?.message || "용량 공유 현황을 불러오지 못했습니다.";
  } finally {
    capacityLoading.value = false;
  }
};

const handleCreateGrant = async () => {
  clearMessages();

  const bytes = toBytesFromAmountUnit(grantForm.value.amount, grantForm.value.unit);
  if (bytes < GIGABYTE) {
    errorMessage.value = "공유할 용량은 최소 1GB 이상이어야 합니다.";
    return;
  }

  const emails = parseEmailText(grantForm.value.emailsText);
  if (
    !grantForm.value.selectedGroupIds.length &&
    !grantForm.value.selectedUserIds.length &&
    !emails.length
  ) {
    errorMessage.value = "공유할 이메일을 입력하거나 세부 설정에서 그룹·친구를 선택해 주세요.";
    return;
  }

  grantSubmitting.value = true;
  try {
    const payload = {
      bytes,
      grantType: grantForm.value.grantType,
      startAt: grantForm.value.startAt ? `${grantForm.value.startAt}:00`.slice(0, 19) : null,
      endAt:
        grantForm.value.grantType === "FIXED" && grantForm.value.endAt
          ? `${grantForm.value.endAt}:00`.slice(0, 19)
          : null,
      groupIds: grantForm.value.selectedGroupIds,
      userIds: grantForm.value.selectedUserIds,
      emails,
    };
    capacityOverview.value = await createCapacityGrants(payload);
    await fileStore.fetchStorageSummary().catch(() => {});
    grantForm.value.selectedGroupIds = [];
    grantForm.value.selectedUserIds = [];
    grantForm.value.emailsText = "";
    noticeMessage.value =
      grantForm.value.grantType === "RECURRING"
        ? "월 단위 정기 용량 공유가 시작되었습니다. 취소 시 1개월 유예 기간이 부여됩니다."
        : "지정한 기간 동안 저장 용량 대여가 시작되었습니다.";
    grantHistoryRoleTab.value = "outgoing";
    activePage.value = "grant-status";
  } catch (err) {
    errorMessage.value = err?.response?.data?.message || "용량 공유 생성에 실패했습니다.";
  } finally {
    grantSubmitting.value = false;
  }
};

const handleCancelGrant = async (grant, isOutgoing) => {
  clearMessages();
  const confirmMsg = isOutgoing
    ? `${grant.recipientName}님에게 공유 중인 ${formatBytes(grant.bytes)} 용량을 취소하시겠습니까?\n취소 시 수신자에게 오늘부터 1개월 유예 기간이 부여되며, 유예 만료 후 초과 데이터는 오래된 파일부터 자동 정리됩니다.`
    : `${grant.granterName}님으로부터 공유받은 ${formatBytes(grant.bytes)} 용량을 지금 반납하시겠습니까?\n즉시 반납 시 기본 할당량을 초과한 데이터는 휴지통 → 오래된 파일 버전 → 오래된 파일 순으로 정리됩니다.`;

  if (!window.confirm(confirmMsg)) {
    return;
  }

  try {
    capacityOverview.value = await cancelCapacityGrant(grant.grantIdx);
    await fileStore.fetchStorageSummary().catch(() => {});
    noticeMessage.value = isOutgoing
      ? "공유 취소 처리가 완료되어 1개월 유예 기간이 시작되었습니다."
      : "공유받은 용량을 반납했습니다.";
  } catch (err) {
    errorMessage.value = err?.response?.data?.message || "용량 공유 취소 처리에 실패했습니다.";
  }
};

// 논리적 공유 저장소 (공유 폴더) 상태
const sharedStorages = ref([]);
const sharedStorageLoading = ref(false);
const selectedStorageIdx = ref(null);
const selectedStorageDetail = ref(null);
const currentFolderParentIdx = ref(null);
const createSpaceSubmitting = ref(false);

const createStorageForm = ref({
  name: "",
  description: "",
  parentFolderId: null,
  ownerAmount: 0,
  ownerUnit: "GB",
  proposedAmount: 10,
  proposedUnit: "GB",
  selectedGroupIds: [],
  selectedUserIds: [],
  emailsText: "",
});

const normalizeFolderIdValue = (value) => {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : null;
};

const formatFolderPathLabel = (folderId) => {
  const normalizedId = normalizeFolderIdValue(folderId);
  if (!normalizedId) {
    return "홈 (최상위)";
  }
  const pathSegments = typeof fileStore.getFolderPath === "function"
    ? fileStore.getFolderPath(normalizedId)
    : [];
  if (Array.isArray(pathSegments) && pathSegments.length > 0) {
    return `홈 / ${pathSegments.map((item) => item.name).join(" / ")}`;
  }
  const matched = (fileStore.driveFiles || []).find(
    (file) => file?.type === "folder" && Number(file?.id) === normalizedId,
  );
  if (matched?.name) {
    return `홈 / ${matched.name}`;
  }
  if (Number(fileStore.currentFolder?.id) === normalizedId && fileStore.currentFolder?.name) {
    return `홈 / ${fileStore.currentFolder.name}`;
  }
  return `폴더 #${normalizedId}`;
};

const currentDriveFolderId = computed(() => normalizeFolderIdValue(fileStore.currentFolderId));
const currentDriveFolderPathLabel = computed(() => formatFolderPathLabel(currentDriveFolderId.value));

const driveFolderOptions = computed(() => {
  const options = [
    {
      id: null,
      label: currentDriveFolderId.value === null
        ? "홈 (최상위 · 현재 위치)"
        : "홈 (최상위)",
    },
  ];
  const seenIds = new Set();

  if (currentDriveFolderId.value !== null) {
    seenIds.add(currentDriveFolderId.value);
    options.push({
      id: currentDriveFolderId.value,
      label: `${ formatFolderPathLabel(currentDriveFolderId.value) } (현재 위치)`,
    });
  }

  const folders = (fileStore.driveFiles || []).filter(
    (file) => file?.type === "folder" && !file?.trashed,
  );
  for (const folder of folders) {
    const id = normalizeFolderIdValue(folder?.id);
    if (!id || seenIds.has(id)) {
      continue;
    }
    seenIds.add(id);
    options.push({
      id,
      label: formatFolderPathLabel(id),
    });
  }

  const selectedId = normalizeFolderIdValue(createStorageForm.value.parentFolderId);
  if (selectedId !== null && !seenIds.has(selectedId)) {
    options.push({
      id: selectedId,
      label: formatFolderPathLabel(selectedId),
    });
  }

  return options;
});

const openSharedFolderInDrive = (storageSummary) => {
  const driveFolderIdx = normalizeFolderIdValue(storageSummary?.driveFolderIdx);
  if (!driveFolderIdx) {
    return;
  }
  emit("close");
  fileStore.enterFolder(driveFolderIdx);
};

const inviteAcceptAmounts = ref({});
const editContributionForm = ref({
  amount: 10,
  unit: "GB",
});
const inviteMembersForm = ref({
  proposedAmount: 10,
  proposedUnit: "GB",
  selectedGroupIds: [],
  selectedUserIds: [],
  emailsText: "",
});

const newFolderName = ref("");
const uploadProgress = ref(null);
const fileInputRef = ref(null);
const folderInputRef = ref(null);

const invitedStorages = computed(() =>
  sharedStorages.value.filter(
    (item) => item?.myStatus === "INVITED" && item?.status === "ACTIVE",
  ),
);
const activeStorages = computed(() =>
  sharedStorages.value.filter(
    (item) => item?.myStatus === "ACTIVE" && item?.status === "ACTIVE",
  ),
);
const outgoingGrantsCount = computed(
  () => capacityOverview.value?.outgoingGrants?.length || 0,
);
const incomingGrantsCount = computed(
  () => capacityOverview.value?.incomingGrants?.length || 0,
);
const pendingApprovalCountForSelected = computed(
  () =>
    (selectedStorageDetail.value?.approvals || []).filter((a) => a.status === "PENDING")
      .length,
);

const loadSharedStorages = async (keepSelection = true) => {
  sharedStorageLoading.value = true;
  try {
    const list = await fetchSharedStorages();
    sharedStorages.value = Array.isArray(list) ? list : [];

    for (const item of sharedStorages.value) {
      if (
        item.myStatus === "INVITED" &&
        inviteAcceptAmounts.value[item.storageIdx] === undefined
      ) {
        const defaultGb = Math.max(
          0,
          Math.round(Number(item.myProposedContributionBytes || 0) / GIGABYTE),
        );
        inviteAcceptAmounts.value[item.storageIdx] = defaultGb;
      }
    }

    if (keepSelection && selectedStorageIdx.value) {
      const stillExists = activeStorages.value.some(
        (s) => s.storageIdx === selectedStorageIdx.value,
      );
      if (stillExists) {
        await loadStorageDetail(selectedStorageIdx.value, currentFolderParentIdx.value);
        return;
      }
    }

    if (activeStorages.value.length > 0) {
      await selectSharedStorage(activeStorages.value[0].storageIdx);
    } else {
      selectedStorageIdx.value = null;
      selectedStorageDetail.value = null;
    }
  } catch (err) {
    errorMessage.value = err?.response?.data?.message || "공유 폴더 목록을 불러오지 못했습니다.";
  } finally {
    sharedStorageLoading.value = false;
  }
};

const selectSharedStorage = async (storageIdx) => {
  selectedStorageIdx.value = storageIdx;
  currentFolderParentIdx.value = null;
  showSpaceDetailSettings.value = false;
  await loadStorageDetail(storageIdx, null);
};

const loadStorageDetail = async (storageIdx, parentIdx = null) => {
  if (!storageIdx) return;
  try {
    const detail = await fetchSharedStorageDetail(storageIdx, parentIdx);
    selectedStorageDetail.value = detail;
    currentFolderParentIdx.value = detail?.currentParentIdx ?? null;

    if (detail?.summary) {
      const myBytes = Number(detail.summary.myContributionBytes || 0);
      if (myBytes > 0 && myBytes % TERABYTE === 0) {
        editContributionForm.value = { amount: myBytes / TERABYTE, unit: "TB" };
      } else {
        editContributionForm.value = {
          amount: Math.round((myBytes / GIGABYTE) * 10) / 10,
          unit: "GB",
        };
      }
    }
  } catch (err) {
    errorMessage.value = err?.response?.data?.message || "공유 폴더 상세를 불러오지 못했습니다.";
  }
};

const handleCreateSharedStorage = async (stayInModal = false) => {
  clearMessages();
  if (!createStorageForm.value.name.trim()) {
    errorMessage.value = "공유 폴더 이름을 입력해 주세요.";
    return;
  }

  createSpaceSubmitting.value = true;
  try {
    const targetParentFolderId = normalizeFolderIdValue(createStorageForm.value.parentFolderId);
    const ownerContributionBytes = toBytesFromAmountUnit(
      createStorageForm.value.ownerAmount,
      createStorageForm.value.ownerUnit,
    );
    const proposedContributionBytes = toBytesFromAmountUnit(
      createStorageForm.value.proposedAmount,
      createStorageForm.value.proposedUnit,
    );
    const created = await createSharedStorage({
      name: createStorageForm.value.name.trim(),
      description: createStorageForm.value.description.trim(),
      parentFolderId: targetParentFolderId,
      ownerContributionBytes,
      proposedContributionBytes,
      groupIds: createStorageForm.value.selectedGroupIds,
      userIds: createStorageForm.value.selectedUserIds,
      emails: parseEmailText(createStorageForm.value.emailsText),
    });

    createStorageForm.value = {
      name: "",
      description: "",
      parentFolderId: currentDriveFolderId.value,
      ownerAmount: 0,
      ownerUnit: "GB",
      proposedAmount: 10,
      proposedUnit: "GB",
      selectedGroupIds: [],
      selectedUserIds: [],
      emailsText: "",
    };
    showCreateSpaceDetail.value = false;
    selectedStorageIdx.value = created?.storageIdx || null;

    if (String(fileStore.currentFolderId ?? "") !== String(targetParentFolderId ?? "")) {
      fileStore.navigateToFolder(targetParentFolderId);
    }
    await Promise.all([
      loadSharedStorages(true),
      loadCapacityOverview(),
      fileStore.refreshAll().catch(() => {}),
    ]);
    noticeMessage.value = `공유 폴더 [${created.name}]가 드라이브에 생성되었습니다.`;
    if (!stayInModal) {
      emit("close");
    } else {
      activePage.value = "spaces";
    }
  } catch (err) {
    errorMessage.value = err?.response?.data?.message || "공유 폴더 생성에 실패했습니다.";
  } finally {
    createSpaceSubmitting.value = false;
  }
};

const handleRespondInvite = async (storageItem, accept) => {
  clearMessages();
  try {
    const gbAmount = Number(inviteAcceptAmounts.value[storageItem.storageIdx] ?? 0);
    const contributionBytes = accept ? Math.max(0, Math.round(gbAmount * GIGABYTE)) : 0;
    await respondSharedStorageInvite(storageItem.storageIdx, {
      accept,
      contributionBytes,
    });
    if (accept) {
      selectedStorageIdx.value = storageItem.storageIdx;
    }
    await Promise.all([
      loadSharedStorages(true),
      loadCapacityOverview(),
      fileStore.refreshAll().catch(() => {}),
    ]);
    noticeMessage.value = accept
      ? `[${storageItem.name}] 공유 폴더에 참여했습니다.`
      : `[${storageItem.name}] 초대를 거절했습니다.`;
  } catch (err) {
    errorMessage.value = err?.response?.data?.message || "초대 응답 처리에 실패했습니다.";
  }
};

const handleUpdateContribution = async () => {
  if (!selectedStorageIdx.value) return;
  clearMessages();
  try {
    const bytes = toBytesFromAmountUnit(
      editContributionForm.value.amount,
      editContributionForm.value.unit,
    );
    selectedStorageDetail.value = await updateSharedStorageContribution(
      selectedStorageIdx.value,
      bytes,
    );
    await Promise.all([
      loadSharedStorages(true),
      loadCapacityOverview(),
      fileStore.fetchStorageSummary().catch(() => {}),
    ]);
    noticeMessage.value = "내 기여 용량이 업데이트되었습니다.";
  } catch (err) {
    errorMessage.value = err?.response?.data?.message || "기여 용량 변경에 실패했습니다.";
  }
};

const handleInviteMembers = async () => {
  if (!selectedStorageIdx.value) return;
  clearMessages();
  try {
    const proposedContributionBytes = toBytesFromAmountUnit(
      inviteMembersForm.value.proposedAmount,
      inviteMembersForm.value.proposedUnit,
    );
    selectedStorageDetail.value = await inviteSharedStorageMembers(selectedStorageIdx.value, {
      proposedContributionBytes,
      groupIds: inviteMembersForm.value.selectedGroupIds,
      userIds: inviteMembersForm.value.selectedUserIds,
      emails: parseEmailText(inviteMembersForm.value.emailsText),
    });
    inviteMembersForm.value = {
      proposedAmount: 10,
      proposedUnit: "GB",
      selectedGroupIds: [],
      selectedUserIds: [],
      emailsText: "",
    };
    noticeMessage.value = "선택한 그룹/사용자에게 공유 폴더 초대를 보냈습니다.";
  } catch (err) {
    errorMessage.value = err?.response?.data?.message || "참여자 초대에 실패했습니다.";
  }
};

const handleCreateFolder = async () => {
  if (!selectedStorageIdx.value || !newFolderName.value.trim()) return;
  clearMessages();
  try {
    await createSharedStorageFolder(selectedStorageIdx.value, {
      parentIdx: currentFolderParentIdx.value,
      folderName: newFolderName.value.trim(),
    });
    newFolderName.value = "";
    await loadStorageDetail(selectedStorageIdx.value, currentFolderParentIdx.value);
    noticeMessage.value = "새 하위 폴더가 생성되었습니다.";
  } catch (err) {
    errorMessage.value = err?.response?.data?.message || "폴더 생성에 실패했습니다.";
  }
};

const handleFilesSelected = async (event) => {
  const files = event?.target?.files;
  if (!files || !files.length || !selectedStorageIdx.value) return;
  clearMessages();
  try {
    uploadProgress.value = { fileName: files[0].name, percent: 0 };
    await uploadFilesToSharedStorage(
      selectedStorageIdx.value,
      files,
      currentFolderParentIdx.value,
      (progress) => {
        uploadProgress.value = progress;
      },
    );
    await loadSharedStorages(true);
    noticeMessage.value = `${files.length}개 항목을 공유 폴더에 업로드했습니다.`;
  } catch (err) {
    errorMessage.value = err?.response?.data?.message || "공유 폴더 파일 업로드에 실패했습니다.";
  } finally {
    uploadProgress.value = null;
    if (event?.target) {
      event.target.value = "";
    }
  }
};

const handleDownloadNode = async (node) => {
  if (!selectedStorageIdx.value || !node?.idx) return;
  try {
    const res = await fetchSharedStorageDownloadUrl(selectedStorageIdx.value, node.idx);
    if (res?.downloadUrl) {
      window.open(res.downloadUrl, "_blank", "noopener,noreferrer");
    }
  } catch (err) {
    errorMessage.value = err?.response?.data?.message || "다운로드 URL 발급에 실패했습니다.";
  }
};

const handleRequestDeleteNode = async (node) => {
  if (!selectedStorageIdx.value || !node) return;
  const activeCount = Number(selectedStorageDetail.value?.summary?.activeMemberCount || 1);
  const msg =
    activeCount > 1
      ? `[${node.name}] 항목 삭제를 요청하시겠습니까?\n공유 폴더는 혼자 마음대로 삭제할 수 없으며, 참여자 ${activeCount}명 전원이 승인해야 삭제됩니다.`
      : `[${node.name}] 항목을 삭제하시겠습니까?`;
  if (!window.confirm(msg)) return;

  clearMessages();
  try {
    selectedStorageDetail.value = await requestSharedStorageApproval(selectedStorageIdx.value, {
      approvalType: "DELETE_NODE",
      targetNodeIdx: node.idx,
      reason: `${node.name} 삭제 요청`,
    });
    await loadSharedStorages(true);
    noticeMessage.value =
      activeCount > 1
        ? `[${node.name}] 삭제에 대한 전원 승인 요청이 등록되었습니다.`
        : `[${node.name}] 항목이 삭제되었습니다.`;
  } catch (err) {
    errorMessage.value = err?.response?.data?.message || "삭제 승인 요청에 실패했습니다.";
  }
};

const handleRequestDeleteStorage = async () => {
  const detailSummary = selectedStorageDetail.value?.summary;
  if (!detailSummary) return;
  const activeCount = Number(detailSummary.activeMemberCount || 1);
  const msg =
    activeCount > 1
      ? `공유 폴더 [${detailSummary.name}] 전체 삭제를 요청하시겠습니까?\n참여자 ${activeCount}명 전원이 7일 이내에 승인해야 삭제(휴지통 30일 보관 후 영구 삭제)됩니다.`
      : `공유 폴더 [${detailSummary.name}]를 삭제하시겠습니까?`;
  if (!window.confirm(msg)) return;

  clearMessages();
  try {
    selectedStorageDetail.value = await requestSharedStorageApproval(detailSummary.storageIdx, {
      approvalType: "DELETE_STORAGE",
      reason: "공유 폴더 전체 삭제 요청",
    });
    await Promise.all([
      loadSharedStorages(true),
      loadCapacityOverview(),
      fileStore.refreshAll().catch(() => {}),
    ]);
    noticeMessage.value =
      activeCount > 1
        ? "공유 폴더 삭제에 대한 참여자 전원 승인 투표가 시작되었습니다."
        : "공유 폴더가 삭제(휴지통 이동)되었습니다.";
  } catch (err) {
    errorMessage.value = err?.response?.data?.message || "공유 폴더 삭제 요청에 실패했습니다.";
  }
};

const handleRequestRemoveMember = async (member) => {
  if (!selectedStorageIdx.value || !member) return;
  const activeCount = Number(selectedStorageDetail.value?.summary?.activeMemberCount || 1);
  const msg = `[${member.userName}] 참여자 제외를 요청하시겠습니까?\n참여자 ${activeCount}명 전원이 승인해야 처리됩니다.`;
  if (!window.confirm(msg)) return;

  clearMessages();
  try {
    selectedStorageDetail.value = await requestSharedStorageApproval(selectedStorageIdx.value, {
      approvalType: "REMOVE_MEMBER",
      targetUserIdx: member.userIdx,
      reason: `${member.userName} 참여자 제외 요청`,
    });
    await loadSharedStorages(true);
    noticeMessage.value = "참여자 제외에 대한 전원 승인 요청이 등록되었습니다.";
  } catch (err) {
    errorMessage.value = err?.response?.data?.message || "참여자 제외 요청에 실패했습니다.";
  }
};

const handleVoteApproval = async (approval, approve) => {
  if (!selectedStorageIdx.value || !approval) return;
  clearMessages();
  try {
    await voteSharedStorageApproval(selectedStorageIdx.value, approval.approvalIdx, approve);
    await Promise.all([
      loadSharedStorages(true),
      loadCapacityOverview(),
      fileStore.refreshAll().catch(() => {}),
    ]);
    noticeMessage.value = approve
      ? "승인 투표가 반영되었습니다."
      : "거절 투표가 반영되어 해당 요청이 취소되었습니다.";
  } catch (err) {
    errorMessage.value = err?.response?.data?.message || "투표 처리에 실패했습니다.";
  }
};

const handleRestoreStorage = async () => {
  if (!selectedStorageIdx.value) return;
  clearMessages();
  try {
    selectedStorageDetail.value = await restoreSharedStorage(selectedStorageIdx.value);
    await Promise.all([
      loadSharedStorages(true),
      loadCapacityOverview(),
      fileStore.refreshAll().catch(() => {}),
    ]);
    noticeMessage.value = "공유 폴더가 정상 상태로 복원되었습니다.";
  } catch (err) {
    errorMessage.value = err?.response?.data?.message || "공유 폴더 복원에 실패했습니다.";
  }
};

const refreshAll = async () => {
  await Promise.all([
    fileStore.fetchStorageSummary().catch(() => {}),
    loadCapacityOverview(),
    loadSharedStorages(true),
    loadGroupsAndRelationships(),
  ]);
};

watch(
  () => [props.isOpen, props.initialPage, props.initialTargetParentId, props.initialStorageIdx, props.initialShowDetailSettings],
  ([open, nextPage, nextTargetParentId, nextStorageIdx, nextShowDetail]) => {
    if (open) {
      activePage.value = nextPage || "spaces";
      createStorageForm.value.parentFolderId =
        nextTargetParentId !== undefined && nextTargetParentId !== null
          ? normalizeFolderIdValue(nextTargetParentId)
          : currentDriveFolderId.value;
      if (nextStorageIdx) {
        selectedStorageIdx.value = Number(nextStorageIdx);
      }
      showSpaceDetailSettings.value = Boolean(nextShowDetail);
      clearMessages();
      refreshAll();
    }
  },
  { immediate: true },
);
</script>

<template>
  <Teleport to="body">
    <div
      v-if="isOpen"
      class="fixed inset-0 z-[220] flex items-center justify-center bg-slate-900/55 p-3 sm:p-6 backdrop-blur-sm"
      @click.self="emit('close')"
    >
      <div
        class="flex max-h-[90dvh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="storage-share-modal-title"
      >
        <!-- 모달 상단 헤더 -->
        <div class="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 bg-slate-50/70 px-4 py-3.5 sm:px-6 sm:py-4">
          <div class="flex items-center gap-3">
            <div class="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-sm">
              <i class="fa-solid fa-folder-tree text-base"></i>
            </div>
            <div>
              <h2 id="storage-share-modal-title" class="text-lg font-black text-gray-900">
                공유 저장소 & 용량 공유 센터
              </h2>
              <p class="text-xs text-gray-500">
                여유 용량:
                <strong class="text-blue-600">
                  {{ formatBytes(capacityOverview?.availableToShareBytes ?? summary?.remainingBytes ?? 0) }}
                </strong>
                · 공유받은 용량:
                <strong class="text-emerald-600">
                  +{{ formatBytes(capacityOverview?.grantedInBytes ?? summary?.grantedInBytes ?? 0) }}
                </strong>
                · 공유 중:
                <strong class="text-amber-600">
                  -{{ formatBytes(capacityOverview?.grantedOutBytes ?? summary?.grantedOutBytes ?? 0) }}
                </strong>
              </p>
            </div>
          </div>

          <div class="flex items-center gap-2">
            <button
              type="button"
              class="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-bold text-gray-600 transition hover:bg-gray-100"
              @click="refreshAll"
            >
              <i class="fa-solid fa-rotate-right mr-1"></i>새로고침
            </button>
            <button
              type="button"
              class="flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 transition hover:bg-gray-100 hover:text-gray-900"
              aria-label="닫기"
              @click="emit('close')"
            >
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>
        </div>

        <!-- 역할별 모달 페이지 탭 네비게이션 -->
        <div class="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 bg-white px-4 py-2.5 sm:px-6 sm:py-3">
          <div class="flex flex-wrap items-center gap-1.5" role="tablist">
            <button
              type="button"
              class="inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-extrabold transition"
              :class="
                activePage === 'spaces'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-slate-100 text-gray-600 hover:bg-slate-200'
              "
              @click="setPage('spaces')"
            >
              <i class="fa-solid fa-folder-open"></i>
              <span>공유 폴더 ({{ activeStorages.length }})</span>
              <span
                v-if="invitedStorages.length"
                class="rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-black text-white"
              >
                초대 {{ invitedStorages.length }}
              </span>
            </button>

            <button
              type="button"
              class="inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-extrabold transition"
              :class="
                activePage === 'grant-share'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-slate-100 text-gray-600 hover:bg-slate-200'
              "
              @click="setPage('grant-share')"
            >
              <i class="fa-solid fa-hand-holding-heart"></i>
              <span>용량 공유 · 대여하기</span>
            </button>

            <button
              type="button"
              class="inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-extrabold transition"
              :class="
                activePage === 'grant-status'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-slate-100 text-gray-600 hover:bg-slate-200'
              "
              @click="setPage('grant-status')"
            >
              <i class="fa-solid fa-list-check"></i>
              <span>공유 내역 ({{ outgoingGrantsCount + incomingGrantsCount }})</span>
            </button>
          </div>

          <button
            type="button"
            class="inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-extrabold transition"
            :class="
              activePage === 'create-space'
                ? 'border-indigo-600 bg-indigo-600 text-white shadow-sm'
                : 'border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
            "
            @click="setPage('create-space')"
          >
            <i class="fa-solid fa-plus"></i>
            <span>공유 폴더 만들기</span>
          </button>
        </div>

        <!-- 모달 본문 영역 -->
        <div class="flex-1 overflow-y-auto p-6 space-y-5">
          <!-- 공통 알림 / 오류 배너 -->
          <div
            v-if="noticeMessage"
            class="flex items-center justify-between rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-bold text-emerald-800"
          >
            <span>{{ noticeMessage }}</span>
            <button type="button" class="text-emerald-600 hover:underline" @click="noticeMessage = ''">닫기</button>
          </div>
          <div
            v-if="errorMessage"
            class="flex items-center justify-between rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-700"
          >
            <span>{{ errorMessage }}</span>
            <button type="button" class="text-rose-600 hover:underline" @click="errorMessage = ''">닫기</button>
          </div>

          <!-- ==================== 페이지 1: 공유 폴더 (논리적 공유 저장소) ==================== -->
          <template v-if="activePage === 'spaces'">
            <!-- 초대받은 공유 폴더 배너 -->
            <section
              v-if="invitedStorages.length"
              class="rounded-2xl border border-blue-200 bg-blue-50/70 p-4"
            >
              <div class="flex items-center justify-between">
                <h3 class="text-xs font-black text-blue-950">
                  초대받은 공유 폴더 ({{ invitedStorages.length }})
                </h3>
                <span class="text-[11px] text-blue-700">참여 시 기여할 용량(GB)을 지정할 수 있습니다</span>
              </div>

              <div class="mt-3 grid gap-2.5 sm:grid-cols-2">
                <div
                  v-for="inv in invitedStorages"
                  :key="inv.storageIdx"
                  class="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-blue-200 bg-white p-3"
                >
                  <div class="min-w-0">
                    <p class="truncate text-xs font-black text-gray-900">{{ inv.name }}</p>
                    <p class="truncate text-[11px] text-gray-500">
                      {{ inv.creatorName }} · 제안 {{ formatBytes(inv.myProposedContributionBytes) }}
                    </p>
                  </div>
                  <div class="flex items-center gap-1.5">
                    <input
                      v-model.number="inviteAcceptAmounts[inv.storageIdx]"
                      type="number"
                      min="0"
                      class="w-16 rounded-lg border border-gray-300 px-2 py-1 text-xs font-bold text-gray-900"
                    />
                    <span class="text-[11px] font-bold text-gray-600">GB</span>
                    <button
                      type="button"
                      class="rounded-full bg-blue-600 px-3 py-1 text-xs font-bold text-white hover:bg-blue-700"
                      @click="handleRespondInvite(inv, true)"
                    >
                      수락
                    </button>
                    <button
                      type="button"
                      class="rounded-full border border-gray-300 px-2.5 py-1 text-xs font-bold text-gray-600 hover:bg-gray-100"
                      @click="handleRespondInvite(inv, false)"
                    >
                      거절
                    </button>
                  </div>
                </div>
              </div>
            </section>

            <!-- 공유 폴더 선택 칩 바 -->
            <div v-if="activeStorages.length" class="flex flex-wrap items-center gap-2">
              <button
                v-for="space in activeStorages"
                :key="space.storageIdx"
                type="button"
                class="inline-flex items-center gap-2 rounded-2xl border px-4 py-2.5 text-left transition"
                :class="
                  selectedStorageIdx === space.storageIdx
                    ? 'border-blue-600 bg-blue-50/80 text-blue-950 shadow-sm'
                    : 'border-gray-200 bg-slate-50 text-gray-700 hover:bg-slate-100'
                "
                @click="selectSharedStorage(space.storageIdx)"
              >
                <i class="fa-solid fa-folder text-amber-400"></i>
                <div>
                  <div class="flex items-center gap-1.5">
                    <span class="text-xs font-black">{{ space.name }}</span>
                    <span
                      v-if="space.pendingApprovalCount > 0"
                      class="rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-black text-white"
                    >
                      투표 {{ space.pendingApprovalCount }}
                    </span>
                  </div>
                  <p class="text-[11px] text-gray-500">
                    {{ formatBytes(space.usedBytes) }} / {{ formatBytes(space.totalCapacityBytes) }} · {{ space.activeMemberCount }}명
                  </p>
                </div>
              </button>
            </div>

            <!-- 선택된 공유 폴더 본문 -->
            <div v-if="selectedStorageDetail?.summary" class="space-y-4">
              <!-- 상단 요약 바 + 세부 설정 전환 버튼 -->
              <div class="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-slate-50/70 px-5 py-3.5">
                <div>
                  <div class="flex flex-wrap items-center gap-2">
                    <h3 class="text-base font-black text-gray-900">
                      {{ selectedStorageDetail.summary.name }}
                    </h3>
                    <span
                      class="rounded-full px-2 py-0.5 text-[11px] font-bold"
                      :class="
                        selectedStorageDetail.summary.status === 'ACTIVE'
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-rose-100 text-rose-700'
                      "
                    >
                      {{ selectedStorageDetail.summary.status === "ACTIVE" ? "사용 중" : "삭제 대기" }}
                    </span>
                  </div>
                  <p class="mt-0.5 text-xs text-gray-500">
                    공동 사용량:
                    <strong>{{ formatBytes(selectedStorageDetail.summary.usedBytes) }}</strong> /
                    <strong>{{ formatBytes(selectedStorageDetail.summary.totalCapacityBytes) }}</strong>
                    · 내 기여: <strong>{{ formatBytes(selectedStorageDetail.summary.myContributionBytes) }}</strong>
                  </p>
                </div>

                <div class="flex flex-wrap items-center gap-2">
                  <button
                    v-if="selectedStorageDetail.summary.driveFolderIdx"
                    type="button"
                    class="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-4 py-2 text-xs font-extrabold text-blue-700 transition hover:bg-blue-100"
                    @click="openSharedFolderInDrive(selectedStorageDetail.summary)"
                  >
                    <i class="fa-solid fa-arrow-up-right-from-square"></i>
                    <span>드라이브에서 열기</span>
                  </button>
                  <button
                    type="button"
                    class="inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-xs font-extrabold transition"
                    :class="
                      showSpaceDetailSettings
                        ? 'border-slate-900 bg-slate-900 text-white'
                        : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-100'
                    "
                    @click="showSpaceDetailSettings = !showSpaceDetailSettings"
                  >
                    <i class="fa-solid" :class="showSpaceDetailSettings ? 'fa-folder-open' : 'fa-sliders'"></i>
                    <span>{{ showSpaceDetailSettings ? "폴더 탐색기로 돌아가기" : "세부 설정 · 참여자/승인" }}</span>
                    <span
                      v-if="!showSpaceDetailSettings && pendingApprovalCountForSelected > 0"
                      class="rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-black text-white"
                    >
                      {{ pendingApprovalCountForSelected }}
                    </span>
                  </button>
                </div>
              </div>

              <!-- [A] 기본 모드: 깔끔한 공유 폴더 탐색기 -->
              <section
                v-if="!showSpaceDetailSettings"
                class="rounded-2xl border border-gray-200 bg-white p-5"
              >
                <div class="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 pb-3.5">
                  <!-- 경로 브레드크럼 -->
                  <div class="flex flex-wrap items-center gap-1 text-xs font-bold text-gray-600">
                    <button
                      type="button"
                      class="rounded-lg px-2 py-1 hover:bg-slate-100 hover:text-blue-600"
                      @click="loadStorageDetail(selectedStorageIdx, null)"
                    >
                      <i class="fa-solid fa-house mr-1"></i>최상위
                    </button>
                    <template v-for="crumb in selectedStorageDetail.breadcrumbs" :key="crumb.idx">
                      <span class="text-gray-400">/</span>
                      <button
                        type="button"
                        class="rounded-lg px-2 py-1 hover:bg-slate-100 hover:text-blue-600"
                        @click="loadStorageDetail(selectedStorageIdx, crumb.idx)"
                      >
                        {{ crumb.name }}
                      </button>
                    </template>
                  </div>

                  <!-- 하위 폴더 만들기 & 업로드 -->
                  <div
                    v-if="selectedStorageDetail.summary.status === 'ACTIVE'"
                    class="flex flex-wrap items-center gap-2"
                  >
                    <div class="flex items-center gap-1.5">
                      <input
                        v-model="newFolderName"
                        type="text"
                        placeholder="하위 폴더 이름"
                        class="w-32 rounded-xl border border-gray-300 px-2.5 py-1.5 text-xs font-semibold text-gray-900"
                        @keyup.enter="handleCreateFolder"
                      />
                      <button
                        type="button"
                        class="rounded-full border border-gray-300 bg-white px-3 py-1.5 text-xs font-bold text-gray-700 hover:bg-slate-50"
                        @click="handleCreateFolder"
                      >
                        폴더 추가
                      </button>
                    </div>

                    <input
                      ref="fileInputRef"
                      type="file"
                      multiple
                      class="hidden"
                      @change="handleFilesSelected"
                    />
                    <input
                      ref="folderInputRef"
                      type="file"
                      webkitdirectory
                      directory
                      multiple
                      class="hidden"
                      @change="handleFilesSelected"
                    />

                    <button
                      type="button"
                      class="rounded-full bg-blue-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-blue-700"
                      @click="fileInputRef?.click()"
                    >
                      파일 업로드
                    </button>
                    <button
                      type="button"
                      class="rounded-full bg-indigo-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-indigo-700"
                      @click="folderInputRef?.click()"
                    >
                      폴더 업로드
                    </button>
                  </div>
                </div>

                <!-- 업로드 진행 표시 -->
                <div
                  v-if="uploadProgress"
                  class="mt-3 rounded-xl border border-blue-200 bg-blue-50 px-3.5 py-2.5 text-xs font-bold text-blue-800"
                >
                  업로드 중: {{ uploadProgress.fileName }} ({{ uploadProgress.percent }}%)
                </div>

                <!-- 파일/폴더 목록 -->
                <div
                  v-if="selectedStorageDetail.nodes?.length"
                  class="mt-3 overflow-x-auto rounded-xl border border-gray-200"
                >
                  <table class="min-w-full divide-y divide-gray-200">
                    <thead class="bg-slate-50">
                      <tr>
                        <th class="px-4 py-2.5 text-left text-xs font-bold text-gray-500">이름</th>
                        <th class="px-4 py-2.5 text-left text-xs font-bold text-gray-500">크기</th>
                        <th class="px-4 py-2.5 text-left text-xs font-bold text-gray-500">업로더</th>
                        <th class="px-4 py-2.5 text-right text-xs font-bold text-gray-500">작업</th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-100 bg-white">
                      <tr v-for="node in selectedStorageDetail.nodes" :key="node.idx" class="hover:bg-slate-50/70">
                        <td class="px-4 py-2.5 text-xs font-bold text-gray-900">
                          <button
                            v-if="node.nodeType === 'folder'"
                            type="button"
                            class="inline-flex items-center gap-2 text-left text-blue-600 hover:underline"
                            @click="loadStorageDetail(selectedStorageIdx, node.idx)"
                          >
                            <i class="fa-solid fa-folder text-amber-400"></i>
                            <span>{{ node.name }}</span>
                          </button>
                          <span v-else class="inline-flex items-center gap-2">
                            <i class="fa-regular fa-file text-slate-400"></i>
                            <span>{{ node.name }}</span>
                          </span>
                        </td>
                        <td class="px-4 py-2.5 text-xs text-gray-600">
                          {{ node.nodeType === "folder" ? "폴더" : formatBytes(node.fileSize) }}
                        </td>
                        <td class="px-4 py-2.5 text-xs text-gray-500">{{ node.uploaderName }}</td>
                        <td class="px-4 py-2.5 text-right">
                          <div class="inline-flex items-center gap-1.5">
                            <button
                              v-if="node.nodeType !== 'folder'"
                              type="button"
                              class="rounded-full border border-gray-200 px-2.5 py-1 text-[11px] font-bold text-gray-700 hover:bg-gray-100"
                              @click="handleDownloadNode(node)"
                            >
                              다운로드
                            </button>
                            <button
                              type="button"
                              class="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-bold text-rose-600 hover:bg-rose-600 hover:text-white"
                              @click="handleRequestDeleteNode(node)"
                            >
                              삭제 요청
                            </button>
                          </div>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div
                  v-else
                  class="mt-3 rounded-xl border border-dashed border-gray-200 bg-slate-50 px-4 py-10 text-center text-xs text-gray-500"
                >
                  비어 있는 공유 폴더입니다. 파일을 업로드하거나 하위 폴더를 추가해 보세요.
                </div>
              </section>

              <!-- [B] 세부 설정 모드: 기여 용량 조정 · 참여자 초대/관리 · 전원 승인 투표 · 저장소 삭제 -->
              <div v-else class="space-y-4">
                <!-- 1. 내 기여 용량 변경 -->
                <section class="rounded-2xl border border-gray-200 bg-white p-5">
                  <h4 class="text-sm font-black text-gray-900">내 기여 용량 세부 설정</h4>
                  <p class="mt-0.5 text-xs text-gray-500">
                    기여한 용량만큼 내 개인 할당량에서 차감되어 이 공유 폴더의 전체 한도에 합산됩니다.
                  </p>
                  <div class="mt-3 flex flex-wrap items-center gap-2">
                    <input
                      v-model.number="editContributionForm.amount"
                      type="number"
                      min="0"
                      step="1"
                      class="w-28 rounded-xl border border-gray-300 px-3 py-1.5 text-xs font-bold text-gray-900"
                    />
                    <select
                      v-model="editContributionForm.unit"
                      class="rounded-xl border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-bold text-gray-900"
                    >
                      <option value="GB">GB</option>
                      <option value="TB">TB</option>
                    </select>
                    <button
                      type="button"
                      class="rounded-full bg-blue-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-blue-700"
                      @click="handleUpdateContribution"
                    >
                      기여 용량 저장
                    </button>
                  </div>
                </section>

                <!-- 2. 참여자 현황 및 추가 초대 -->
                <section class="rounded-2xl border border-gray-200 bg-white p-5 space-y-4">
                  <div>
                    <h4 class="text-sm font-black text-gray-900">
                      참여자 목록 ({{ selectedStorageDetail.members?.length || 0 }}명)
                    </h4>
                    <div class="mt-3 grid gap-2.5 sm:grid-cols-2">
                      <div
                        v-for="m in selectedStorageDetail.members"
                        :key="m.memberIdx"
                        class="flex items-center justify-between gap-2 rounded-xl border border-gray-200 bg-slate-50 p-3"
                      >
                        <div class="min-w-0">
                          <p class="truncate text-xs font-black text-gray-900">
                            {{ m.userName }} ({{ m.userEmail }})
                          </p>
                          <p class="text-[11px] text-gray-500">
                            {{
                              m.status === "ACTIVE"
                                ? `기여: ${formatBytes(m.contributionBytes)}`
                                : `초대 대기 (제안 ${formatBytes(m.proposedContributionBytes)})`
                            }}
                          </p>
                        </div>
                        <button
                          v-if="m.status === 'ACTIVE' && selectedStorageDetail.summary.activeMemberCount > 1"
                          type="button"
                          class="rounded-full border border-rose-200 px-2.5 py-1 text-[11px] font-bold text-rose-600 hover:bg-rose-50"
                          @click="handleRequestRemoveMember(m)"
                        >
                          제외 요청
                        </button>
                      </div>
                    </div>
                  </div>

                  <div
                    v-if="selectedStorageDetail.summary.status === 'ACTIVE'"
                    class="border-t border-gray-100 pt-4"
                  >
                    <p class="text-xs font-black text-gray-900">참여자 추가 초대</p>
                    <div class="mt-2.5 grid gap-3 sm:grid-cols-3">
                      <div>
                        <label class="block text-[11px] font-bold text-gray-600">초대 이메일 (쉼표 구분)</label>
                        <input
                          v-model="inviteMembersForm.emailsText"
                          type="text"
                          placeholder="user@example.com"
                          class="mt-1 w-full rounded-xl border border-gray-300 px-3 py-1.5 text-xs"
                        />
                      </div>
                      <div>
                        <label class="block text-[11px] font-bold text-gray-600">그룹 선택</label>
                        <div v-if="groups.length" class="mt-1 flex flex-wrap gap-1">
                          <label
                            v-for="g in groups"
                            :key="g.groupId"
                            class="inline-flex items-center gap-1 rounded-full border bg-slate-50 px-2.5 py-1 text-[11px]"
                          >
                            <input v-model="inviteMembersForm.selectedGroupIds" type="checkbox" :value="g.groupId" />
                            <span>{{ g.name }}</span>
                          </label>
                        </div>
                        <p v-else class="mt-1 text-[11px] text-gray-400">그룹 없음</p>
                      </div>
                      <div>
                        <label class="block text-[11px] font-bold text-gray-600">제안 기여 용량</label>
                        <div class="mt-1 flex items-center gap-1.5">
                          <input
                            v-model.number="inviteMembersForm.proposedAmount"
                            type="number"
                            min="0"
                            class="w-16 rounded-xl border border-gray-300 px-2 py-1.5 text-xs font-bold"
                          />
                          <select
                            v-model="inviteMembersForm.proposedUnit"
                            class="rounded-xl border border-gray-300 bg-white px-2 py-1.5 text-xs font-bold"
                          >
                            <option value="GB">GB</option>
                            <option value="TB">TB</option>
                          </select>
                          <button
                            type="button"
                            class="rounded-full bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-700"
                            @click="handleInviteMembers"
                          >
                            초대
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </section>

                <!-- 3. 전원 승인 투표 센터 -->
                <section class="rounded-2xl border border-amber-200 bg-amber-50/50 p-5">
                  <h4 class="text-sm font-black text-amber-950">
                    삭제 / 변경 전원 승인 투표 ({{ selectedStorageDetail.approvals?.length || 0 }})
                  </h4>
                  <p class="mt-0.5 text-xs text-amber-800">
                    공유 폴더의 삭제 및 참여자 제외는 참여자 전원의 확인과 허가를 받아야 처리됩니다.
                  </p>

                  <div v-if="selectedStorageDetail.approvals?.length" class="mt-3 space-y-2.5">
                    <div
                      v-for="app in selectedStorageDetail.approvals"
                      :key="app.approvalIdx"
                      class="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-white p-3.5"
                    >
                      <div>
                        <div class="flex flex-wrap items-center gap-2">
                          <span class="text-xs font-black text-gray-900">{{ app.targetLabel }}</span>
                          <span
                            class="rounded-full px-2 py-0.5 text-[10px] font-bold"
                            :class="
                              app.status === 'PENDING'
                                ? 'bg-amber-100 text-amber-800'
                                : app.status === 'APPROVED'
                                  ? 'bg-emerald-100 text-emerald-700'
                                  : 'bg-rose-100 text-rose-700'
                            "
                          >
                            {{
                              app.status === "PENDING"
                                ? `승인 대기 (${app.approvedVoteCount}/${app.requiredVoteCount})`
                                : app.status === "APPROVED"
                                  ? "전원 승인됨"
                                  : "거절/만료"
                            }}
                          </span>
                        </div>
                        <p class="mt-0.5 text-[11px] text-gray-500">
                          요청자: {{ app.requesterName }} · {{ formatDate(app.createdAt) }}
                        </p>
                      </div>

                      <div v-if="app.status === 'PENDING' && app.myVote === null" class="flex items-center gap-1.5">
                        <button
                          type="button"
                          class="rounded-full bg-emerald-600 px-3 py-1 text-xs font-bold text-white hover:bg-emerald-700"
                          @click="handleVoteApproval(app, true)"
                        >
                          승인 허가
                        </button>
                        <button
                          type="button"
                          class="rounded-full bg-rose-600 px-3 py-1 text-xs font-bold text-white hover:bg-rose-700"
                          @click="handleVoteApproval(app, false)"
                        >
                          거절
                        </button>
                      </div>
                      <span
                        v-else-if="app.status === 'PENDING'"
                        class="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600"
                      >
                        내 투표 완료 ({{ app.myVote ? "승인" : "거절" }})
                      </span>
                    </div>
                  </div>
                  <p v-else class="mt-2 text-xs text-amber-800/80">진행 중인 승인 요청이 없습니다.</p>
                </section>

                <!-- 4. 공유 폴더 전체 삭제 요청 / 복원 -->
                <section class="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50/50 p-4">
                  <div>
                    <p class="text-xs font-black text-rose-900">공유 폴더 삭제 / 상태 관리</p>
                    <p class="text-[11px] text-rose-700">
                      참여자 전원이 승인해야 삭제되며, 삭제 후 30일간 휴지통 보관 뒤 영구 삭제됩니다.
                    </p>
                  </div>
                  <button
                    v-if="selectedStorageDetail.summary.status === 'ACTIVE'"
                    type="button"
                    class="rounded-full bg-rose-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-rose-700"
                    @click="handleRequestDeleteStorage"
                  >
                    공유 폴더 전체 삭제 요청
                  </button>
                  <button
                    v-else
                    type="button"
                    class="rounded-full bg-emerald-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-emerald-700"
                    @click="handleRestoreStorage"
                  >
                    공유 폴더 복원
                  </button>
                </section>
              </div>
            </div>

            <!-- 활성 공유 폴더가 없을 때 -->
            <div
              v-else
              class="rounded-2xl border border-dashed border-gray-200 bg-slate-50 px-6 py-12 text-center"
            >
              <p class="text-sm font-black text-gray-800">참여 중인 공유 폴더가 없습니다</p>
              <button
                type="button"
                class="mt-4 rounded-full bg-blue-600 px-5 py-2 text-xs font-extrabold text-white shadow-sm hover:bg-blue-700"
                @click="setPage('create-space')"
              >
                + 공유 폴더 만들기
              </button>
            </div>
          </template>

          <!-- ==================== 페이지 2: 새 공유 폴더 만들기 ==================== -->
          <template v-else-if="activePage === 'create-space'">
            <section class="rounded-2xl border border-gray-200 bg-white p-6 space-y-5">
              <div>
                <span class="rounded-full bg-indigo-50 px-3 py-1 text-xs font-extrabold text-indigo-700">
                  현재 디렉터리 기준 공유 폴더 생성
                </span>
                <h3 class="mt-2 text-base font-black text-gray-900">새 공유 폴더 만들기</h3>
              </div>

              <!-- 생성 위치 (디렉터리 선택) -->
              <div class="rounded-2xl border border-blue-200 bg-blue-50/50 p-4 space-y-2.5">
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <label class="text-xs font-black text-blue-950">
                    <i class="fa-solid fa-folder-tree mr-1.5 text-blue-600"></i>어디에 공유 폴더를 생성할까요? (생성 위치)
                  </label>
                  <div class="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      class="rounded-full border px-3 py-1 text-[11px] font-bold transition"
                      :class="
                        createStorageForm.parentFolderId === currentDriveFolderId
                          ? 'border-blue-600 bg-blue-600 text-white'
                          : 'border-blue-200 bg-white text-blue-700 hover:bg-blue-100'
                      "
                      @click="createStorageForm.parentFolderId = currentDriveFolderId"
                    >
                      현재 위치 ({{ currentDriveFolderPathLabel }})
                    </button>
                    <button
                      v-if="currentDriveFolderId !== null"
                      type="button"
                      class="rounded-full border px-3 py-1 text-[11px] font-bold transition"
                      :class="
                        createStorageForm.parentFolderId === null
                          ? 'border-blue-600 bg-blue-600 text-white'
                          : 'border-blue-200 bg-white text-blue-700 hover:bg-blue-100'
                      "
                      @click="createStorageForm.parentFolderId = null"
                    >
                      홈 (최상위)
                    </button>
                  </div>
                </div>

                <select
                  v-model="createStorageForm.parentFolderId"
                  class="w-full rounded-xl border border-blue-200 bg-white px-3.5 py-2 text-xs font-bold text-gray-900"
                >
                  <option
                    v-for="opt in driveFolderOptions"
                    :key="String(opt.id ?? 'root')"
                    :value="opt.id"
                  >
                    {{ opt.label }}
                  </option>
                </select>
              </div>

              <!-- 기본 간편 입력 -->
              <div class="grid gap-4 sm:grid-cols-2">
                <div>
                  <label class="block text-xs font-bold text-gray-700">공유 폴더 이름 *</label>
                  <input
                    v-model="createStorageForm.name"
                    type="text"
                    placeholder="예: 팀 프로젝트 공유 폴더"
                    class="mt-1.5 w-full rounded-xl border border-gray-300 px-3.5 py-2 text-sm font-semibold text-gray-900"
                    @keyup.enter="handleCreateSharedStorage(false)"
                  />
                </div>

                <div>
                  <label class="block text-xs font-bold text-gray-700">함께 쓸 사용자 이메일 (선택, 쉼표 구분)</label>
                  <input
                    v-model="createStorageForm.emailsText"
                    type="text"
                    placeholder="예: userb@example.com"
                    class="mt-1.5 w-full rounded-xl border border-gray-300 px-3.5 py-2 text-sm text-gray-900"
                  />
                </div>
              </div>

              <!-- 내 기본 기여 용량 칩 -->
              <div>
                <label class="block text-xs font-bold text-gray-700">
                  내 초기 기여 용량:
                  <strong class="text-blue-600">
                    {{ createStorageForm.ownerAmount > 0 ? `${createStorageForm.ownerAmount}${createStorageForm.ownerUnit}` : '기본 드라이브 용량 사용 (0GB)' }}
                  </strong>
                </label>
                <div class="mt-2 flex flex-wrap gap-2">
                  <button
                    v-for="preset in [0, 10, 20, 50, 100]"
                    :key="preset"
                    type="button"
                    class="rounded-full border px-3.5 py-1.5 text-xs font-bold transition"
                    :class="
                      createStorageForm.ownerAmount === preset && createStorageForm.ownerUnit === 'GB'
                        ? 'border-blue-600 bg-blue-50 text-blue-700'
                        : 'border-gray-200 bg-slate-50 text-gray-600 hover:bg-slate-100'
                    "
                    @click="
                      createStorageForm.ownerAmount = preset;
                      createStorageForm.ownerUnit = 'GB';
                    "
                  >
                    {{ preset === 0 ? "0GB (기본)" : `${preset}GB` }}
                  </button>
                </div>
              </div>

              <!-- 세부 설정 토글 버튼 -->
              <div class="border-t border-gray-100 pt-3">
                <button
                  type="button"
                  class="inline-flex items-center gap-1.5 text-xs font-extrabold text-gray-600 hover:text-blue-600"
                  @click="showCreateSpaceDetail = !showCreateSpaceDetail"
                >
                  <i class="fa-solid" :class="showCreateSpaceDetail ? 'fa-chevron-up' : 'fa-sliders'"></i>
                  <span>{{ showCreateSpaceDetail ? "세부 설정 접기" : "세부 설정 열기 (폴더 설명 · 그룹/친구 선택 · 제안 용량)" }}</span>
                </button>

                <div
                  v-if="showCreateSpaceDetail"
                  class="mt-3 space-y-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-4"
                >
                  <div>
                    <label class="block text-xs font-bold text-gray-700">공유 폴더 설명</label>
                    <input
                      v-model="createStorageForm.description"
                      type="text"
                      placeholder="예: A와 B가 공동으로 용량을 합쳐 사용하는 공유 폴더"
                      class="mt-1 w-full rounded-xl border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-900"
                    />
                  </div>

                  <div class="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label class="block text-xs font-bold text-gray-700">내 기여 용량 직접 입력</label>
                      <div class="mt-1 flex items-center gap-1.5">
                        <input
                          v-model.number="createStorageForm.ownerAmount"
                          type="number"
                          min="0"
                          class="w-24 rounded-xl border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-bold"
                        />
                        <select
                          v-model="createStorageForm.ownerUnit"
                          class="rounded-xl border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-bold"
                        >
                          <option value="GB">GB</option>
                          <option value="TB">TB</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label class="block text-xs font-bold text-gray-700">초대 상대방 기본 제안 기여 용량</label>
                      <div class="mt-1 flex items-center gap-1.5">
                        <input
                          v-model.number="createStorageForm.proposedAmount"
                          type="number"
                          min="0"
                          class="w-24 rounded-xl border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-bold"
                        />
                        <select
                          v-model="createStorageForm.proposedUnit"
                          class="rounded-xl border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-bold"
                        >
                          <option value="GB">GB</option>
                          <option value="TB">TB</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  <div v-if="groups.length">
                    <label class="block text-xs font-bold text-gray-700">초대할 관계 그룹</label>
                    <div class="mt-1.5 flex flex-wrap gap-1.5">
                      <label
                        v-for="g in groups"
                        :key="g.groupId"
                        class="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-semibold text-gray-700"
                      >
                        <input v-model="createStorageForm.selectedGroupIds" type="checkbox" :value="g.groupId" />
                        <span>{{ g.name }} ({{ g.relationshipCount }}명)</span>
                      </label>
                    </div>
                  </div>

                  <div v-if="relationships.length">
                    <label class="block text-xs font-bold text-gray-700">초대할 연결된 친구</label>
                    <div class="mt-1.5 flex flex-wrap gap-1.5">
                      <label
                        v-for="rel in relationships"
                        :key="rel.relationshipId"
                        class="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-semibold text-gray-700"
                      >
                        <input
                          v-model="createStorageForm.selectedUserIds"
                          type="checkbox"
                          :value="rel.targetUser.userId"
                        />
                        <span>{{ rel.targetUser.name }} ({{ rel.targetUser.email }})</span>
                      </label>
                    </div>
                  </div>
                </div>
              </div>

              <div class="flex flex-wrap justify-end gap-2 pt-2">
                <button
                  type="button"
                  class="rounded-full border border-gray-300 bg-white px-4 py-2 text-xs font-bold text-gray-600 hover:bg-gray-50"
                  @click="setPage('spaces')"
                >
                  취소
                </button>
                <button
                  type="button"
                  class="rounded-full border border-indigo-200 bg-indigo-50 px-4 py-2 text-xs font-bold text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
                  :disabled="createSpaceSubmitting"
                  @click="handleCreateSharedStorage(true)"
                >
                  만들고 공유 센터 유지
                </button>
                <button
                  type="button"
                  class="rounded-full bg-blue-600 px-6 py-2 text-xs font-black text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
                  :disabled="createSpaceSubmitting"
                  @click="handleCreateSharedStorage(false)"
                >
                  {{ createSpaceSubmitting ? "생성 중..." : "공유 폴더 만들기" }}
                </button>
              </div>
            </section>
          </template>

          <!-- ==================== 페이지 3: 용량 공유 · 대여하기 (공유자 역할) ==================== -->
          <template v-else-if="activePage === 'grant-share'">
            <section class="rounded-2xl border border-gray-200 bg-white p-6 space-y-5">
              <div class="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <span class="rounded-full bg-blue-50 px-3 py-1 text-xs font-extrabold text-blue-700">
                    공유자 전용 페이지
                  </span>
                  <h3 class="mt-2 text-base font-black text-gray-900">내 저장 용량 공유 · 기간 대여하기</h3>
                  <p class="mt-0.5 text-xs text-gray-500">
                    수신자가 용량을 얼마나 사용하는지 공유자는 알 수 없으며 파일에 접근할 수 없습니다.
                  </p>
                </div>
              </div>

              <!-- 간편 3단계 설정 -->
              <div class="grid gap-4 sm:grid-cols-2">
                <!-- 1. 공유 방식 -->
                <div>
                  <label class="block text-xs font-bold text-gray-700">1. 공유 방식</label>
                  <div class="mt-1.5 grid grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      class="rounded-xl border p-3 text-left transition"
                      :class="
                        grantForm.grantType === 'RECURRING'
                          ? 'border-blue-600 bg-blue-50/70 text-blue-950'
                          : 'border-gray-200 bg-white text-gray-700 hover:bg-slate-50'
                      "
                      @click="grantForm.grantType = 'RECURRING'"
                    >
                      <p class="text-xs font-black">월 단위 정기 공유</p>
                      <p class="mt-0.5 text-[11px] text-gray-500">취소 전까지 유지 · 취소 시 1달 유예</p>
                    </button>
                    <button
                      type="button"
                      class="rounded-xl border p-3 text-left transition"
                      :class="
                        grantForm.grantType === 'FIXED'
                          ? 'border-blue-600 bg-blue-50/70 text-blue-950'
                          : 'border-gray-200 bg-white text-gray-700 hover:bg-slate-50'
                      "
                      @click="grantForm.grantType = 'FIXED'"
                    >
                      <p class="text-xs font-black">기간 지정 대여</p>
                      <p class="mt-0.5 text-[11px] text-gray-500">지정한 기간 동안만 대여</p>
                    </button>
                  </div>
                </div>

                <!-- 2. 공유 용량 프리셋 -->
                <div>
                  <label class="block text-xs font-bold text-gray-700">
                    2. 1인당 공유 용량:
                    <strong class="text-blue-600">{{ grantForm.amount }}{{ grantForm.unit }}</strong>
                  </label>
                  <div class="mt-1.5 flex flex-wrap gap-2">
                    <button
                      v-for="preset in [10, 50, 100, 500]"
                      :key="preset"
                      type="button"
                      class="rounded-xl border px-3.5 py-2 text-xs font-black transition"
                      :class="
                        grantForm.amount === preset && grantForm.unit === 'GB'
                          ? 'border-blue-600 bg-blue-50 text-blue-700'
                          : 'border-gray-200 bg-slate-50 text-gray-600 hover:bg-slate-100'
                      "
                      @click="
                        grantForm.amount = preset;
                        grantForm.unit = 'GB';
                      "
                    >
                      {{ preset }}GB
                    </button>
                  </div>
                </div>
              </div>

              <!-- 기간 대여 선택 시 간편 기간 칩 -->
              <div v-if="grantForm.grantType === 'FIXED'" class="rounded-xl border border-blue-100 bg-blue-50/40 p-3.5">
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <span class="text-xs font-bold text-blue-900">
                    대여 기간: {{ formatDate(grantForm.startAt) }} ~ {{ formatDate(grantForm.endAt) }}
                  </span>
                  <div class="flex flex-wrap gap-1.5">
                    <button
                      v-for="item in [
                        { days: 7, label: '7일' },
                        { days: 30, label: '1개월' },
                        { days: 90, label: '3개월' },
                        { days: 180, label: '6개월' },
                      ]"
                      :key="item.days"
                      type="button"
                      class="rounded-full border px-3 py-1 text-xs font-bold transition"
                      :class="
                        grantForm.rentalDaysPreset === item.days
                          ? 'border-blue-600 bg-blue-600 text-white'
                          : 'border-blue-200 bg-white text-blue-700'
                      "
                      @click="applyRentalPresetDays(item.days)"
                    >
                      {{ item.label }}
                    </button>
                  </div>
                </div>
              </div>

              <!-- 3. 받는 사람 이메일 -->
              <div>
                <label class="block text-xs font-bold text-gray-700">3. 받는 사람 이메일 (여러 명은 쉼표로 구분)</label>
                <input
                  v-model="grantForm.emailsText"
                  type="text"
                  placeholder="예: userb@example.com (또는 아래 세부 설정에서 그룹/친구 선택)"
                  class="mt-1.5 w-full rounded-xl border border-gray-300 px-3.5 py-2 text-sm text-gray-900"
                />
              </div>

              <!-- 세부 설정 토글 (직접 용량 입력, 정확한 날짜 지정, 그룹/친구 선택) -->
              <div class="border-t border-gray-100 pt-3">
                <button
                  type="button"
                  class="inline-flex items-center gap-1.5 text-xs font-extrabold text-gray-600 hover:text-blue-600"
                  @click="showGrantDetail = !showGrantDetail"
                >
                  <i class="fa-solid" :class="showGrantDetail ? 'fa-chevron-up' : 'fa-sliders'"></i>
                  <span>{{ showGrantDetail ? "세부 설정 접기" : "세부 설정 열기 (그룹/친구 선택 · 날짜/용량 직접 지정)" }}</span>
                </button>

                <div
                  v-if="showGrantDetail"
                  class="mt-3 space-y-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-4"
                >
                  <div class="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label class="block text-xs font-bold text-gray-700">용량 직접 입력</label>
                      <div class="mt-1 flex items-center gap-1.5">
                        <input
                          v-model.number="grantForm.amount"
                          type="number"
                          min="1"
                          class="w-28 rounded-xl border border-gray-300 bg-white px-3 py-1.5 text-xs font-bold"
                        />
                        <select
                          v-model="grantForm.unit"
                          class="rounded-xl border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-bold"
                        >
                          <option value="GB">GB</option>
                          <option value="TB">TB</option>
                        </select>
                      </div>
                    </div>

                    <div v-if="grantForm.grantType === 'FIXED'" class="grid gap-2 sm:grid-cols-2">
                      <div>
                        <label class="block text-[11px] font-bold text-gray-600">대여 시작일시</label>
                        <input
                          v-model="grantForm.startAt"
                          type="datetime-local"
                          class="mt-1 w-full rounded-xl border border-gray-300 bg-white px-2.5 py-1.5 text-xs"
                        />
                      </div>
                      <div>
                        <label class="block text-[11px] font-bold text-gray-600">대여 종료일시</label>
                        <input
                          v-model="grantForm.endAt"
                          type="datetime-local"
                          class="mt-1 w-full rounded-xl border border-gray-300 bg-white px-2.5 py-1.5 text-xs"
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label class="block text-xs font-bold text-gray-700">관계 그룹 선택 (그룹원 각각에게 지급)</label>
                    <div v-if="groups.length" class="mt-1.5 flex flex-wrap gap-1.5">
                      <label
                        v-for="group in groups"
                        :key="group.groupId"
                        class="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-semibold text-gray-700"
                      >
                        <input v-model="grantForm.selectedGroupIds" type="checkbox" :value="group.groupId" />
                        <span>{{ group.name }} ({{ group.relationshipCount }}명)</span>
                      </label>
                    </div>
                    <p v-else class="mt-1 text-xs text-gray-400">생성된 관계 그룹이 없습니다.</p>
                  </div>

                  <div>
                    <label class="block text-xs font-bold text-gray-700">연결된 친구 선택</label>
                    <div v-if="relationships.length" class="mt-1.5 flex flex-wrap gap-1.5">
                      <label
                        v-for="rel in relationships"
                        :key="rel.relationshipId"
                        class="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-semibold text-gray-700"
                      >
                        <input v-model="grantForm.selectedUserIds" type="checkbox" :value="rel.targetUser.userId" />
                        <span>{{ rel.targetUser.name }} ({{ rel.targetUser.email }})</span>
                      </label>
                    </div>
                    <p v-else class="mt-1 text-xs text-gray-400">연결된 친구가 없습니다.</p>
                  </div>
                </div>
              </div>

              <div class="flex justify-end pt-2">
                <button
                  type="button"
                  class="rounded-full bg-blue-600 px-6 py-2.5 text-xs font-black text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
                  :disabled="grantSubmitting"
                  @click="handleCreateGrant"
                >
                  {{ grantSubmitting ? "처리 중..." : "용량 공유 · 대여 시작하기" }}
                </button>
              </div>
            </section>
          </template>

          <!-- ==================== 페이지 4: 공유 내역 (공유 한 내역 / 공유받은 내역) ==================== -->
          <template v-else-if="activePage === 'grant-status'">
            <section class="rounded-2xl border border-gray-200 bg-white p-6 space-y-4">
              <!-- 역할 전환 서브 탭 -->
              <div class="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 pb-4">
                <div class="inline-flex rounded-full border border-gray-200 bg-slate-100 p-1">
                  <button
                    type="button"
                    class="rounded-full px-4 py-1.5 text-xs font-extrabold transition"
                    :class="
                      grantHistoryRoleTab === 'outgoing'
                        ? 'bg-white text-blue-600 shadow-sm'
                        : 'text-gray-600 hover:text-gray-900'
                    "
                    @click="grantHistoryRoleTab = 'outgoing'"
                  >
                    내가 공유해 준 내역 ({{ outgoingGrantsCount }})
                  </button>
                  <button
                    type="button"
                    class="rounded-full px-4 py-1.5 text-xs font-extrabold transition"
                    :class="
                      grantHistoryRoleTab === 'incoming'
                        ? 'bg-white text-blue-600 shadow-sm'
                        : 'text-gray-600 hover:text-gray-900'
                    "
                    @click="grantHistoryRoleTab = 'incoming'"
                  >
                    내가 공유받은 내역 ({{ incomingGrantsCount }})
                  </button>
                </div>

                <button
                  type="button"
                  class="rounded-full border border-blue-200 bg-blue-50 px-3.5 py-1.5 text-xs font-bold text-blue-700 hover:bg-blue-100"
                  @click="setPage('grant-share')"
                >
                  + 새 용량 공유하기
                </button>
              </div>

              <!-- [탭 A] 내가 공유해 준 내역 -->
              <div v-if="grantHistoryRoleTab === 'outgoing'">
                <p class="mb-3 text-xs text-gray-500">
                  수신자의 실제 사용량과 파일 목록은 프라이버시 정책에 따라 비공개됩니다.
                </p>

                <div v-if="capacityOverview?.outgoingGrants?.length" class="space-y-2.5">
                  <div
                    v-for="item in capacityOverview.outgoingGrants"
                    :key="item.grantIdx"
                    class="rounded-2xl border border-gray-200 bg-slate-50/70 p-4"
                  >
                    <div class="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div class="flex flex-wrap items-center gap-2">
                          <span class="text-sm font-black text-gray-900">
                            {{ item.recipientName }} ({{ item.recipientEmail }})
                          </span>
                          <span class="text-xs font-black text-blue-600">
                            {{ formatBytes(item.bytes) }}
                          </span>
                          <span
                            class="rounded-full px-2.5 py-0.5 text-[11px] font-bold"
                            :class="
                              item.status === 'ACTIVE'
                                ? 'bg-emerald-100 text-emerald-700'
                                : item.status === 'CANCELLED'
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-gray-200 text-gray-600'
                            "
                          >
                            {{
                              item.status === "ACTIVE"
                                ? item.grantType === "RECURRING"
                                  ? "월 정기 공유 중"
                                  : "기간 대여 중"
                                : item.status === "CANCELLED"
                                  ? "취소됨 (1개월 유예)"
                                  : "종료됨"
                            }}
                          </span>
                        </div>
                      </div>

                      <div class="flex items-center gap-2">
                        <button
                          type="button"
                          class="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-bold text-gray-600 hover:bg-gray-100"
                          @click="toggleGrantDetailCard(item.grantIdx)"
                        >
                          {{ expandedGrantDetailMap[item.grantIdx] ? "세부 닫기" : "세부 정보" }}
                        </button>
                        <button
                          v-if="item.status === 'ACTIVE'"
                          type="button"
                          class="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-bold text-rose-600 hover:bg-rose-600 hover:text-white"
                          @click="handleCancelGrant(item, true)"
                        >
                          공유 취소
                        </button>
                      </div>
                    </div>

                    <div
                      v-if="expandedGrantDetailMap[item.grantIdx]"
                      class="mt-3 border-t border-gray-200/80 pt-2.5 text-xs text-gray-600 space-y-1"
                    >
                      <p>시작일시: {{ formatDate(item.startAt) }}</p>
                      <p v-if="item.nextCycleAt">다음 1개월 자동 갱신일: {{ formatDate(item.nextCycleAt) }}</p>
                      <p v-if="item.endAt">만료(초과 데이터 자동 정리) 일시: {{ formatDate(item.endAt) }}</p>
                      <p v-if="item.sourceLabel">공유 경로: {{ item.sourceLabel }}</p>
                    </div>
                  </div>
                </div>
                <div
                  v-else
                  class="rounded-2xl border border-dashed border-gray-200 bg-slate-50 px-4 py-10 text-center text-xs text-gray-500"
                >
                  다른 사용자에게 공유하거나 대여한 내역이 없습니다.
                </div>
              </div>

              <!-- [탭 B] 내가 공유받은 내역 -->
              <div v-else>
                <p class="mb-3 text-xs text-gray-500">
                  취소 유예 기간(1개월) 또는 대여 기간 만료 시 초과 용량은 휴지통 → 오래된 파일 버전 → 오래된 파일 순으로 자동 정리됩니다.
                </p>

                <div v-if="capacityOverview?.incomingGrants?.length" class="space-y-2.5">
                  <div
                    v-for="item in capacityOverview.incomingGrants"
                    :key="item.grantIdx"
                    class="rounded-2xl border border-gray-200 bg-slate-50/70 p-4"
                  >
                    <div class="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div class="flex flex-wrap items-center gap-2">
                          <span class="text-sm font-black text-gray-900">
                            제공자: {{ item.granterName }} ({{ item.granterEmail }})
                          </span>
                          <span class="text-xs font-black text-emerald-600">
                            +{{ formatBytes(item.bytes) }}
                          </span>
                          <span
                            class="rounded-full px-2.5 py-0.5 text-[11px] font-bold"
                            :class="
                              item.status === 'ACTIVE'
                                ? 'bg-blue-100 text-blue-700'
                                : item.status === 'CANCELLED'
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-gray-200 text-gray-600'
                            "
                          >
                            {{
                              item.status === "ACTIVE"
                                ? item.grantType === "RECURRING"
                                  ? "월 정기 공유 받음"
                                  : "기간 대여 받음"
                                : item.status === "CANCELLED"
                                  ? "취소 유예 기간 진행 중"
                                  : "만료됨"
                            }}
                          </span>
                        </div>
                      </div>

                      <div class="flex items-center gap-2">
                        <button
                          type="button"
                          class="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-bold text-gray-600 hover:bg-gray-100"
                          @click="toggleGrantDetailCard(item.grantIdx)"
                        >
                          {{ expandedGrantDetailMap[item.grantIdx] ? "세부 닫기" : "세부 정보" }}
                        </button>
                        <button
                          v-if="item.status === 'ACTIVE' || item.status === 'CANCELLED'"
                          type="button"
                          class="rounded-full border border-gray-300 bg-white px-3 py-1 text-xs font-bold text-gray-700 hover:bg-gray-100"
                          @click="handleCancelGrant(item, false)"
                        >
                          즉시 반납
                        </button>
                      </div>
                    </div>

                    <div
                      v-if="expandedGrantDetailMap[item.grantIdx]"
                      class="mt-3 border-t border-gray-200/80 pt-2.5 text-xs text-gray-600 space-y-1"
                    >
                      <p>시작일시: {{ formatDate(item.startAt) }}</p>
                      <p v-if="item.endAt" class="font-semibold text-amber-700">
                        만료일시: {{ formatDate(item.endAt) }}
                      </p>
                    </div>
                  </div>
                </div>
                <div
                  v-else
                  class="rounded-2xl border border-dashed border-gray-200 bg-slate-50 px-4 py-10 text-center text-xs text-gray-500"
                >
                  공유받거나 대여받은 저장 용량이 없습니다.
                </div>
              </div>
            </section>
          </template>
        </div>
      </div>
    </div>
  </Teleport>
</template>
