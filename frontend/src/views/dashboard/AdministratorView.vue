<script setup>
import { computed, onMounted, ref } from "vue";
import {
  fetchAdministratorDashboard,
  fetchAdministratorShareAudit,
  fetchAdministratorSessions,
  forceLogoutAdministratorSession,
  forceLogoutAdministratorUserSessions,
  fetchAdministratorStorageAnalytics,
  updateAdministratorStorageCapacity,
  updateAdministratorUserStatus,
} from "@/api/administratorApi.js";
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

const dashboard = ref(null);
const storageAnalytics = ref(null);
const shareAuditLogs = ref([]);
const sessions = ref([]);
const isLoading = ref(false);
const isStorageLoading = ref(false);
const isShareAuditLoading = ref(false);
const isSessionLoading = ref(false);
const isUpdating = ref(false);
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
const formatBytesByUnit = (bytes, unit = storageDisplayUnit.value) =>
  formatBytesBySelectedUnit(bytes, unit);
const applyCapacityInputFromBytes = (bytes) => {
  const input = bytesToDisplayUnitInput(bytes);
  providerCapacityValue.value = input.value;
  providerCapacityUnit.value = input.unit;
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
    dashboard.value = await fetchAdministratorDashboard();
  } catch (error) {
    errorMessage.value =
      error?.response?.data?.message ||
      error?.message ||
      "관리자 대시보드를 불러오지 못했습니다.";
  } finally {
    isLoading.value = false;
  }
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
      "\uACF5\uC720 \uAC10\uC0AC \uB85C\uADF8\uB97C \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.";
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
      "\uC138\uC158 \uBAA9\uB85D\uC744 \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.";
  } finally {
    isSessionLoading.value = false;
  }
};

const handleForceLogoutSession = async (session) => {
  if (!session?.sessionId || !window.confirm("\uC774 \uC138\uC158\uC744 \uAC15\uC81C \uB85C\uADF8\uC544\uC6C3\uD560\uAE4C\uC694?")) {
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
      "\uC138\uC158\uC744 \uAC15\uC81C \uB85C\uADF8\uC544\uC6C3\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.";
  } finally {
    isSessionLoading.value = false;
  }
};

const handleForceLogoutUserSessions = async (session) => {
  if (!session?.userIdx || !window.confirm("\uC774 \uC0AC\uC6A9\uC790\uC758 \uBAA8\uB4E0 \uC138\uC158\uC744 \uAC15\uC81C \uB85C\uADF8\uC544\uC6C3\uD560\uAE4C\uC694?")) {
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
      "\uC0AC\uC6A9\uC790 \uC138\uC158\uC744 \uAC15\uC81C \uB85C\uADF8\uC544\uC6C3\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.";
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
        <p class="admin-page__eyebrow">Administrator</p>
        <h1 class="admin-page__title">관리자 페이지</h1>
        <p class="admin-page__description">
          사용자 관리, 스토리지 통계 및 분석, 플랜 및 결제 비중 통계를 각각 선택해서 확인할 수 있습니다.
        </p>
      </div>

      <button
        type="button"
        class="admin-page__refresh"
        :disabled="isLoading || isStorageLoading || isShareAuditLoading || isSessionLoading || isUpdating || isCapacitySaving"
        @click="loadAll"
      >
        새로고침
      </button>
    </div>

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
            <h2 class="admin-panel__title">&#44277;&#50976; &#44048;&#49324; &#47196;&#44536;</h2>
            <p class="admin-panel__description">
              &#44277;&#50976; &#49373;&#49457;, &#48320;&#44221;, &#49688;&#46973;, &#52712;&#49548;, &#45796;&#50868;&#47196;&#46300; &#47553;&#53356; &#48156;&#44553;&#51012; &#52572;&#44540; &#51060;&#47141;&#51004;&#47196; &#54869;&#51064;&#54633;&#45768;&#45796;.
            </p>
          </div>
          <button type="button" class="admin-page__refresh" :disabled="isShareAuditLoading" @click="loadShareAudit">
            &#49352;&#47196;&#44256;&#52840;
          </button>
        </div>

        <div v-if="isShareAuditLoading" class="admin-panel admin-panel--empty">
          &#44277;&#50976; &#44048;&#49324; &#47196;&#44536;&#47484; &#48520;&#47084;&#50724;&#45716; &#51473;&#51077;&#45768;&#45796;.
        </div>
        <div v-else-if="shareAuditRows.length === 0" class="admin-panel admin-panel--empty">
          &#50500;&#51649; &#44592;&#47197;&#46108; &#44277;&#50976; &#44048;&#49324; &#47196;&#44536;&#44032; &#50630;&#49845;&#45768;&#45796;.
        </div>
        <div v-else class="admin-table-wrap">
          <table class="admin-table">
            <thead>
              <tr>
                <th>&#49884;&#44036;</th>
                <th>&#51060;&#48292;&#53944;</th>
                <th>&#54028;&#51068;</th>
                <th>&#49892;&#54665;&#51088;</th>
                <th>&#44277;&#50976;&#51088;</th>
                <th>&#49688;&#49888;&#51088;</th>
                <th>&#44428;&#54620;</th>
                <th>&#49345;&#53468;</th>
                <th>&#51221;&#52293;</th>
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
            <h2 class="admin-panel__title">&#49464;&#49496; &#44288;&#47532;</h2>
            <p class="admin-panel__description">
              &#54788;&#51116; &#46321;&#47197;&#46108; refresh token &#49464;&#49496;&#51012; &#54869;&#51064;&#54616;&#44256; &#54596;&#50836;&#54620; &#44221;&#50864; &#44060;&#48324; &#49464;&#49496; &#46608;&#45716; &#49324;&#50857;&#51088; &#51204;&#52404; &#49464;&#49496;&#51012; &#44053;&#51228; &#47196;&#44536;&#50500;&#50883;&#54633;&#45768;&#45796;.
            </p>
          </div>
          <button type="button" class="admin-page__refresh" :disabled="isSessionLoading" @click="loadSessions">
            &#49352;&#47196;&#44256;&#52840;
          </button>
        </div>

        <div v-if="isSessionLoading" class="admin-panel admin-panel--empty">
          &#49464;&#49496; &#47785;&#47197;&#51012; &#48520;&#47084;&#50724;&#45716; &#51473;&#51077;&#45768;&#45796;.
        </div>
        <div v-else-if="sessionRows.length === 0" class="admin-panel admin-panel--empty">
          &#54788;&#51116; &#46321;&#47197;&#46108; &#49464;&#49496;&#51060; &#50630;&#49845;&#45768;&#45796;.
        </div>
        <div v-else class="admin-table-wrap">
          <table class="admin-table">
            <thead>
              <tr>
                <th>&#49464;&#49496;</th>
                <th>&#49324;&#50857;&#51088;</th>
                <th>&#51060;&#47492;</th>
                <th>&#44228;&#51221;</th>
                <th>&#49464;&#49496; &#49345;&#53468;</th>
                <th>&#49373;&#49457;</th>
                <th>&#44081;&#49888;</th>
                <th>&#47564;&#47308;</th>
                <th>&#44288;&#47532;</th>
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
                      &#49464;&#49496; &#51333;&#47308;
                    </button>
                    <button type="button" class="admin-action admin-action--banned" :disabled="isSessionLoading || !session.userIdx" @click="handleForceLogoutUserSessions(session)">
                      &#51204;&#52404; &#51333;&#47308;
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
