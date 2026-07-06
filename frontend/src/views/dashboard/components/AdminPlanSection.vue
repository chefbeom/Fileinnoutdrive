<template>
  <section class="admin-layout admin-layout--stack">
    <section class="admin-summary-grid">
      <article v-for="card in planSummaryCards" :key="card.label" class="admin-card">
        <p class="admin-card__label">{{ card.label }}</p>
        <p class="admin-card__value">{{ card.value }}</p>
      </article>
    </section>

    <section class="admin-layout">
      <div class="admin-panel">
        <div class="admin-panel__header">
          <div>
            <h2 class="admin-panel__title">플랜 비중</h2>
            <p class="admin-panel__description">
              무료와 유료 사용자 비중, 사용량 분포를 한눈에 확인할 수 있습니다.
            </p>
          </div>
        </div>

        <div class="admin-plan-list">
          <article v-for="item in paymentMixCards" :key="item.label" class="admin-plan-card">
            <div class="admin-plan-card__top">
              <div>
                <p class="admin-plan-card__label">{{ item.label }}</p>
                <p class="admin-plan-card__sub">{{ item.subLabel }}</p>
              </div>
              <p class="admin-plan-card__usage">{{ item.usageLabel }}</p>
            </div>
            <div class="admin-plan-card__stats">
              <span>사용량 {{ item.detail }}</span>
            </div>
          </article>
        </div>
      </div>

      <div class="admin-panel">
        <div class="admin-panel__header">
          <div>
            <h2 class="admin-panel__title">플랜별 사용 현황</h2>
            <p class="admin-panel__description">
              플랜별 사용자 수와 할당량 대비 사용률을 카드 형태로 확인합니다.
            </p>
          </div>
        </div>

        <div class="admin-plan-list">
          <article v-for="plan in planRows" :key="plan.planCode" class="admin-plan-card">
            <div class="admin-plan-card__top">
              <div>
                <p class="admin-plan-card__label">{{ plan.planLabel }}</p>
                <p class="admin-plan-card__sub">{{ plan.userCount }}명 / 사용자 비중 {{ plan.userPercentLabel }}</p>
              </div>
              <p class="admin-plan-card__usage">{{ plan.usagePercentLabel }}</p>
            </div>

            <div class="admin-progress">
              <div class="admin-progress__bar" :style="{ width: `${Math.min(100, Number(plan.usagePercent || 0))}%` }"></div>
            </div>

            <div class="admin-plan-card__stats">
              <span>{{ plan.usedBytesLabel }}</span>
              <span>/ {{ plan.quotaBytesLabel }}</span>
            </div>
          </article>
        </div>
      </div>
    </section>

    <section class="admin-panel">
      <div class="admin-panel__header">
        <div>
          <h2 class="admin-panel__title">플랜 / 결제 비중 상세 표</h2>
          <p class="admin-panel__description">
            무료와 유료 플랜 기준으로 사용자 비중과 용량 사용률을 상세하게 비교합니다.
          </p>
        </div>
      </div>

      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead>
            <tr>
              <th>플랜 코드</th>
              <th>플랜명</th>
              <th>구분</th>
              <th>사용자 수</th>
              <th>사용자 비중</th>
              <th>사용량</th>
              <th>할당량</th>
              <th>사용률</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="plan in planRows" :key="plan.planCode">
              <td class="admin-table__strong">{{ plan.planCode }}</td>
              <td>{{ plan.planLabel }}</td>
              <td>{{ plan.planTypeLabel }}</td>
              <td>{{ plan.userCount }}</td>
              <td>{{ plan.userPercentLabel }}</td>
              <td>{{ plan.usedBytesLabel }}</td>
              <td>{{ plan.quotaBytesLabel }}</td>
              <td>{{ plan.usagePercentLabel }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </section>
</template>

<script setup>
defineProps({
  planSummaryCards: {
    type: Array,
    default: () => [],
  },
  paymentMixCards: {
    type: Array,
    default: () => [],
  },
  planRows: {
    type: Array,
    default: () => [],
  },
})
</script>

