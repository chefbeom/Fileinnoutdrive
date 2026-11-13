<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { fetchFileListPage } from "@/api/filesApi.js";
import { useFileStore } from "@/stores/useFileStore.js";
import { useSecretFolderStore } from "@/stores/useSecretFolderStore.js";
import { normalizeBreadcrumbRecord, normalizeFileRecord } from "@/stores/fileStoreModel.js";
import { getCollectionActionAvailability, getCollectionStatusChips } from "./fileCollectionViewModel.js";

const props = defineProps({
  open: { type: Boolean, default: false },
  targetFolderId: { type: [Number, String], default: null },
  targetFolderName: { type: String, default: "" },
});

const emit = defineEmits(["close", "imported"]);

const fileStore = useFileStore();
const secretFolderStore = useSecretFolderStore();

const browseParentId = ref(null);
const breadcrumbs = ref([]);
const items = ref([]);
const currentPage = ref(0);
const totalPage = ref(0);
const totalCount = ref(0);
const searchInput = ref("");
const searchQuery = ref("");
const includeHidden = ref(false);
const isLoading = ref(false);
const isImporting = ref(false);
const errorMessage = ref("");
const selectedMap = ref(new Map());
const browsedFoldersById = ref(new Map());

let activeAbortController = null;
let searchDebounceTimer = null;

const destinationLabel = computed(() => {
  const name = String(props.targetFolderName || "").trim();
  return name || "비밀 폴더 (최상위)";
});

const selectedItems = computed(() => Array.from(selectedMap.value.values()));
const selectedIdSet = computed(() => new Set(Array.from(selectedMap.value.keys())));

const canSelectItem = (item) => Boolean(
  item &&
  getCollectionActionAvailability(item, {
    sharedLibrary: false,
    vaultMode: false,
    deleteMode: "trash",
    canCreateShares: false,
    canCreateLocks: false,
  }).canMoveToVault,
);

const eligiblePageItems = computed(() => items.value.filter(canSelectItem));
const allPageSelected = computed(() => (
  eligiblePageItems.value.length > 0 &&
  eligiblePageItems.value.every((item) => selectedIdSet.value.has(String(item.id)))
));

const getIneligibleReason = (item) => {
  if (!item) return "";
  if (item.lockedFile) return "잠금 파일 불가";
  if (item.sharedWithMe) return "공유받음 불가";
  if (item.isSharedFolder || item.sharedFile || item.isShared || String(item.fileSaveName || "").startsWith("shared-")) {
    return "공유 항목 불가";
  }
  if (item.isTrash) return "휴지통 불가";
  if (item.isVaultSpace || String(item.spaceType || "").toUpperCase() === "VAULT") return "이미 비밀구역";
  return "가져올 수 없음";
};

const abortActiveRequest = () => {
  if (activeAbortController) {
    activeAbortController.abort();
    activeAbortController = null;
  }
};

const clearSearchTimer = () => {
  if (searchDebounceTimer) {
    window.clearTimeout(searchDebounceTimer);
    searchDebounceTimer = null;
  }
};

const isCanceledError = (error) => (
  error?.name === "AbortError" ||
  error?.name === "CanceledError" ||
  error?.code === "ERR_CANCELED"
);

const loadDirectory = async ({
  parentId = browseParentId.value,
  page = currentPage.value,
} = {}) => {
  if (!props.open) return;

  abortActiveRequest();
  const controller = new AbortController();
  activeAbortController = controller;
  isLoading.value = true;
  errorMessage.value = "";

  try {
    const result = await fetchFileListPage(
      {
        parentId: parentId ?? null,
        page: Math.max(0, Number(page) || 0),
        size: 20,
        sortOption: "updatedAt-desc",
        searchQuery: searchQuery.value,
        extensionFilter: "all",
        sizeFilter: "all",
        statusFilter: "all",
        vaultMode: false,
        includeHidden: Boolean(includeHidden.value),
        trashedOnly: false,
      },
      { signal: controller.signal },
    );

    if (controller.signal.aborted) return;

    const normalizedBreadcrumbs = Array.isArray(result?.breadcrumbs)
      ? result.breadcrumbs.map((folder) => normalizeBreadcrumbRecord(folder))
      : [];
    const normalizedItems = Array.isArray(result?.fileList)
      ? result.fileList.map((file) => normalizeFileRecord(file))
      : [];

    browseParentId.value = parentId ?? null;
    breadcrumbs.value = normalizedBreadcrumbs;
    items.value = normalizedItems;
    currentPage.value = Number(result?.currentPage ?? page) || 0;
    totalPage.value = Number(result?.totalPage ?? 0) || 0;
    totalCount.value = Number(result?.totalCount ?? normalizedItems.length) || 0;

    const nextCache = new Map(browsedFoldersById.value);
    normalizedItems
      .filter((item) => item?.type === "folder" && item?.id != null)
      .forEach((folder) => nextCache.set(String(folder.id), folder));
    browsedFoldersById.value = nextCache;
  } catch (error) {
    if (isCanceledError(error) || controller.signal.aborted) {
      return;
    }
    if (parentId != null && (error?.response?.status === 400 || error?.response?.status === 403 || error?.response?.status === 404)) {
      browseParentId.value = null;
      await loadDirectory({ parentId: null, page: 0 });
      return;
    }
    errorMessage.value = error?.response?.data?.message || error?.message || "드라이브 목록을 불러오지 못했습니다.";
  } finally {
    if (activeAbortController === controller) {
      activeAbortController = null;
      isLoading.value = false;
    }
  }
};

