<script setup>
import { computed, onMounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { useFileStore } from "@/stores/useFileStore.js";
import { fetchCapacityShareOverview, fetchSharedStorages } from "@/api/storageShareApi.js";

const route = useRoute();
const fileStore = useFileStore();

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

const summary = computed(() => fileStore.storageSummary);
const sortedCategories = computed(() => {
  return [...(summary.value?.categories || [])]
    .filter((category) => Number(category?.sizeBytes || 0) > 0)
    .sort((left, right) => Number(right?.sizeBytes || 0) - Number(left?.sizeBytes || 0));
});
const usageWidth = computed(() => {
  return `${Math.min(100, Math.max(0, Number(summary.value?.usagePercent || 0)))}%`;
});

const capacityOverview = ref(null);
const sharedStorages = ref([]);

const activeStoragesCount = computed(
  () => sharedStorages.value.filter((item) => item?.myStatus === "ACTIVE").length,
);
const invitedStoragesCount = computed(
  () => sharedStorages.value.filter((item) => item?.myStatus === "INVITED").length,
);

const openShareModal = (page = "spaces") => {
  window.dispatchEvent(
    new CustomEvent("open-storage-share-modal", {
      detail: { page },
    }),
  );
};

const refreshSummary = async () => {
  const [, capRes, spacesRes] = await Promise.all([
    fileStore.fetchStorageSummary().catch(() => {}),
    fetchCapacityShareOverview().catch(() => null),
    fetchSharedStorages().catch(() => []),
  ]);
  capacityOverview.value = capRes;
  sharedStorages.value = Array.isArray(spacesRes) ? spacesRes : [];
};

watch(
  () => route.query.tab,
  (tab) => {
    if (tab === "shared-spaces") {
      openShareModal("spaces");
    }
  },
  { immediate: true },
);

onMounted(() => {
  refreshSummary();
});
</script>

<template>
  <div class="max-w-7xl space-y-6 pb-12">
    <!-- 상단 헤더 & 모달 빠른 실행 버튼 -->
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h2 class="text-2xl font-black text-gray-900">저장용량 현황</h2>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <button
          type="button"
          class="inline-flex items-center gap-1.5 rounded-full bg-blue-600 px-4 py-2 text-xs font-extrabold text-white shadow-sm transition hover:bg-blue-700"
          @click="openShareModal('spaces')"
        >
          <i class="fa-solid fa-folder-tree"></i>
          <span>공유 저장소 모달 열기 ({{ activeStoragesCount }})</span>
          <span
            v-if="invitedStoragesCount > 0"
            class="rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-black text-white"
          >
            {{ invitedStoragesCount }}
          </span>
        </button>

        <button
          type="button"
          class="inline-flex items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 px-4 py-2 text-xs font-extrabold text-indigo-700 transition hover:bg-indigo-100"
          @click="openShareModal('create-space')"
        >
          <i class="fa-solid fa-plus"></i>
          <span>공유 폴더 만들기</span>
        </button>

        <button
          type="button"
          class="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-4 py-2 text-xs font-bold text-gray-700 transition hover:bg-gray-50"
          @click="openShareModal('grant-share')"
        >
          <i class="fa-solid fa-hand-holding-heart text-blue-600"></i>
          <span>용량 공유 · 대여하기</span>
        </button>

        <button
          type="button"
          class="rounded-full border border-gray-200 bg-white px-4 py-2 text-xs font-bold text-gray-600 transition hover:bg-gray-50"
          @click="refreshSummary"
        >
          새로고침
        </button>
      </div>
    </div>

    <!-- 전체 용량 요약 카드 -->
    <div v-if="summary" class="rounded-3xl border border-gray-200 bg-white p-7 shadow-sm">
      <div class="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p class="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">현재 플랜 및 유효 할당량</p>
          <h3 class="mt-1.5 text-2xl font-black text-gray-900">{{ summary.planLabel }}</h3>
        </div>

        <div class="text-right">
          <p class="text-xs font-semibold text-gray-400">내 개인 드라이브 사용량 / 유효 총 용량</p>
          <p class="text-3xl font-black text-gray-900">
            {{ formatBytes(summary.usedBytes) }}
            <span class="text-lg font-bold text-gray-500">
              / {{ formatBytes(summary.quotaBytes) }} ({{ summary.usagePercent }}%)
            </span>
          </p>
        </div>
      </div>

      <div class="mt-5 overflow-hidden rounded-full bg-slate-100">
        <div
          class="h-3.5 rounded-full bg-gradient-to-r from-blue-600 via-sky-500 to-indigo-500 transition-all duration-300"
          :style="{ width: usageWidth }"
        ></div>
      </div>

      <!-- 용량 가감 상세 내역 (클릭 시 해당 모달 페이지로 바로 이동) -->
      <div class="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5">
          <p class="text-xs font-semibold text-gray-500">기본 + 추가 구매 용량</p>
          <p class="mt-1.5 text-lg font-black text-gray-900">
            {{ formatBytes(capacityOverview?.ownPlanQuotaBytes ?? summary.ownQuotaBytes ?? summary.quotaBytes) }}
          </p>
        </div>

        <button
          type="button"
          class="rounded-2xl border border-emerald-200 bg-emerald-50/60 px-4 py-3.5 text-left transition hover:bg-emerald-100/70"
          @click="openShareModal('grant-status')"
        >
          <p class="text-xs font-semibold text-emerald-700">공유/대여 받은 용량 (+)</p>
          <p class="mt-1.5 text-lg font-black text-emerald-700">
            + {{ formatBytes(capacityOverview?.grantedInBytes ?? summary.grantedInBytes ?? 0) }}
          </p>
        </button>

        <button
          type="button"
          class="rounded-2xl border border-amber-200 bg-amber-50/60 px-4 py-3.5 text-left transition hover:bg-amber-100/70"
          @click="openShareModal('grant-status')"
        >
          <p class="text-xs font-semibold text-amber-700">타인에게 공유 중인 용량 (-)</p>
          <p class="mt-1.5 text-lg font-black text-amber-700">
            - {{ formatBytes(capacityOverview?.grantedOutBytes ?? summary.grantedOutBytes ?? 0) }}
          </p>
        </button>

        <button
          type="button"
          class="rounded-2xl border border-indigo-200 bg-indigo-50/60 px-4 py-3.5 text-left transition hover:bg-indigo-100/70"
          @click="openShareModal('spaces')"
        >
          <p class="text-xs font-semibold text-indigo-700">공유 폴더 기여 용량 (-)</p>
          <p class="mt-1.5 text-lg font-black text-indigo-700">
            - {{ formatBytes(capacityOverview?.sharedStorageContributionBytes ?? summary.sharedStorageContributionBytes ?? 0) }}
          </p>
        </button>

        <button
          type="button"
          class="rounded-2xl border border-blue-200 bg-blue-50/70 px-4 py-3.5 text-left transition hover:bg-blue-100/70"
          @click="openShareModal('grant-share')"
        >
          <p class="text-xs font-semibold text-blue-700">공유 가능 여유 용량</p>
          <p class="mt-1.5 text-lg font-black text-blue-700">
            {{ formatBytes(capacityOverview?.availableToShareBytes ?? summary.remainingBytes ?? 0) }}
          </p>
        </button>
      </div>
    </div>

    <!-- 카테고리별 통계 & 파일 상태 통계 -->
    <template v-if="summary">
      <div class="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <section class="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          <h3 class="text-base font-black text-gray-900">개인 드라이브 카테고리별 통계</h3>
          <p class="mt-1 mb-4 text-xs text-gray-500">활성 상태 파일 기준 분류입니다.</p>

          <div v-if="sortedCategories.length > 0" class="space-y-3">
            <div
              v-for="category in sortedCategories"
              :key="category.categoryKey"
              class="rounded-2xl border border-gray-100 bg-slate-50 px-4 py-3.5"
            >
              <div class="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p class="text-sm font-semibold text-gray-900">{{ category.categoryLabel }}</p>
                  <p class="mt-0.5 text-xs text-gray-500">{{ category.fileCount }}개 파일</p>
                </div>
                <div class="text-right">
                  <p class="text-sm font-bold text-gray-900">{{ formatBytes(category.sizeBytes) }}</p>
                  <p class="mt-0.5 text-xs text-gray-500">활성 파일 중 {{ category.usagePercent }}%</p>
                </div>
              </div>
            </div>
          </div>
          <div
            v-else
            class="rounded-2xl border border-dashed border-gray-200 bg-slate-50 px-4 py-10 text-center text-xs text-gray-500"
          >
            집계할 활성 파일이 없습니다.
          </div>
        </section>

        <section class="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          <h3 class="text-base font-black text-gray-900">파일 상태 통계</h3>
          <div class="mt-4 grid gap-3 sm:grid-cols-2">
            <div class="rounded-2xl border border-gray-200 px-4 py-3.5">
              <p class="text-xs font-semibold text-gray-400">활성 파일</p>
              <p class="mt-1.5 text-xl font-bold text-gray-900">{{ summary.activeFileCount }}</p>
            </div>
            <div class="rounded-2xl border border-gray-200 px-4 py-3.5">
              <p class="text-xs font-semibold text-gray-400">휴지통 파일</p>
              <p class="mt-1.5 text-xl font-bold text-gray-900">{{ summary.trashFileCount }}</p>
            </div>
            <div class="rounded-2xl border border-gray-200 px-4 py-3.5">
              <p class="text-xs font-semibold text-gray-400">활성 폴더</p>
              <p class="mt-1.5 text-xl font-bold text-gray-900">{{ summary.activeFolderCount }}</p>
            </div>
            <div class="rounded-2xl border border-gray-200 px-4 py-3.5">
              <p class="text-xs font-semibold text-gray-400">휴지통 폴더</p>
              <p class="mt-1.5 text-xl font-bold text-gray-900">{{ summary.trashFolderCount }}</p>
            </div>
          </div>
        </section>
      </div>
    </template>
  </div>
</template>
