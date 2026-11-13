<script setup>
import { computed, onMounted, ref } from "vue";
import {
  fetchAdministratorDashboard,
  fetchAdministratorLoginSettings,
  fetchAdministratorShareAudit,
  fetchAdministratorSessions,
  fetchAdministratorUploadSettings,
  forceLogoutAdministratorSession,
  forceLogoutAdministratorUserSessions,
  fetchAdministratorStorageAnalytics,
  updateAdministratorLoginSettings,
  updateAdministratorStorageCapacity,
  updateAdministratorUploadSettings,
  updateAdministratorUserStatus,
} from "@/api/administratorApi.js";
import { useFileStore } from "@/stores/useFileStore.js";
import {
  ADMIN_SECTIONS,
  DISPLAY_UNITS,
} from "@/constants/adminDashboardOptions.js";
import {
  bytesToDisplayUnitInput,
  formatBytesAuto,
  formatBytesByUnit as formatBytesBySelectedUnit,
  formatPercent,
} from "@/utils/storageFormat.js";
import AdminPlanSection from "./components/AdminPlanSection.vue";
import AdminStorageSection from "./components/AdminStorageSection.vue";
import { statusBadgeClass } from "./services/adminDashboardFormat.js";
import {
  buildPaymentMixCards,
  buildPlanRows,
  buildPlanSummaryCards,
  buildShareAuditRows,
  buildSessionRows,
  buildStorageBreakdownCards,
  buildStorageBreakdownVisuals,
  buildStorageUsers,
  buildStorageVisualSummary,
  buildTopStorageUsers,
  buildTransferBreakdownRows,
  buildTransferVisualGroups,
  filterAdminUsers,
} from "./services/adminDashboardViewModels.js";

const fileStore = useFileStore();
const dashboard = ref(null);
const storageAnalytics = ref(null);
const shareAuditLogs = ref([]);
const sessions = ref([]);
const socialLoginVisible = ref(false);
const maxUploadFileBytes = ref(20 * 1024 * 1024 * 1024);
const maxUploadSizeValue = ref("20");
const maxUploadSizeUnit = ref("GB");
const isLoading = ref(false);
const isStorageLoading = ref(false);
const isShareAuditLoading = ref(false);
const isSessionLoading = ref(false);
const isUpdating = ref(false);
const isLoginSettingsSaving = ref(false);
const isUploadSettingsSaving = ref(false);
const isCapacitySaving = ref(false);
const isCapacityEditing = ref(false);
const errorMessage = ref("");
const storageErrorMessage = ref("");
const shareAuditErrorMessage = ref("");
const sessionErrorMessage = ref("");
const searchQuery = ref("");
const statusFilter = ref("ALL");
const storageDisplayUnit = ref("GB");
const storageRangeCode = ref("24H");
const providerCapacityValue = ref("50");
const providerCapacityUnit = ref("TB");
const activeSection = ref("users");
const uploadSizeUnits = DISPLAY_UNITS.filter((unit) => ["MB", "GB", "TB"].includes(unit.value));
const formatBytesByUnit = (bytes, unit = storageDisplayUnit.value) =>
  formatBytesBySelectedUnit(bytes, unit);
const applyCapacityInputFromBytes = (bytes) => {
  const input = bytesToDisplayUnitInput(bytes);
  providerCapacityValue.value = input.value;
  providerCapacityUnit.value = input.unit;
};
const applyMaxUploadInputFromBytes = (bytes) => {
  const safeBytes = Number(bytes) > 0 ? Number(bytes) : 20 * 1024 * 1024 * 1024;
  maxUploadFileBytes.value = safeBytes;
  const input = bytesToDisplayUnitInput(safeBytes);
  if (["MB", "GB", "TB"].includes(input.unit)) {
    maxUploadSizeValue.value = input.value;
    maxUploadSizeUnit.value = input.unit;
  } else {
    maxUploadSizeValue.value = String(Math.max(1, Math.round((safeBytes / (1024 ** 3)) * 100) / 100));
    maxUploadSizeUnit.value = "GB";
  }
};