const resetAndLoad = async () => {
  clearSearchTimer();
  browseParentId.value = null;
  breadcrumbs.value = [];
  items.value = [];
  currentPage.value = 0;
  totalPage.value = 0;
  totalCount.value = 0;
  searchInput.value = "";
  searchQuery.value = "";
  errorMessage.value = "";
  includeHidden.value = Boolean(secretFolderStore.showHiddenFolders);
  selectedMap.value = new Map();
  browsedFoldersById.value = new Map();
  await loadDirectory({ parentId: null, page: 0 });
};

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      void resetAndLoad();
    } else {
      clearSearchTimer();
      abortActiveRequest();
    }
  },
  { immediate: true },
);

const navigateToDriveFolder = async (folderId = null) => {
  if (folderId == null) {
    await loadDirectory({ parentId: null, page: 0 });
    return;
  }

  const cached = browsedFoldersById.value.get(String(folderId));
  if (cached?.hiddenFolder && cached?.pinEnabled && !secretFolderStore.isFolderUnlocked(cached.id)) {
    const unlocked = await secretFolderStore.ensureFolderUnlocked(cached);
    if (!unlocked) return;
  }

  await loadDirectory({ parentId: folderId, page: 0 });
};

const handleRowOpenFolder = async (item) => {
  if (!item || item.type !== "folder" || item.id == null) return;
  await navigateToDriveFolder(item.id);
};

const handleNavigateParent = async () => {
  if (browseParentId.value == null) return;
  const currentList = breadcrumbs.value || [];
  if (currentList.length <= 1) {
    await navigateToDriveFolder(null);
    return;
  }
  const parentCrumb = currentList[currentList.length - 2];
  await navigateToDriveFolder(parentCrumb?.id ?? null);
};

const toggleSelectItem = (item) => {
  if (!canSelectItem(item) || item?.id == null) return;
  const key = String(item.id);
  const next = new Map(selectedMap.value);
  if (next.has(key)) {
    next.delete(key);
  } else {
    next.set(key, item);
  }
  selectedMap.value = next;
};

const toggleSelectAllOnPage = (checked) => {
  const next = new Map(selectedMap.value);
  if (checked) {
    eligiblePageItems.value.forEach((item) => {
      if (item?.id != null) {
        next.set(String(item.id), item);
      }
    });
  } else {
    eligiblePageItems.value.forEach((item) => {
      if (item?.id != null) {
        next.delete(String(item.id));
      }
    });
  }
  selectedMap.value = next;
};

const clearSelectedItems = () => {
  selectedMap.value = new Map();
};

const handleSearchInput = (value) => {
  searchInput.value = value;
  clearSearchTimer();
  searchDebounceTimer = window.setTimeout(() => {
    searchQuery.value = String(searchInput.value || "").trim();
    void loadDirectory({ parentId: browseParentId.value, page: 0 });
  }, 220);
};

const submitSearchNow = () => {
  clearSearchTimer();
  searchQuery.value = String(searchInput.value || "").trim();
  void loadDirectory({ parentId: browseParentId.value, page: 0 });
};

const handleToggleIncludeHidden = async (checked) => {
  includeHidden.value = Boolean(checked);
  if (!includeHidden.value) {
    const insideHiddenBreadcrumb = breadcrumbs.value.some(
      (crumb) => browsedFoldersById.value.get(String(crumb?.id))?.hiddenFolder,
    );
    if (insideHiddenBreadcrumb) {
      await loadDirectory({ parentId: null, page: 0 });
      return;
    }
  }
  await loadDirectory({ parentId: browseParentId.value, page: 0 });
};

