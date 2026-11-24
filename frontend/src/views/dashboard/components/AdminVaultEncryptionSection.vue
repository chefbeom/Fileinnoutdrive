<template>
  <section class="admin-layout admin-layout--stack">
    <section class="admin-summary-grid">
      <article v-for="card in summaryCards" :key="card.label" class="admin-card">
        <p class="admin-card__label">{{ card.label }}</p>
        <p class="admin-card__value">{{ card.value }}</p>
      </article>
    </section>

    <section class="admin-panel admin-panel--vault-migration">
      <div class="admin-panel__header">
        <div>
          <div class="admin-login-setting__title-row">
            <h2 class="admin-panel__title">비밀 공간(Vault) 기존 파일 일괄 암호화</h2>
            <span
              class="admin-badge"
              :class="jobRunning ? 'admin-badge--suspended' : plaintextCount === 0 ? 'admin-badge--active' : 'admin-badge--suspended'"
            >
              {{
                jobRunning
                  ? "일괄 암호화 진행 중"
                  : plaintextCount === 0
                    ? "전체 암호화 완료"
                    : `미암호화 ${plaintextCount}개 대기 중`
              }}
            </span>
          </div>
          <p class="admin-panel__description">
            기존에 비밀 공간(VAULT)에 평문 상태로 저장된 활성 파일을 서버 측 청크 AES-256-GCM(.enc) 방식으로 일괄 변환하고, DB 커밋 완료 후 기존 평문·평문 썸네일(.jpg)을 안전 삭제합니다. (일반 드라이브 및 휴지통 제외)
          </p>
        </div>

        <div class="admin-actions">
          <button
            type="button"
            class="admin-page__refresh"
            :disabled="isLoading || isStarting"
            @click="$emit('refresh')"
          >
            {{ isLoading ? "조회 중..." : "상태 새로고침" }}
          </button>
          <button
            type="button"
            class="admin-vault-btn"
            :disabled="isStarting || jobRunning || plaintextCount === 0"
            @click="$emit('start-migration', null)"
          >
            {{ isStarting ? "작업 시작 중..." : jobRunning ? "일괄 암호화 진행 중..." : "전체 미암호화 파일 일괄 암호화" }}
          </button>
        </div>
      </div>

      <div v-if="showJobProgress" class="admin-vault-job">
        <div class="admin-visual-meter__meta">
          <span>
            {{
              jobRunning
                ? `진행 중 (${job.processedCount} / ${job.scannedCount}개)${job.currentFileName ? ` · 현재 파일: ${job.currentFileName}` : ""}`
                : `최근 실행 완료 (${job.processedCount} / ${job.scannedCount}개 처리)`
            }}
          </span>
          <strong>{{ jobProgressPercent }}%</strong>
        </div>

        <div class="admin-progress admin-progress--thick admin-progress--teal">
          <div class="admin-progress__bar" :style="{ width: `${jobProgressPercent}%` }"></div>
        </div>

        <div class="admin-vault-job__stats">
          <span>성공: <strong>{{ job.migratedCount }}</strong>개</span>
          <span>건너뜀: <strong>{{ job.skippedCount }}</strong>개</span>
          <span>실패: <strong>{{ job.failedCount }}</strong>개</span>
          <span v-if="job.targetUserIdx != null">대상 사용자: #{{ job.targetUserIdx }}</span>
          <span v-else>대상: 전체 사용자</span>
          <span v-if="finishedAtLabel && !jobRunning">완료 시각: {{ finishedAtLabel }}</span>
        </div>

        <div v-if="job.lastError" class="admin-alert" style="margin-top: 0.75rem;">
          {{ job.lastError }}
        </div>

        <div v-if="Array.isArray(job.recentFailures) && job.recentFailures.length > 0" class="admin-integrity">
          <span class="admin-integrity__status admin-integrity__status--warning">
            실패한 파일 ({{ job.recentFailures.length }}건)
          </span>
          <ul class="admin-integrity__list">
            <li v-for="failure in job.recentFailures" :key="`${failure.fileIdx}-${failure.userIdx}`">
              #{{ failure.fileIdx }} (사용자 #{{ failure.userIdx }}) {{ failure.fileName || "-" }} — {{ failure.reason }}
            </li>
          </ul>
        </div>
      </div>
    </section>

    <section class="admin-panel">
      <div class="admin-panel__header">
        <div>
          <h2 class="admin-panel__title">사용자별 비밀 공간 암호화 현황</h2>
          <p class="admin-panel__description">
            비밀 공간 파일 보유 사용자별 암호화 상태와 잔여 평문 파일 수를 확인하고 필요 시 특정 사용자만 선택해 일괄 암호화할 수 있습니다.
          </p>
        </div>
      </div>

      <div v-if="userRows.length === 0" class="admin-panel admin-panel--empty">
        활성 비밀 공간 파일이 있는 사용자가 없습니다.
      </div>
      <div v-else class="admin-table-wrap">
        <table class="admin-table admin-table--compact">
          <thead>
            <tr>
              <th>이메일</th>
              <th>이름</th>
              <th>전체 파일</th>
              <th>암호화 완료</th>
              <th>미암호화 평문</th>
              <th>미암호화 용량</th>
              <th>진행률</th>
              <th>상태</th>
              <th>관리</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in userRows" :key="row.userIdx">
              <td class="admin-table__strong">{{ row.userLabel }}</td>
              <td>{{ row.name || "-" }}</td>
              <td>{{ row.totalVaultFiles }}개</td>
              <td>{{ row.encryptedVaultFiles }}개</td>
              <td>{{ row.plaintextVaultFiles }}개</td>
              <td>{{ row.plaintextBytesLabel }}</td>
              <td>
                <div class="admin-progress">
                  <div class="admin-progress__bar" :style="{ width: `${row.progressPercent}%` }"></div>
                </div>
                <div class="admin-table__muted">{{ row.progressLabel }}</div>
              </td>
              <td>
                <span :class="row.completed ? 'admin-badge admin-badge--active' : 'admin-badge admin-badge--suspended'">
                  {{ row.completed ? "암호화 완료" : "대기 중" }}
                </span>
              </td>
              <td>
                <button
                  type="button"
                  class="admin-action admin-action--active"
                  :disabled="isStarting || jobRunning || row.plaintextVaultFiles === 0"
                  @click="$emit('start-migration', row.userIdx)"
                >
                  {{ row.plaintextVaultFiles === 0 ? "완료됨" : "이 사용자 암호화" }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </section>
</template>

<script setup>
import { computed } from "vue"
import { formatAdminDateTime } from "../services/adminDashboardFormat.js"
import {
  buildVaultEncryptionSummaryCards,
  buildVaultEncryptionUserRows,
} from "../services/adminDashboardViewModels.js"

const props = defineProps({
  status: {
    type: Object,
    default: null,
  },
  isLoading: {
    type: Boolean,
    default: false,
  },
  isStarting: {
    type: Boolean,
    default: false,
  },
})

defineEmits(["refresh", "start-migration"])

const summaryCards = computed(() => buildVaultEncryptionSummaryCards(props.status))
const userRows = computed(() => buildVaultEncryptionUserRows(props.status?.users))
const plaintextCount = computed(() => Number(props.status?.plaintextVaultFiles || 0))
const job = computed(() => props.status?.job || null)
const jobRunning = computed(() => Boolean(job.value?.running))
const showJobProgress = computed(() => Boolean(job.value && (job.value.running || job.value.jobId)))
const jobProgressPercent = computed(() => {
  const scanned = Number(job.value?.scannedCount || 0)
  const processed = Number(job.value?.processedCount || 0)
  if (scanned <= 0) {
    return job.value?.finishedAt ? 100 : 0
  }
  return Math.min(100, Math.round((processed * 100) / scanned))
})
const finishedAtLabel = computed(() => (
  job.value?.finishedAt ? formatAdminDateTime(job.value.finishedAt) : ""
))
</script>
