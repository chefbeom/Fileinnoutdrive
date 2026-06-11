<script setup>
import { computed, onMounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import BaseFileView from "@/components/BaseFileView.vue";
import { useFileStore } from "@/stores/useFileStore.js";

const SHARE_FILTERS = [
  { value: "received", label: "공유받음" },
  { value: "pending", label: "수락 대기" },
  { value: "sent", label: "내가 공유함" },
  { value: "all", label: "전체" },
];

const fileStore = useFileStore();
const route = useRoute();
const activeFilter = ref("received");
const pendingActionKey = ref("");

const getSortTimestamp = (file) => Math.max(
  new Date(file?.sharedAt || 0).getTime() || 0,
  Number(file?.lastModifiedMs || 0),
  new Date(file?.updatedAt || 0).getTime() || 0,
);

const sortByLatestShared = (files) => [...files].sort(
  (left, right) => getSortTimestamp(right) - getSortTimestamp(left),
);

const mergeUniqueFiles = (files) => {
  const fileMap = new Map();

  files.forEach((file) => {
    const fileId = String(file?.id ?? file?.idx ?? "");
    if (!fileId || fileMap.has(fileId)) {
      return;
    }

    fileMap.set(fileId, file);
  });

  return sortByLatestShared([...fileMap.values()]);
};

const receivedSharedFiles = computed(() => sortByLatestShared(fileStore.sharedFiles));
const pendingSharedFiles = computed(() => sortByLatestShared(fileStore.pendingSharedFiles));
const sentSharedFiles = computed(() => sortByLatestShared(fileStore.sentSharedFiles));

const allSharedFiles = computed(() => mergeUniqueFiles([
  ...pendingSharedFiles.value,
  ...receivedSharedFiles.value,
  ...sentSharedFiles.value,
]));

const filterCounts = computed(() => ({
  received: receivedSharedFiles.value.length,
  pending: pendingSharedFiles.value.length,
  sent: sentSharedFiles.value.length,
  all: allSharedFiles.value.length,
}));

const visibleSharedFiles = computed(() => {
  if (activeFilter.value === "pending") {
    return pendingSharedFiles.value;
  }

  if (activeFilter.value === "sent") {
    return sentSharedFiles.value;
  }

  if (activeFilter.value === "all") {
    return allSharedFiles.value;
  }

  return receivedSharedFiles.value;
});

const formatPermissionLabel = (permission) => {
  const labels = {
    READ: "보기만",
    DOWNLOAD: "보기 + 다운로드",
    UPLOAD: "업로드만",
    WRITE: "전체 허용",
  };
  return labels[String(permission || "READ").toUpperCase()] || labels.READ;
};

const pendingActionId = (file, action) => `${action}-${file?.id ?? file?.idx ?? ""}`;
const isPendingActionBusy = (file, action) => pendingActionKey.value === pendingActionId(file, action);
const isPendingBusy = (file) => pendingActionKey.value.endsWith(`-${file?.id ?? file?.idx ?? ""}`);

const acceptPendingShare = async (file) => {
  const fileId = file?.id ?? file?.idx;
  if (fileId == null) {
    return;
  }

  pendingActionKey.value = pendingActionId(file, "accept");
  try {
    await fileStore.acceptSharedFile(fileId);
  } finally {
    pendingActionKey.value = "";
  }
};

const rejectPendingShare = async (file) => {
  const fileId = file?.id ?? file?.idx;
  if (fileId == null) {
    return;
  }

  pendingActionKey.value = pendingActionId(file, "reject");
  try {
    await fileStore.rejectSharedFile(fileId);
  } finally {
    pendingActionKey.value = "";
  }
};

onMounted(() => {
  fileStore.fetchPendingSharedFiles().catch(() => {});
});

watch(() => [route.query.desktopPath, route.query.desktopTarget, route.query.drivePath], (values) => {
  if (values.some(Boolean)) {
    activeFilter.value = "received";
  }
}, { immediate: true });
</script>

<template>
  <BaseFileView
    title="공유 문서함"
    :files="visibleSharedFiles"
    :shared-library="true"
  >
    <template #header-right>
      <div class="share-filter-group" role="tablist" aria-label="공유 파일 보기 필터">
        <button
          v-for="filter in SHARE_FILTERS"
          :key="filter.value"
          type="button"
          class="share-filter-button"
          :class="{ 'is-active': activeFilter === filter.value }"
          :aria-pressed="activeFilter === filter.value"
          @click="activeFilter = filter.value"
        >
          <span>{{ filter.label }}</span>
          <span class="share-filter-count">{{ filterCounts[filter.value] }}</span>
        </button>
      </div>
    </template>
    <template #header-bottom>
      <section v-if="pendingSharedFiles.length > 0" class="pending-share-panel" aria-label="수락 대기 중인 공유">
        <div class="pending-share-panel__header">
          <div>
            <p class="pending-share-panel__eyebrow">공유 초대</p>
            <h2 class="pending-share-panel__title">수락 대기 중인 공유 폴더와 파일</h2>
          </div>
          <span class="pending-share-panel__count">{{ pendingSharedFiles.length }}개</span>
        </div>

        <div class="pending-share-list">
          <article
            v-for="file in pendingSharedFiles"
            :key="file.id || file.idx"
            class="pending-share-card"
          >
            <div class="pending-share-card__main">
              <span class="pending-share-card__type">{{ file.type === "folder" ? "폴더" : "파일" }}</span>
              <div class="pending-share-card__text">
                <p class="pending-share-card__name">{{ file.name || file.fileOriginName }}</p>
                <p class="pending-share-card__meta">
                  {{ file.ownerName || file.ownerEmail || "알 수 없는 사용자" }} · {{ formatPermissionLabel(file.permission) }}
                </p>
              </div>
            </div>
            <div class="pending-share-card__actions">
              <button
                type="button"
                class="pending-share-button pending-share-button--accept"
                :disabled="isPendingBusy(file)"
                @click="acceptPendingShare(file)"
              >
                {{ isPendingActionBusy(file, "accept") ? "수락 중..." : "수락" }}
              </button>
              <button
                type="button"
                class="pending-share-button pending-share-button--reject"
                :disabled="isPendingBusy(file)"
                @click="rejectPendingShare(file)"
              >
                {{ isPendingActionBusy(file, "reject") ? "거절 중..." : "거절" }}
              </button>
            </div>
          </article>
        </div>
      </section>
    </template>
  </BaseFileView>
</template>

<style scoped>
.share-filter-group {
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
}

.share-filter-button {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--border-color) 86%, transparent);
  background: color-mix(in srgb, var(--bg-main) 88%, var(--bg-input) 12%);
  padding: 0.55rem 0.9rem;
  font-size: 0.82rem;
  font-weight: 700;
  color: var(--text-secondary);
  transition: background-color 0.18s ease, border-color 0.18s ease, color 0.18s ease;
}