const summaryCards = computed(() => {
  const summary = dashboard.value?.summary;
  if (!summary) return [];

  return [
    { label: "전체 사용자", value: `${summary.totalUserCount}명` },
    { label: "활성 사용자", value: `${summary.activeUserCount}명` },
    { label: "정지 사용자", value: `${summary.suspendedUserCount}명` },
    { label: "차단 사용자", value: `${summary.bannedUserCount}명` },
    { label: "전체 사용 용량", value: formatBytesAuto(summary.totalUsedBytes) },
    { label: "전체 파일 수", value: `${summary.totalFileCount}개` },
    { label: "전체 폴더 수", value: `${summary.totalFolderCount}개` },
    { label: "전체 사용 비율", value: formatPercent(summary.overallUsagePercent) },
  ];
});

const storageSummaryCards = computed(() => {
  const summary = storageAnalytics.value?.summary;
  if (!summary) return [];

  return [
    { label: "집계 기간", value: storageAnalytics.value?.window?.rangeLabel || "-" },
    { label: "서비스 총 용량", value: formatBytesByUnit(summary.providerCapacityBytes) },
    { label: "현재 저장 데이터", value: formatBytesByUnit(summary.providerUsedBytes) },
    { label: "남은 서비스 용량", value: formatBytesByUnit(summary.providerRemainingBytes) },
    { label: "서비스 사용률", value: formatPercent(summary.providerUsagePercent) },
    { label: "일반 사용자 할당 총량", value: formatBytesByUnit(summary.allocatedUserQuotaBytes) },
    { label: "일반 사용자 사용량", value: formatBytesByUnit(summary.allocatedUserUsedBytes) },
    { label: "총 입력량", value: formatBytesByUnit(summary.totalIngressBytes) },
    { label: "총 출력량", value: formatBytesByUnit(summary.totalEgressBytes) },
    { label: "완료 업로드량", value: formatBytesByUnit(summary.completedIngressBytes) },
    { label: "취소/정리 업로드량", value: formatBytesByUnit(summary.canceledIngressBytes) },
  ];
});

const storageBreakdownCards = computed(() =>
  buildStorageBreakdownCards(storageAnalytics.value?.storageBreakdown, formatBytesByUnit),
);

const transferBreakdownRows = computed(() =>
  buildTransferBreakdownRows(storageAnalytics.value?.transferBreakdown, formatBytesByUnit),
);

const storageVisualSummary = computed(() =>
  buildStorageVisualSummary(storageAnalytics.value?.summary, formatBytesByUnit),
);

const storageBreakdownVisuals = computed(() =>
  buildStorageBreakdownVisuals(storageBreakdownCards.value),
);

const transferVisualGroups = computed(() =>
  buildTransferVisualGroups(transferBreakdownRows.value, formatBytesByUnit),
);

const filteredUsers = computed(() =>
  filterAdminUsers(dashboard.value?.users, searchQuery.value, statusFilter.value),
);

const storageUsers = computed(() =>
  buildStorageUsers(storageAnalytics.value?.users, formatBytesByUnit),
);

const topStorageUsers = computed(() =>
  buildTopStorageUsers(storageUsers.value, formatBytesByUnit),
);
const planSummaryCards = computed(() => buildPlanSummaryCards(dashboard.value?.planStats));

const paymentMixCards = computed(() => buildPaymentMixCards(dashboard.value?.planStats));

const planRows = computed(() => buildPlanRows(dashboard.value?.planStats));

const shareAuditRows = computed(() => buildShareAuditRows(shareAuditLogs.value));

const sessionRows = computed(() => buildSessionRows(sessions.value));

const loadDashboard = async () => {
  isLoading.value = true;
  errorMessage.value = "";

  try {
    const result = await fetchAdministratorDashboard();
    dashboard.value = result;
    if (typeof result?.socialLoginVisible === "boolean") {
      socialLoginVisible.value = result.socialLoginVisible;
    } else {
      const loginSettings = await fetchAdministratorLoginSettings();
      socialLoginVisible.value = Boolean(loginSettings?.socialLoginVisible);
    }

    if (Number(result?.maxUploadFileBytes) > 0) {
      applyMaxUploadInputFromBytes(result.maxUploadFileBytes);
    } else {
      const uploadSettings = await fetchAdministratorUploadSettings();
      applyMaxUploadInputFromBytes(uploadSettings?.maxUploadFileBytes);
    }
  } catch (error) {
    errorMessage.value =
      error?.response?.data?.message ||
      error?.message ||
      "관리자 대시보드를 불러오지 못했습니다.";
  } finally {
    isLoading.value = false;
  }
};