const changePage = async (nextPage) => {
  if (nextPage < 0 || (totalPage.value > 0 && nextPage >= totalPage.value)) return;
  await loadDirectory({ parentId: browseParentId.value, page: nextPage });
};

const handleImport = async () => {
  const targets = selectedItems.value.filter((item) => item?.id != null);
  if (!targets.length || isImporting.value) return;

  errorMessage.value = "";

  for (const item of targets) {
    if (item.hiddenFolder && item.pinEnabled) {
      const unlocked = await secretFolderStore.ensureFolderUnlocked(item);
      if (!unlocked) {
        return;
      }
    }
  }

  const vaultReady = await secretFolderStore.ensureVaultUnlocked({
    enterVault: true,
    registerTitle: "자체 비밀구역 PIN 등록",
    title: "자체 비밀구역 인증",
    registerDescription: "파일·폴더를 가져오려면 자체 비밀구역 4자리 숫자 PIN을 먼저 등록해 주세요.",
    description: "자체 비밀구역 인증이 만료되었습니다. 4자리 숫자 PIN 번호를 다시 입력해 주세요.",
  });
  if (!vaultReady) {
    return;
  }

  isImporting.value = true;
  try {
    const resolvedTargetParentId = props.targetFolderId != null ? Number(props.targetFolderId) : null;
    const movedIds = targets.map((item) => item.id);
    const result = await fileStore.moveFilesToVault(movedIds, resolvedTargetParentId);
    emit("imported", {
      movedIds,
      targetParentId: resolvedTargetParentId,
      affectedCount: Number(result?.affectedCount ?? movedIds.length) || movedIds.length,
    });
    emit("close");
  } catch (error) {
    const code = error?.response?.data?.code;
    if (code === 7304) {
      secretFolderStore.invalidateVaultUnlock?.();
    }
    if (code === 7306) {
      errorMessage.value = "하위에 PIN으로 잠긴 비밀 폴더가 있어 먼저 해당 폴더의 PIN 잠금을 해제해 주세요.";
    } else {
      errorMessage.value = error?.response?.data?.message || error?.message || "자체 비밀구역으로 가져오지 못했습니다.";
    }
  } finally {
    isImporting.value = false;
  }
};

const handleClose = () => {
  if (isImporting.value) return;
  emit("close");
};

const handleKeydown = (event) => {
  if (!props.open) return;
  if (event?.key === "Escape" && !secretFolderStore.pinModal?.open && !isImporting.value) {
    event.preventDefault();
    handleClose();
  }
};

onMounted(() => {
  window.addEventListener("keydown", handleKeydown);
});

