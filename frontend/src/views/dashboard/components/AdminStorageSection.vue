<script setup>
import { computed } from "vue";
import {
  DISPLAY_UNITS,
  STORAGE_RANGE_OPTIONS,
  VISUAL_COLORS,
} from "@/constants/adminDashboardOptions.js";
import {
  buildRingStyle,
  formatBytesAuto,
  formatBytesByUnit as formatBytesBySelectedUnit,
  formatPercent,
} from "@/utils/storageFormat.js";

const props = defineProps({
  storageAnalytics: {
    type: Object,
    required: true,
  },
  storageSummaryCards: {
    type: Array,
    default: () => [],
  },
  storageVisualSummary: {
    type: Object,
    default: null,
  },
  storageBreakdownVisuals: {
    type: Array,
    default: () => [],
  },
  transferVisualGroups: {
    type: Array,
    default: () => [],
  },
  topStorageUsers: {
    type: Array,
    default: () => [],
  },
  storageBreakdownCards: {
    type: Array,
    default: () => [],
  },
  transferBreakdownRows: {
    type: Array,
    default: () => [],
  },
  storageUsers: {
    type: Array,
    default: () => [],
  },
  storageRangeCode: {
    type: String,
    required: true,
  },
  storageDisplayUnit: {
    type: String,
    required: true,
  },
  isCapacityEditing: {
    type: Boolean,
    default: false,
  },
  isCapacitySaving: {
    type: Boolean,
    default: false,
  },
  providerCapacityValue: {
    type: [String, Number],
    default: "",
  },
  providerCapacityUnit: {
    type: String,
    default: "GB",
  },
});

const emit = defineEmits([
  "update:storageRangeCode",
  "update:storageDisplayUnit",
  "update:providerCapacityValue",
  "update:providerCapacityUnit",
  "storage-range-change",
  "start-capacity-editing",
  "cancel-capacity-editing",
  "save-capacity",
]);

const storageRangeCodeModel = computed({
  get: () => props.storageRangeCode,
  set: (value) => emit("update:storageRangeCode", value),
});

const storageDisplayUnitModel = computed({
  get: () => props.storageDisplayUnit,
  set: (value) => emit("update:storageDisplayUnit", value),
});

const providerCapacityValueModel = computed({
  get: () => props.providerCapacityValue,
  set: (value) => emit("update:providerCapacityValue", value),
});

const providerCapacityUnitModel = computed({
  get: () => props.providerCapacityUnit,
  set: (value) => emit("update:providerCapacityUnit", value),
});

const formatBytesByUnit = (bytes, unit = props.storageDisplayUnit) =>
  formatBytesBySelectedUnit(bytes, unit);

const notifyStorageRangeChange = () => {
  emit("storage-range-change");
};

const startCapacityEditing = () => {
  emit("start-capacity-editing");
};

const cancelCapacityEditing = () => {
  emit("cancel-capacity-editing");
};

const saveCapacity = () => {
  emit("save-capacity");
};
</script>