const handleSocialLoginVisibilityChange = async (nextVisible) => {
  if (isLoginSettingsSaving.value || socialLoginVisible.value === nextVisible) {
    return;
  }

  isLoginSettingsSaving.value = true;
  errorMessage.value = "";

  try {
    const result = await updateAdministratorLoginSettings(nextVisible);
    socialLoginVisible.value = Boolean(result?.socialLoginVisible);
    if (dashboard.value) {
      dashboard.value = {
        ...dashboard.value,
        socialLoginVisible: socialLoginVisible.value,
      };
    }
  } catch (error) {
    errorMessage.value =
      error?.response?.data?.message ||
      error?.message ||
      "소셜 로그인 표시 설정을 변경하지 못했습니다.";
  } finally {
    isLoginSettingsSaving.value = false;
  }
};

const handleMaxUploadSizeSave = async () => {
  const numericValue = Number(maxUploadSizeValue.value);
  const unit = uploadSizeUnits.find((item) => item.value === maxUploadSizeUnit.value);
  if (!Number.isFinite(numericValue) || numericValue <= 0 || !unit) {
    errorMessage.value = "최대 업로드 파일 크기를 올바르게 입력해 주세요.";
    return;
  }

  const nextBytes = Math.round(numericValue * unit.bytes);
  if (nextBytes <= 0) {
    errorMessage.value = "최대 업로드 파일 크기를 1B 이상으로 설정해 주세요.";
    return;
  }

  isUploadSettingsSaving.value = true;
  errorMessage.value = "";

  try {
    const result = await updateAdministratorUploadSettings(nextBytes);
    const savedBytes = Number(result?.maxUploadFileBytes) || nextBytes;
    applyMaxUploadInputFromBytes(savedBytes);
    if (dashboard.value) {
      dashboard.value = {
        ...dashboard.value,
        maxUploadFileBytes: savedBytes,
      };
    }
    await fileStore.fetchStorageSummary().catch(() => {});
  } catch (error) {
    errorMessage.value =
      error?.response?.data?.message ||
      error?.message ||
      "최대 업로드 파일 크기 설정을 저장하지 못했습니다.";
  } finally {
    isUploadSettingsSaving.value = false;
  }
};

const applyQuickMaxUploadPreset = async (value, unitCode) => {
  maxUploadSizeValue.value = String(value);
  maxUploadSizeUnit.value = unitCode;
  await handleMaxUploadSizeSave();
};

const loadStorageAnalytics = async () => {
  isStorageLoading.value = true;
  storageErrorMessage.value = "";

  try {
    const result = await fetchAdministratorStorageAnalytics(storageRangeCode.value);
    storageAnalytics.value = result;
    applyCapacityInputFromBytes(result?.summary?.providerCapacityBytes);
    isCapacityEditing.value = false;
  } catch (error) {
    storageErrorMessage.value =
      error?.response?.data?.message ||
      error?.message ||
      "스토리지 통계를 불러오지 못했습니다.";
  } finally {
    isStorageLoading.value = false;
  }
};

const handleStorageRangeChange = async () => {
  await loadStorageAnalytics();
};

const loadShareAudit = async () => {
  isShareAuditLoading.value = true;
  shareAuditErrorMessage.value = "";

  try {
    shareAuditLogs.value = await fetchAdministratorShareAudit();
  } catch (error) {
    shareAuditErrorMessage.value =
      error?.response?.data?.message ||
      error?.message ||
      "공유 감사 로그를 불러오지 못했습니다.";
  } finally {
    isShareAuditLoading.value = false;
  }
};