onBeforeUnmount(() => {
  clearSearchTimer();
  abortActiveRequest();
  window.removeEventListener("keydown", handleKeydown);
});
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-[1100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-3 sm:p-4"
      @click.self="handleClose"
    >
      <div
        class="flex w-full max-w-2xl max-h-[calc(100dvh-1.5rem)] flex-col overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[var(--bg-secondary)] shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-label="일반 드라이브에서 파일·폴더 가져오기"
      >
        <div class="flex items-center justify-between gap-3 border-b border-[var(--border-color)] px-5 py-4">
          <div class="flex min-w-0 items-center gap-3">
            <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-500">
              <i class="fa-solid fa-file-import text-sm"></i>
            </span>
            <div class="min-w-0">
              <h3 class="truncate text-sm font-bold text-[var(--text-main)]">
                일반 드라이브에서 파일 · 폴더 가져오기
              </h3>
              <p class="truncate text-[11px] text-[var(--text-muted)]">
                대상 위치: 자체 비밀 폴더 &gt; {{ destinationLabel }}
              </p>
            </div>
          </div>
          <button
            type="button"
            class="h-8 w-8 rounded-lg text-[var(--text-muted)] transition hover:bg-[var(--bg-input)] hover:text-[var(--text-main)]"
            aria-label="닫기"
            :disabled="isImporting"
            @click="handleClose"
          >
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>

        <div class="flex flex-wrap items-center justify-between gap-2.5 border-b border-[var(--border-color)] bg-[var(--bg-main)]/60 px-5 py-3">
          <div class="relative min-w-[180px] flex-1">
            <i class="fa-solid fa-magnifying-glass pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-[var(--text-muted)]"></i>
            <input
              :value="searchInput"
              type="text"
              placeholder="가져올 파일·폴더 이름 검색..."
              class="w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-input)] py-2 pl-8 pr-3 text-xs text-[var(--text-main)] placeholder:text-[var(--text-muted)] focus:border-amber-500 focus:outline-none"
              @input="handleSearchInput($event.target.value)"
              @keydown.enter.prevent="submitSearchNow"
            />
          </div>

          <label class="inline-flex cursor-pointer select-none items-center gap-2 rounded-xl border border-[var(--border-color)] bg-[var(--bg-input)] px-3 py-2 text-xs font-semibold text-[var(--text-main)]">
            <input
              :checked="includeHidden"
              type="checkbox"
              class="h-3.5 w-3.5 accent-indigo-500"
              @change="handleToggleIncludeHidden($event.target.checked)"
            />
            <span>숨긴 비밀폴더 포함</span>
          </label>
        </div>

        <div class="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-color)] px-5 py-2.5 text-xs">
          <div class="flex min-w-0 flex-wrap items-center gap-1 text-[var(--text-secondary)]">
            <button
              type="button"
              class="rounded-md px-1.5 py-0.5 font-semibold transition hover:bg-[var(--bg-input)] hover:text-[var(--text-main)]"
              :class="{ 'text-amber-500': browseParentId == null }"
              @click="navigateToDriveFolder(null)"
            >
              홈
            </button>
            <template v-for="(crumb, index) in breadcrumbs" :key="crumb.id">
              <span class="text-[var(--text-muted)]">/</span>
              <button
                type="button"
                class="max-w-[140px] truncate rounded-md px-1.5 py-0.5 font-semibold transition hover:bg-[var(--bg-input)] hover:text-[var(--text-main)]"
                :class="{ 'text-amber-500': index === breadcrumbs.length - 1 }"
                @click="navigateToDriveFolder(crumb.id)"
              >
                {{ crumb.name }}
              </button>
            </template>
          </div>

          <label
            v-if="eligiblePageItems.length > 0"
            class="inline-flex cursor-pointer select-none items-center gap-1.5 text-[11px] font-semibold text-[var(--text-secondary)]"
          >
            <input
              :checked="allPageSelected"
              type="checkbox"
              class="h-3.5 w-3.5 accent-amber-500"
              @change="toggleSelectAllOnPage($event.target.checked)"
            />
            <span>현재 페이지 전체 선택</span>
          </label>
        </div>

        <div class="min-h-[260px] flex-1 overflow-y-auto px-3 py-2">
          <div
            v-if="browseParentId != null"
            class="mb-1 flex items-center gap-3 rounded-xl px-3 py-2 text-xs font-semibold text-[var(--text-secondary)] transition hover:bg-[var(--bg-input)] cursor-pointer"
            @click="handleNavigateParent"
          >
            <span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--bg-input)] text-[var(--text-muted)]">
              <i class="fa-solid fa-level-up-alt"></i>
            </span>
            <span>../ 상위 폴더로 이동</span>
          </div>

          <div
            v-if="isLoading"
            class="flex flex-col items-center justify-center py-12 text-xs text-[var(--text-muted)]"
          >
            <i class="fa-solid fa-spinner fa-spin mb-2 text-base text-amber-500"></i>
            <span>드라이브 항목을 불러오는 중입니다...</span>
          </div>

          <div
            v-else-if="items.length === 0"
            class="flex flex-col items-center justify-center py-12 text-center text-xs text-[var(--text-muted)]"
          >
            <i class="fa-regular fa-folder-open mb-2 text-2xl opacity-60"></i>
            <p>이 위치에 표시할 드라이브 파일이나 폴더가 없습니다.</p>
          </div>

          <ul v-else class="space-y-1">
            <li
              v-for="item in items"
              :key="item.id"
              class="flex items-center justify-between gap-3 rounded-xl border border-transparent px-3 py-2 transition"
              :class="[
                selectedIdSet.has(String(item.id))
                  ? 'border-amber-500/40 bg-amber-500/10'
                  : 'hover:bg-[var(--bg-input)]/75',
                !canSelectItem(item) ? 'opacity-60' : 'cursor-pointer',
              ]"
              @click="canSelectItem(item) && toggleSelectItem(item)"
              @dblclick.stop="item.type === 'folder' && handleRowOpenFolder(item)"
            >
              <div class="flex min-w-0 flex-1 items-center gap-2.5">
                <input
                  type="checkbox"
                  :checked="selectedIdSet.has(String(item.id))"
                  :disabled="!canSelectItem(item)"
                  class="h-4 w-4 shrink-0 accent-amber-500 cursor-pointer disabled:cursor-not-allowed"
                  @click.stop
                  @change="toggleSelectItem(item)"
                />
                <span
                  class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                  :class="
                    item.type === 'folder'
                      ? (item.hiddenFolder ? 'bg-indigo-500/15 text-indigo-400' : 'bg-amber-500/15 text-amber-500')
                      : 'bg-blue-500/15 text-blue-400'
                  "
                >
                  <i
                    class="text-xs"
                    :class="
                      item.type === 'folder'
                        ? (item.hiddenFolder ? 'fa-solid fa-folder-closed' : 'fa-solid fa-folder')
                        : 'fa-regular fa-file'
                    "
                  ></i>
                </span>

                <div class="min-w-0 flex-1">
                  <div class="flex flex-wrap items-center gap-1.5">
                    <p class="truncate text-xs font-bold text-[var(--text-main)]">
                      {{ item.name }}
                    </p>
                    <template v-for="chip in getCollectionStatusChips(item)" :key="chip.key">
                      <span
                        v-if="chip.key !== 'normal'"
                        class="rounded-full px-1.5 py-0.5 text-[10px] font-bold"
                        :class="{
                          'bg-indigo-500/20 text-indigo-300': chip.tone === 'hidden',
                          'bg-amber-500/20 text-amber-400': chip.tone === 'locked',
                          'bg-sky-500/20 text-sky-300': chip.tone === 'shared-out' || chip.tone === 'shared-in',
                        }"
                      >
                        {{ chip.label }}
                      </span>
                    </template>
                  </div>
                  <p class="truncate text-[10px] text-[var(--text-muted)]">
                    {{
                      !canSelectItem(item)
                        ? getIneligibleReason(item)
                        : (item.type === "folder" ? "폴더 (내부 보기: 열기 또는 더블클릭)" : item.sizeLabel)
                    }}
                  </p>
                </div>
              </div>

              <button
                v-if="item.type === 'folder'"
                type="button"
                class="shrink-0 rounded-lg border border-[var(--border-color)] bg-[var(--bg-main)] px-2.5 py-1 text-[11px] font-semibold text-[var(--text-secondary)] transition hover:border-amber-500/50 hover:text-[var(--text-main)]"
                @click.stop="handleRowOpenFolder(item)"
              >
                열기
              </button>
            </li>
          </ul>
        </div>

        <div
          v-if="totalPage > 1"
          class="flex items-center justify-between border-t border-[var(--border-color)] px-5 py-2 text-[11px] text-[var(--text-muted)]"
        >
          <span>총 {{ totalCount }}개 항목</span>
          <div class="flex items-center gap-1.5">
            <button
              type="button"
              class="rounded-lg border border-[var(--border-color)] px-2 py-1 font-semibold text-[var(--text-secondary)] disabled:opacity-40"
              :disabled="currentPage <= 0 || isLoading"
              @click="changePage(currentPage - 1)"
            >
              이전
            </button>
            <span class="px-1 font-semibold text-[var(--text-main)]">{{ currentPage + 1 }} / {{ totalPage }}</span>
            <button
              type="button"
              class="rounded-lg border border-[var(--border-color)] px-2 py-1 font-semibold text-[var(--text-secondary)] disabled:opacity-40"
              :disabled="currentPage + 1 >= totalPage || isLoading"
              @click="changePage(currentPage + 1)"
            >
              다음
            </button>
          </div>
        </div>

        <div
          v-if="errorMessage"
          class="mx-5 mt-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-medium text-red-400"
        >
          {{ errorMessage }}
        </div>

        <div class="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border-color)] px-5 py-3.5">
          <div class="flex items-center gap-2 text-xs">
            <span class="font-bold text-[var(--text-main)]">
              {{ selectedItems.length > 0 ? `${selectedItems.length}개 선택됨` : "가져올 항목을 선택하세요" }}
            </span>
            <button
              v-if="selectedItems.length > 0"
              type="button"
              class="text-[11px] font-semibold text-[var(--text-muted)] underline hover:text-[var(--text-main)]"
              :disabled="isImporting"
              @click="clearSelectedItems"
            >
              선택 초기화
            </button>
          </div>

          <div class="flex items-center gap-2">
            <button
              type="button"
              class="rounded-xl border border-[var(--border-color)] px-4 py-2 text-xs font-semibold text-[var(--text-secondary)] transition hover:bg-[var(--bg-input)]"
              :disabled="isImporting"
              @click="handleClose"
            >
              취소
            </button>
            <button
              type="button"
              class="rounded-xl bg-amber-500 px-4 py-2 text-xs font-semibold text-white transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-50"
              :disabled="selectedItems.length === 0 || isImporting"
              @click="handleImport"
            >
              {{ isImporting ? "가져오는 중..." : `선택 항목 가져오기 (${selectedItems.length})` }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