<template>
  <section class="admin-panel">
    <div class="admin-panel__header">
      <div>
        <h2 class="admin-panel__title">스토리지 통계 및 분석</h2>
        <p class="admin-panel__description">
          MinIO 업로드 데이터와 백엔드 추적 다운로드 데이터를 기준으로 실제 스토리지 사용량과 입출력량을 집계합니다.
        </p>
      </div>

      <div class="admin-toolbar admin-toolbar--compact">
        <label class="admin-field">
          <span class="admin-field__label">집계 기간</span>
          <select v-model="storageRangeCodeModel" class="admin-select" @change="notifyStorageRangeChange">
            <option v-for="range in STORAGE_RANGE_OPTIONS" :key="range.value" :value="range.value">{{ range.label }}</option>
          </select>
        </label>
        <label class="admin-field">
          <span class="admin-field__label">표시 단위</span>
          <select v-model="storageDisplayUnitModel" class="admin-select">
            <option v-for="unit in DISPLAY_UNITS" :key="unit.value" :value="unit.value">{{ unit.label }}</option>
          </select>
        </label>
      </div>
    </div>

    <div class="admin-storage-grid">
      <article v-for="card in storageSummaryCards" :key="card.label" class="admin-card">
        <p class="admin-card__label">{{ card.label }}</p>
        <p class="admin-card__value">{{ card.value }}</p>
      </article>
    </div>

    <div v-if="storageVisualSummary" class="admin-visual-grid">
      <article class="admin-panel admin-panel--inset admin-visual-card">
        <div class="admin-panel__header">
          <div>
            <h3 class="admin-panel__title">가용 가능한 총량</h3>
            <p class="admin-panel__description">
              시스템에서 설정해서 가용가능한 총량을 정리.
            </p>
          </div>
        </div>

        <div class="admin-visual-card__body admin-visual-card__body--split">
          <div class="admin-visual-ring" :style="buildRingStyle(storageVisualSummary.providerUsagePercent, VISUAL_COLORS[0])">
            <div class="admin-visual-ring__inner">
              <span class="admin-visual-ring__value">{{ formatPercent(storageVisualSummary.providerUsagePercent) }}</span>
              <span class="admin-visual-ring__label">used</span>
            </div>
          </div>

          <div class="admin-visual-stats">
            <div class="admin-visual-stat">
              <span class="admin-visual-stat__label">Used</span>
              <span class="admin-visual-stat__value">{{ storageVisualSummary.providerUsedLabel }}</span>
            </div>
            <div class="admin-visual-stat">
              <span class="admin-visual-stat__label">Remaining</span>
              <span class="admin-visual-stat__value">{{ storageVisualSummary.providerRemainingLabel }}</span>
            </div>
            <div class="admin-visual-stat">
              <span class="admin-visual-stat__label">Allocated quota</span>
              <span class="admin-visual-stat__value">{{ storageVisualSummary.allocatedQuotaLabel }}</span>
            </div>
          </div>
        </div>

        <div class="admin-visual-meter">
          <div class="admin-visual-meter__meta">
            <span>실제 사용 총량</span>
            <span>{{ storageVisualSummary.providerUsedLabel }} / {{ storageVisualSummary.providerCapacityLabel }}</span>
          </div>
          <div class="admin-progress admin-progress--thick">
            <div class="admin-progress__bar" :style="{ width: `${storageVisualSummary.providerUsagePercent}%` }"></div>
          </div>
        </div>

        <div class="admin-visual-meter">
          <div class="admin-visual-meter__meta">
            <span>할당된 총량</span>
            <span>{{ formatPercent(storageVisualSummary.allocationPercent) }}</span>
          </div>
          <div class="admin-progress admin-progress--thick admin-progress--teal">
            <div class="admin-progress__bar" :style="{ width: `${storageVisualSummary.allocationPercent}%` }"></div>
          </div>
        </div>
      </article>

      <article class="admin-panel admin-panel--inset admin-visual-card">
        <div class="admin-panel__header">
          <div>
            <h3 class="admin-panel__title">저장 장소 방식</h3>
            <p class="admin-panel__description">
              현재 저장된 데이터의 구분
            </p>
          </div>
        </div>

        <div class="admin-visual-list">
          <div v-for="item in storageBreakdownVisuals" :key="item.source" class="admin-visual-row">
            <div class="admin-visual-row__meta">
              <div>
                <p class="admin-visual-row__label">{{ item.label }}</p>
                <p class="admin-visual-row__sub">{{ item.formattedBytes }}</p>
              </div>
              <span class="admin-visual-row__percent">{{ formatPercent(item.sharePercent) }}</span>
            </div>
            <div class="admin-visual-track">
              <div class="admin-visual-track__bar" :style="{ width: `${item.barWidth}%`, background: item.color }"></div>
            </div>
          </div>
        </div>
      </article>

      <article class="admin-panel admin-panel--inset admin-visual-card">
        <div class="admin-panel__header">
          <div>
            <h3 class="admin-panel__title">데아터 트래픽 흐름</h3>
            <p class="admin-panel__description">
              선택한 기간의 입력 및 출력 볼륨을 시각적으로 비교할 수 있습니다.
            </p>
          </div>
        </div>

        <div class="admin-visual-card__body admin-visual-card__body--split">
          <div class="admin-visual-ring" :style="buildRingStyle(storageVisualSummary.ingressPercent, VISUAL_COLORS[1])">
            <div class="admin-visual-ring__inner">
              <span class="admin-visual-ring__value">{{ formatPercent(storageVisualSummary.ingressPercent) }}</span>
              <span class="admin-visual-ring__label">ingress</span>
            </div>
          </div>

          <div class="admin-visual-stats">
            <div class="admin-visual-stat">
              <span class="admin-visual-stat__label">Ingress</span>
              <span class="admin-visual-stat__value">{{ storageVisualSummary.ingressLabel }}</span>
            </div>
            <div class="admin-visual-stat">
              <span class="admin-visual-stat__label">Egress</span>
              <span class="admin-visual-stat__value">{{ storageVisualSummary.egressLabel }}</span>
            </div>
            <div class="admin-visual-stat">
              <span class="admin-visual-stat__label">Completed upload</span>
              <span class="admin-visual-stat__value">{{ storageVisualSummary.completedIngressLabel }}</span>
            </div>
            <div class="admin-visual-stat">
              <span class="admin-visual-stat__label">Canceled upload</span>
              <span class="admin-visual-stat__value">{{ storageVisualSummary.canceledIngressLabel }}</span>
            </div>
          </div>
        </div>

        <div class="admin-visual-meter">
          <div class="admin-visual-meter__meta">
            <span>Completed ingress share</span>
            <span>{{ formatPercent(storageVisualSummary.completedIngressPercent) }}</span>
          </div>
          <div class="admin-progress admin-progress--thick">
            <div class="admin-progress__bar" :style="{ width: `${storageVisualSummary.completedIngressPercent}%` }"></div>
          </div>
        </div>

        <div class="admin-visual-meter">
          <div class="admin-visual-meter__meta">
            <span>Canceled ingress share</span>
            <span>{{ formatPercent(storageVisualSummary.canceledIngressPercent) }}</span>
          </div>
          <div class="admin-progress admin-progress--thick admin-progress--warm">
            <div class="admin-progress__bar" :style="{ width: `${storageVisualSummary.canceledIngressPercent}%` }"></div>
          </div>
        </div>

        <div class="admin-visual-group-list">
          <div v-for="group in transferVisualGroups" :key="group.direction" class="admin-visual-group">
            <div class="admin-visual-group__header">
              <span>{{ group.direction }}</span>
              <span>{{ group.totalLabel }}</span>
            </div>
            <div class="admin-visual-list admin-visual-list--compact">
              <div v-for="item in group.items" :key="`${group.direction}-${item.source}-${item.status}`" class="admin-visual-row">
                <div class="admin-visual-row__meta">
                  <div>
                    <p class="admin-visual-row__label">{{ item.label }}</p>
                    <p class="admin-visual-row__sub">{{ item.status }} · {{ item.formattedBytes }}</p>
                  </div>
                  <span class="admin-visual-row__percent">{{ formatPercent(item.sharePercent) }}</span>
                </div>
                <div class="admin-visual-track">
                  <div class="admin-visual-track__bar" :style="{ width: `${item.barWidth}%`, background: item.color }"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </article>

      <article class="admin-panel admin-panel--inset admin-visual-card">
        <div class="admin-panel__header">
          <div>
            <h3 class="admin-panel__title">최고 사용 유저</h3>
            <p class="admin-panel__description">
              가장 큰 사용량을 가진 유저를 확인
            </p>
          </div>
        </div>

        <div class="admin-visual-list">
          <div v-for="user in topStorageUsers" :key="user.idx" class="admin-visual-row">
            <div class="admin-visual-row__meta">
              <div>
                <p class="admin-visual-row__label">{{ user.name || user.id }}</p>
                <p class="admin-visual-row__sub">{{ user.storedLabel }} · traffic {{ user.combinedTrafficLabel }}</p>
              </div>
              <span class="admin-visual-row__percent">{{ formatPercent(user.sharePercent) }}</span>
            </div>
            <div class="admin-visual-track">
              <div class="admin-visual-track__bar" :style="{ width: `${user.barWidth}%`, background: user.color }"></div>
            </div>
          </div>
        </div>
      </article>
    </div>

    <div class="admin-capacity">
      <div>
        <h3 class="admin-subtitle">서비스 총 용량 설정</h3>
        <p class="admin-subtext">
          기본값은 50TB이며, 이 값을 기준으로 현재 시스템의 전체 사용량과 잔여 용량을 계산합니다.
        </p>
      </div>

      <div v-if="!isCapacityEditing" class="admin-capacity__readonly">
        <div class="admin-capacity__value">
          {{ formatBytesAuto(storageAnalytics.summary?.providerCapacityBytes) }}
        </div>
        <button type="button" class="admin-page__refresh" @click="startCapacityEditing">
          수정하기
        </button>
      </div>

      <div v-else class="admin-capacity__controls">
        <input
          v-model="providerCapacityValueModel"
          type="number"
          min="1"
          step="0.01"
          class="admin-input admin-input--narrow"
        />
        <select v-model="providerCapacityUnitModel" class="admin-select admin-select--narrow">
          <option v-for="unit in DISPLAY_UNITS.slice(1)" :key="unit.value" :value="unit.value">{{ unit.label }}</option>
        </select>
        <button type="button" class="admin-page__refresh" :disabled="isCapacitySaving" @click="saveCapacity">
          {{ isCapacitySaving ? "저장 중..." : "저장" }}
        </button>
        <button type="button" class="admin-page__secondary" :disabled="isCapacitySaving" @click="cancelCapacityEditing">
          취소
        </button>
      </div>
    </div>

    <div v-if="storageAnalytics.integrity" class="admin-integrity">
      <div
        class="admin-integrity__status"
        :class="storageAnalytics.integrity.healthy ? 'admin-integrity__status--healthy' : 'admin-integrity__status--warning'"
      >
        {{ storageAnalytics.integrity.healthy ? "무결성 정상" : "무결성 점검 필요" }}
      </div>
      <p class="admin-subtext">
        대기 중인 드라이브 예약 용량: {{ formatBytesByUnit(storageAnalytics.integrity.pendingDriveReservationBytes) }}
      </p>
      <ul v-if="storageAnalytics.integrity.issues?.length" class="admin-integrity__list">
        <li v-for="issue in storageAnalytics.integrity.issues" :key="issue">{{ issue }}</li>
      </ul>
      <p v-else class="admin-subtext">
        완료 업로드는 MinIO 실제 객체 크기, 취소 및 만료 업로드는 삭제 직전 실제 남은 크기, 다운로드는 백엔드 스트리밍 전송 바이트 기준으로 집계됩니다.
      </p>
    </div>

    <div class="admin-layout admin-layout--three">
      <div class="admin-panel admin-panel--inset">
        <div class="admin-panel__header">
          <div>
            <h3 class="admin-panel__title">현재 저장 데이터 분포</h3>
            <p class="admin-panel__description">
              드라이브, 워크스페이스 첨부, 채팅 첨부 기준으로 현재 보관 중인 데이터입니다.
            </p>
          </div>
        </div>

        <div class="admin-plan-list">
          <article v-for="item in storageBreakdownCards" :key="item.source" class="admin-plan-card">
            <div class="admin-plan-card__top">
              <div>
                <p class="admin-plan-card__label">{{ item.label }}</p>
                <p class="admin-plan-card__sub">{{ item.source }}</p>
              </div>
              <p class="admin-plan-card__usage">{{ item.formattedBytes }}</p>
            </div>
          </article>
        </div>
      </div>

      <div class="admin-panel admin-panel--inset admin-panel--span-2">
        <div class="admin-panel__header">
          <div>
            <h3 class="admin-panel__title">데이터 입출력 집계</h3>
            <p class="admin-panel__description">
              업로드 완료, 업로드 취소, 다운로드 전송량을 이벤트 단위로 집계한 표입니다.
            </p>
          </div>
        </div>

        <div class="admin-table-wrap">
          <table class="admin-table admin-table--compact">
            <thead>
              <tr>
                <th>방향</th>
                <th>구분</th>
                <th>상태</th>
                <th>이벤트 수</th>
                <th>데이터량</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in transferBreakdownRows" :key="`${row.direction}-${row.source}-${row.status}`">
                <td>{{ row.direction }}</td>
                <td>{{ row.label }}</td>
                <td>{{ row.status }}</td>
                <td>{{ row.eventCount }}</td>
                <td class="admin-table__strong">{{ row.formattedBytes }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <div class="admin-panel admin-panel--inset">
      <div class="admin-panel__header">
        <div>
          <h3 class="admin-panel__title">사용자별 스토리지 / 입출력 통계</h3>
          <p class="admin-panel__description">
            관리자 제외 사용자 기준으로 할당량, 현재 저장량, 총 입력량, 총 출력량을 확인합니다.
          </p>
        </div>
      </div>

      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead>
            <tr>
              <th>이메일</th>
              <th>이름</th>
              <th>플랜</th>
              <th>할당량</th>
              <th>현재 저장량</th>
              <th>총 입력량</th>
              <th>완료 업로드</th>
              <th>취소/정리 업로드</th>
              <th>총 출력량</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="user in storageUsers" :key="user.idx">
              <td class="admin-table__strong">{{ user.id }}</td>
              <td>{{ user.name || "-" }}</td>
              <td>{{ user.planLabel }}</td>
              <td>{{ user.quotaLabel }}</td>
              <td>{{ user.storedLabel }}</td>
              <td>{{ user.ingressLabel }}</td>
              <td>{{ user.completedIngressLabel }}</td>
              <td>{{ user.canceledIngressLabel }}</td>
              <td>{{ user.egressLabel }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>
</template>