const loadSessions = async () => {
  isSessionLoading.value = true;
  sessionErrorMessage.value = "";

  try {
    sessions.value = await fetchAdministratorSessions();
  } catch (error) {
    sessionErrorMessage.value =
      error?.response?.data?.message ||
      error?.message ||
      "세션 목록을 불러오지 못했습니다.";
  } finally {
    isSessionLoading.value = false;
  }
};

const handleForceLogoutSession = async (session) => {
  if (!session?.sessionId || !window.confirm("이 세션을 강제 로그아웃할까요?")) {
    return;
  }

  isSessionLoading.value = true;
  sessionErrorMessage.value = "";
  try {
    await forceLogoutAdministratorSession(session.sessionId);
    await loadSessions();
  } catch (error) {
    sessionErrorMessage.value =
      error?.response?.data?.message ||
      error?.message ||
      "세션을 강제 로그아웃하지 못했습니다.";
  } finally {
    isSessionLoading.value = false;
  }
};

const handleForceLogoutUserSessions = async (session) => {
  if (!session?.userIdx || !window.confirm("이 사용자의 모든 세션을 강제 로그아웃할까요?")) {
    return;
  }

  isSessionLoading.value = true;
  sessionErrorMessage.value = "";
  try {
    await forceLogoutAdministratorUserSessions(session.userIdx);
    await loadSessions();
  } catch (error) {
    sessionErrorMessage.value =
      error?.response?.data?.message ||
      error?.message ||
      "사용자 세션을 강제 로그아웃하지 못했습니다.";
  } finally {
    isSessionLoading.value = false;
  }
};

const loadAll = async () => {
  await Promise.all([loadDashboard(), loadStorageAnalytics(), loadShareAudit(), loadSessions()]);
};

const applyUpdatedUserToDashboard = (updatedUser) => {
  if (!updatedUser?.idx || !dashboard.value?.users) {
    return;
  }

  const previousUser = dashboard.value.users.find((user) => user.idx === updatedUser.idx);
  if (!previousUser) {
    return;
  }

  const users = dashboard.value.users.map((user) =>
    user.idx === updatedUser.idx ? { ...user, ...updatedUser } : user,
  );

  let summary = dashboard.value.summary;
  const previousStatus = previousUser.accountStatus || "ACTIVE";
  const nextStatus = updatedUser.accountStatus || previousStatus;

  if (summary && previousStatus !== nextStatus) {
    summary = { ...summary };

    const decrementKeyByStatus = {
      ACTIVE: "activeUserCount",
      SUSPENDED: "suspendedUserCount",
      BANNED: "bannedUserCount",
    };
    const incrementKeyByStatus = decrementKeyByStatus;

    const previousKey = decrementKeyByStatus[previousStatus];
    const nextKey = incrementKeyByStatus[nextStatus];

    if (previousKey && typeof summary[previousKey] === "number") {
      summary[previousKey] = Math.max(0, summary[previousKey] - 1);
    }
    if (nextKey && typeof summary[nextKey] === "number") {
      summary[nextKey] += 1;
    }
  }

  dashboard.value = {
    ...dashboard.value,
    users,
    summary,
  };
};

const handleStatusChange = async (user, nextStatus) => {
  if (!user?.idx || user.accountStatus === nextStatus || user.id === "administrator@administrator.adm") {
    return;
  }

  isUpdating.value = true;
  errorMessage.value = "";

  try {
    const updatedUser = await updateAdministratorUserStatus(user.idx, nextStatus);
    applyUpdatedUserToDashboard(updatedUser);
    await loadDashboard();
  } catch (error) {
    errorMessage.value =
      error?.response?.data?.message ||
      error?.message ||
      "사용자 상태를 변경하지 못했습니다.";
  } finally {
    isUpdating.value = false;
  }
};

const startCapacityEditing = () => {
  applyCapacityInputFromBytes(storageAnalytics.value?.summary?.providerCapacityBytes);
  isCapacityEditing.value = true;
};

const cancelCapacityEditing = () => {
  applyCapacityInputFromBytes(storageAnalytics.value?.summary?.providerCapacityBytes);
  isCapacityEditing.value = false;
};