.share-filter-button:hover {
  background: color-mix(in srgb, var(--bg-input) 84%, var(--bg-main) 16%);
}

.share-filter-button.is-active {
  border-color: color-mix(in srgb, var(--accent) 34%, transparent);
  background: color-mix(in srgb, var(--accent) 14%, transparent);
  color: var(--accent);
}

.share-filter-count {
  display: inline-flex;
  min-width: 1.7rem;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: color-mix(in srgb, var(--bg-input) 78%, var(--bg-main) 22%);
  padding: 0.2rem 0.45rem;
  font-size: 0.74rem;
  font-weight: 800;
  color: inherit;
}

.share-filter-button.is-active .share-filter-count {
  background: color-mix(in srgb, var(--accent) 18%, transparent);
}

.pending-share-panel {
  margin-bottom: 1rem;
  border: 1px solid color-mix(in srgb, var(--accent) 22%, var(--border-color) 78%);
  border-radius: 1.5rem;
  background: linear-gradient(180deg, color-mix(in srgb, #e0f2fe 66%, #ffffff 34%), #ffffff);
  padding: 1rem;
  box-shadow: var(--shadow-sm);
}

.pending-share-panel__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}

.pending-share-panel__eyebrow {
  font-size: 0.76rem;
  font-weight: 800;
  color: var(--accent);
}

.pending-share-panel__title {
  margin-top: 0.2rem;
  font-size: 1rem;
  font-weight: 850;
  color: var(--text-main);
}

.pending-share-panel__count {
  display: inline-flex;
  min-width: 2.6rem;
  justify-content: center;
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent) 14%, transparent);
  padding: 0.38rem 0.7rem;
  font-size: 0.78rem;
  font-weight: 850;
  color: var(--accent);
}

.pending-share-list {
  display: grid;
  gap: 0.7rem;
  margin-top: 0.9rem;
}

.pending-share-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.9rem;
  border: 1px solid color-mix(in srgb, var(--border-color) 82%, transparent);
  border-radius: 1.2rem;
  background: rgba(255, 255, 255, 0.86);
  padding: 0.85rem;
}

.pending-share-card__main {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 0.75rem;
}

.pending-share-card__type {
  flex: 0 0 auto;
  border-radius: 999px;
  background: color-mix(in srgb, #0ea5e9 12%, transparent);
  padding: 0.34rem 0.62rem;
  font-size: 0.72rem;
  font-weight: 850;
  color: #0369a1;
}

.pending-share-card__text {
  min-width: 0;
}

.pending-share-card__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.9rem;
  font-weight: 850;
  color: var(--text-main);
}

.pending-share-card__meta {
  margin-top: 0.18rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.78rem;
  color: var(--text-muted);
}

.pending-share-card__actions {
  display: flex;
  flex: 0 0 auto;
  gap: 0.5rem;
}

.pending-share-button {
  border-radius: 999px;
  border: 1px solid transparent;
  padding: 0.52rem 0.9rem;
  font-size: 0.8rem;
  font-weight: 850;
  transition: transform 0.12s ease, background-color 0.18s ease, border-color 0.18s ease;
}

.pending-share-button:active {
  transform: translateY(1px);
}

.pending-share-button:disabled {
  cursor: wait;
  opacity: 0.62;
}

.pending-share-button--accept {
  background: #2563eb;
  color: white;
}

.pending-share-button--accept:hover:not(:disabled) {
  background: #1d4ed8;
}

.pending-share-button--reject {
  border-color: color-mix(in srgb, var(--border-color) 86%, transparent);
  background: white;
  color: var(--text-secondary);
}

.pending-share-button--reject:hover:not(:disabled) {
  background: color-mix(in srgb, var(--bg-input) 86%, white 14%);
}

@media (max-width: 640px) {
  .pending-share-card {
    align-items: stretch;
    flex-direction: column;
  }

  .pending-share-card__actions {
    width: 100%;
  }

  .pending-share-button {
    flex: 1;
  }
}
</style>