const handleCapacitySave = async () => {
  const numericValue = Number(providerCapacityValue.value);
  const unit = DISPLAY_UNITS.find((item) => item.value === providerCapacityUnit.value);
  if (!Number.isFinite(numericValue) || numericValue <= 0 || !unit) {
    storageErrorMessage.value = "서비스 총 용량 값을 올바르게 입력해 주세요.";
    return;
  }

  isCapacitySaving.value = true;
  storageErrorMessage.value = "";

  try {
    const result = await updateAdministratorStorageCapacity(
      Math.round(numericValue * unit.bytes),
      storageRangeCode.value,
    );
    storageAnalytics.value = result;
    applyCapacityInputFromBytes(result?.summary?.providerCapacityBytes);
    isCapacityEditing.value = false;
  } catch (error) {
    storageErrorMessage.value =
      error?.response?.data?.message ||
      error?.message ||
      "서비스 총 용량을 저장하지 못했습니다.";
  } finally {
    isCapacitySaving.value = false;
  }
};

onMounted(() => {
  loadAll();
});
</script>

<template>
  <div class="admin-page">
    <div class="admin-page__header">
      <div>
        <p class="admin-page__eyebrow">관리자</p>
        <h1 class="admin-page__title">관리자 페이지</h1>
        <p class="admin-page__description">
          사용자 관리, 로그인 페이지 소셜 로그인 노출(ON/OFF), 최대 업로드 파일 크기 설정, 스토리지 통계 및 분석, 플랜 및 결제 비중 통계를 관리합니다.
        </p>
      </div>

      <button
        type="button"
        class="admin-page__refresh"
        :disabled="isLoading || isStorageLoading || isShareAuditLoading || isSessionLoading || isUpdating || isCapacitySaving || isLoginSettingsSaving || isUploadSettingsSaving"
        @click="loadAll"
      >
        새로고침
      </button>
    </div>

    <section class="admin-panel admin-panel--login-setting">
      <div class="admin-login-setting">
        <div class="admin-login-setting__info">
          <div class="admin-login-setting__title-row">
            <h2 class="admin-panel__title">로그인 페이지 소셜 로그인 표시 설정</h2>
            <span
              class="admin-badge"
              :class="socialLoginVisible ? 'admin-badge--active' : 'admin-badge--suspended'"
            >
              {{ socialLoginVisible ? "소셜 로그인 표시 중 (ON)" : "소셜 로그인 숨김 (OFF)" }}
            </span>
          </div>
          <p class="admin-panel__description">
            로그인 화면에서 Google · Kakao · Naver 소셜 로그인 버튼 영역의 노출 여부를 즉시 전환합니다.
          </p>
        </div>

        <div class="admin-login-setting__actions">
          <button
            type="button"
            class="admin-toggle-btn"
            :class="{ 'admin-toggle-btn--on': socialLoginVisible }"
            :disabled="isLoginSettingsSaving || socialLoginVisible"
            @click="handleSocialLoginVisibilityChange(true)"
          >
            ON (보이기)
          </button>
          <button
            type="button"
            class="admin-toggle-btn"
            :class="{ 'admin-toggle-btn--off': !socialLoginVisible }"
            :disabled="isLoginSettingsSaving || !socialLoginVisible"
            @click="handleSocialLoginVisibilityChange(false)"
          >
            OFF (숨기기)
          </button>
        </div>
      </div>
    </section>

    <section class="admin-panel admin-panel--upload-setting">
      <div class="admin-upload-setting">
        <div class="admin-login-setting__info">
          <div class="admin-login-setting__title-row">
            <h2 class="admin-panel__title">단일 파일 최대 업로드 크기 설정</h2>
            <span class="admin-badge admin-badge--active">
              현재 최대 크기: {{ formatBytesAuto(maxUploadFileBytes) }}
            </span>
          </div>
          <p class="admin-panel__description">
            업로드 가능한 단일 파일의 최대 용량을 원하는 크기로 설정합니다. 저장 즉시 드라이브 업로드 제한에 반영됩니다.
          </p>
        </div>

        <div class="admin-upload-setting__controls">
          <div class="admin-upload-setting__presets">
            <button
              type="button"
              class="admin-preset-btn"
              :disabled="isUploadSettingsSaving"
              @click="applyQuickMaxUploadPreset(5, 'GB')"
            >
              5 GB
            </button>
            <button
              type="button"
              class="admin-preset-btn"
              :disabled="isUploadSettingsSaving"
              @click="applyQuickMaxUploadPreset(20, 'GB')"
            >
              20 GB
            </button>
            <button
              type="button"
              class="admin-preset-btn"
              :disabled="isUploadSettingsSaving"
              @click="applyQuickMaxUploadPreset(50, 'GB')"
            >
              50 GB
            </button>
            <button
              type="button"
              class="admin-preset-btn"
              :disabled="isUploadSettingsSaving"
              @click="applyQuickMaxUploadPreset(100, 'GB')"
            >
              100 GB
            </button>
            <button
              type="button"
              class="admin-preset-btn"
              :disabled="isUploadSettingsSaving"
              @click="applyQuickMaxUploadPreset(500, 'GB')"
            >
              500 GB
            </button>
            <button
              type="button"
              class="admin-preset-btn"
              :disabled="isUploadSettingsSaving"
              @click="applyQuickMaxUploadPreset(1, 'TB')"
            >
              1 TB
            </button>
          </div>

          <div class="admin-upload-setting__input-row">
            <input
              v-model="maxUploadSizeValue"
              type="number"
              min="1"
              step="any"
              class="admin-input admin-upload-setting__number"
              placeholder="크기 입력"
              :disabled="isUploadSettingsSaving"
              @keyup.enter="handleMaxUploadSizeSave"
            />
            <select
              v-model="maxUploadSizeUnit"
              class="admin-select admin-upload-setting__unit"
              :disabled="isUploadSettingsSaving"
            >
              <option v-for="unit in uploadSizeUnits" :key="unit.value" :value="unit.value">
                {{ unit.label }}
              </option>
            </select>
            <button
              type="button"
              class="admin-action admin-action--active admin-upload-setting__save"
              :disabled="isUploadSettingsSaving"
              @click="handleMaxUploadSizeSave"
            >
              {{ isUploadSettingsSaving ? "저장 중..." : "크기 적용" }}
            </button>
          </div>
        </div>
      </div>
    </section>

    <section class="admin-panel admin-panel--selector">
      <div class="admin-view-tabs">
        <button
          v-for="section in ADMIN_SECTIONS"
          :key="section.value"
          type="button"
          class="admin-tab"
          :class="{ 'admin-tab--active': activeSection === section.value }"
          @click="activeSection = section.value"
        >
          {{ section.label }}
        </button>
      </div>
    </section>

    <div v-if="errorMessage" class="admin-alert">
      {{ errorMessage }}
    </div>

    <div v-if="storageErrorMessage" class="admin-alert admin-alert--info">
      {{ storageErrorMessage }}
    </div>

    <div v-if="shareAuditErrorMessage" class="admin-alert admin-alert--info">
      {{ shareAuditErrorMessage }}
    </div>

    <div v-if="sessionErrorMessage" class="admin-alert admin-alert--info">
      {{ sessionErrorMessage }}
    </div>

    <div v-if="(isLoading && !dashboard) || (isStorageLoading && !storageAnalytics)" class="admin-panel admin-panel--empty">
      관리자 데이터를 불러오는 중입니다.
    </div>

    <template v-else>
      <section v-if="activeSection === 'users' && dashboard" class="admin-layout admin-layout--stack">
        <section class="admin-summary-grid">
          <article v-for="card in summaryCards" :key="card.label" class="admin-card">
            <p class="admin-card__label">{{ card.label }}</p>
            <p class="admin-card__value">{{ card.value }}</p>
          </article>
        </section>

        <section class="admin-panel">
          <div class="admin-panel__header">
            <div>
              <h2 class="admin-panel__title">사용자 관리</h2>
              <p class="admin-panel__description">
                계정 상태와 플랜, 용량 사용률을 확인하고 활성, 정지, 차단 상태를 관리합니다.
              </p>
            </div>
          </div>

          <div class="admin-toolbar">
            <input
              v-model="searchQuery"
              type="search"
              class="admin-input"
              placeholder="email, 이름, 역할, 플랜 검색"
            />

            <select v-model="statusFilter" class="admin-select">
              <option value="ALL">전체 상태</option>
              <option value="ACTIVE">활성</option>
              <option value="SUSPENDED">정지</option>
              <option value="BANNED">차단</option>
            </select>
          </div>

          <div class="admin-table-wrap">
            <table class="admin-table">
              <thead>
                <tr>
                  <th>이메일</th>
                  <th>이름</th>
                  <th>역할</th>
                  <th>상태</th>
                  <th>플랜</th>
                  <th>용량</th>
                  <th>파일/폴더</th>
                  <th>공유</th>
                  <th>관리</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="user in filteredUsers" :key="user.idx">
                  <td class="admin-table__strong">{{ user.id }}</td>
                  <td>{{ user.name || "-" }}</td>
                  <td>{{ user.role }}</td>
                  <td>
                    <span :class="statusBadgeClass(user.accountStatus)">{{ user.accountStatus }}</span>
                  </td>
                  <td>{{ user.planLabel }}</td>
                  <td>
                    <div>{{ formatBytesAuto(user.usedBytes) }}</div>
                    <div class="admin-table__muted">{{ formatPercent(user.usagePercent) }}</div>
                  </td>
                  <td>{{ user.fileCount }} / {{ user.folderCount }}</td>
                  <td>{{ user.sharedFileCount }}</td>
                  <td>
                    <div class="admin-actions">
                      <button
                        type="button"
                        class="admin-action admin-action--active"
                        :disabled="isUpdating || user.id === 'administrator@administrator.adm' || user.accountStatus === 'ACTIVE'"
                        @click="handleStatusChange(user, 'ACTIVE')"
                      >
                        활성
                      </button>
                      <button
                        type="button"
                        class="admin-action admin-action--suspended"
                        :disabled="isUpdating || user.id === 'administrator@administrator.adm' || user.accountStatus === 'SUSPENDED'"
                        @click="handleStatusChange(user, 'SUSPENDED')"
                      >
                        정지
                      </button>
                      <button
                        type="button"
                        class="admin-action admin-action--banned"
                        :disabled="isUpdating || user.id === 'administrator@administrator.adm' || user.accountStatus === 'BANNED'"
                        @click="handleStatusChange(user, 'BANNED')"
                      >
                        차단
                      </button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </section>

      <AdminStorageSection
        v-else-if="activeSection === 'storage' && storageAnalytics"
        v-model:storage-range-code="storageRangeCode"
        v-model:storage-display-unit="storageDisplayUnit"
        v-model:provider-capacity-value="providerCapacityValue"
        v-model:provider-capacity-unit="providerCapacityUnit"
        :storage-analytics="storageAnalytics"
        :storage-summary-cards="storageSummaryCards"
        :storage-visual-summary="storageVisualSummary"
        :storage-breakdown-visuals="storageBreakdownVisuals"
        :transfer-visual-groups="transferVisualGroups"
        :top-storage-users="topStorageUsers"
        :storage-breakdown-cards="storageBreakdownCards"
        :transfer-breakdown-rows="transferBreakdownRows"
        :storage-users="storageUsers"
        :is-capacity-editing="isCapacityEditing"
        :is-capacity-saving="isCapacitySaving"
        @storage-range-change="handleStorageRangeChange"
        @start-capacity-editing="startCapacityEditing"
        @cancel-capacity-editing="cancelCapacityEditing"
        @save-capacity="handleCapacitySave"
      />

      <AdminPlanSection
        v-else-if="activeSection === 'plans' && dashboard"
        :plan-summary-cards="planSummaryCards"
        :payment-mix-cards="paymentMixCards"
        :plan-rows="planRows"
      />
      <section v-else-if="activeSection === 'shareAudit'" class="admin-panel">
        <div class="admin-panel__header">
          <div>
            <h2 class="admin-panel__title">공유 감사 로그</h2>
            <p class="admin-panel__description">
              공유 생성, 변경, 수락, 취소, 다운로드 링크 발급을 최근 이력으로 확인합니다.
            </p>
          </div>
          <button type="button" class="admin-page__refresh" :disabled="isShareAuditLoading" @click="loadShareAudit">
            새로고침
          </button>
        </div>

        <div v-if="isShareAuditLoading" class="admin-panel admin-panel--empty">
          공유 감사 로그를 불러오는 중입니다.
        </div>
        <div v-else-if="shareAuditRows.length === 0" class="admin-panel admin-panel--empty">
          아직 기록된 공유 감사 로그가 없습니다.
        </div>
        <div v-else class="admin-table-wrap">
          <table class="admin-table">
            <thead>
              <tr>
                <th>시간</th>
                <th>이벤트</th>
                <th>파일</th>
                <th>실행자</th>
                <th>공유자</th>
                <th>수신자</th>
                <th>권한</th>
                <th>상태</th>
                <th>정책</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in shareAuditRows" :key="item.idx">
                <td>{{ item.createdAtLabel }}</td>
                <td class="admin-table__strong">{{ item.actionLabel }}</td>
                <td>
                  <div>{{ item.fileLabel }}</div>
                  <div class="admin-table__muted">#{{ item.fileIdx || '-' }}</div>
                </td>
                <td>{{ item.actorLabel }}</td>
                <td>{{ item.ownerLabel }}</td>
                <td>{{ item.recipientLabel }}</td>
                <td>{{ item.permission || '-' }}</td>
                <td>{{ item.status || '-' }}</td>
                <td>{{ item.policyLabel }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
      <section v-else-if="activeSection === 'sessions'" class="admin-panel">
        <div class="admin-panel__header">
          <div>
            <h2 class="admin-panel__title">세션 관리</h2>
            <p class="admin-panel__description">
              현재 등록된 refresh token 세션을 확인하고 필요한 경우 개별 세션 또는 사용자 전체 세션을 강제 로그아웃합니다.
            </p>
          </div>
          <button type="button" class="admin-page__refresh" :disabled="isSessionLoading" @click="loadSessions">
            새로고침
          </button>
        </div>

        <div v-if="isSessionLoading" class="admin-panel admin-panel--empty">
          세션 목록을 불러오는 중입니다.
        </div>
        <div v-else-if="sessionRows.length === 0" class="admin-panel admin-panel--empty">
          현재 등록된 세션이 없습니다.
        </div>
        <div v-else class="admin-table-wrap">
          <table class="admin-table">
            <thead>
              <tr>
                <th>세션</th>
                <th>사용자</th>
                <th>이름</th>
                <th>계정</th>
                <th>세션 상태</th>
                <th>생성</th>
                <th>갱신</th>
                <th>만료</th>
                <th>관리</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="session in sessionRows" :key="session.sessionId">
                <td class="admin-table__strong">#{{ session.sessionId }}</td>
                <td>
                  <div>{{ session.userLabel }}</div>
                  <div class="admin-table__muted">#{{ session.userIdx || '-' }}</div>
                </td>
                <td>{{ session.name || '-' }}</td>
                <td>
                  <div>{{ session.role || '-' }}</div>
                  <div class="admin-table__muted">{{ session.accountStatus || '-' }} / {{ session.enabledLabel }}</div>
                </td>
                <td>
                  <span :class="session.expired ? 'admin-badge admin-badge--suspended' : 'admin-badge admin-badge--active'">{{ session.statusLabel }}</span>
                </td>
                <td>{{ session.createdAtLabel }}</td>
                <td>{{ session.updatedAtLabel }}</td>
                <td>{{ session.expiresAtLabel }}</td>
                <td>
                  <div class="admin-actions">
                    <button type="button" class="admin-action admin-action--suspended" :disabled="isSessionLoading" @click="handleForceLogoutSession(session)">
                      세션 종료
                    </button>
                    <button type="button" class="admin-action admin-action--banned" :disabled="isSessionLoading || !session.userIdx" @click="handleForceLogoutUserSessions(session)">
                      전체 종료
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </template>
  </div>
</template>

<style src="./AdministratorView.css"></style>
