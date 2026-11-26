<script setup>
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { fetchFileListPage } from "@/api/filesApi.js";
import { useFileStore } from "@/stores/useFileStore.js";
import { useSecretFolderStore } from "@/stores/useSecretFolderStore.js";
import { normalizeBreadcrumbRecord, normalizeFileRecord } from "@/stores/fileStoreModel.js";

const props = defineProps({
  open: { type: Boolean, default: false },
  items: { type: Array, default: () => [] },
});

const emit = defineEmits(["close", "exported"]);

const fileStore = useFileStore();
const secretFolderStore = useSecretFolderStore();

const destinationMode = ref("origin"); // 'origin' | 'custom'
const browseParentId = ref(null);
const breadcrumbs = ref([]);
const folders = ref([]);
const currentPage = ref(0);
const totalPage = ref(0);
const searchInput = ref("");
const searchQuery = ref("");
const isLoading = ref(false);
const isExporting = ref(false);
const progressState = ref({ completed: 0, total: 0, currentName: "" });
const errorMessage = ref("");

let activeAbortController = null;
let searchDebounceTimer = null;

const normalizedItems = computed(() => (Array.isArray(props.items) ? props.items.filter((item) => item?.id != null) : []));
const itemsWithOriginCount = computed(() => normalizedItems.value.filter((item) => item?.vaultOriginParentId != null).length);
const itemsWithoutOriginCount = computed(() => normalizedItems.value.length - itemsWithOriginCount.value);

const currentFolderLabel = computed(() => {
  if (!browseParentId.value) {
    return "홈 (일반 저장소 최상위)";
  }
  const currentCrumb = breadcrumbs.value.find((entry) => String(entry.id) === String(browseParentId.value));
  if (currentCrumb?.name) {
    return `홈 / ${breadcrumbs.value.map((entry) => entry.name).join(" / ")}`;
  }
  return "선택한 일반 폴더";
});

const progressPercent = computed(() => {
  const total = Number(progressState.value.total || 0);
  if (total <= 0) return 0;
  return Math.min(100, Math.round((Number(progressState.value.completed || 0) / total) * 100));
});

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

const loadDriveFolders = async ({
  parentId = browseParentId.value,
  page = currentPage.value,
} = {}) => {
  if (!props.open || destinationMode.value !== "custom") return;

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
        size: 50,
        sortOption: "name-asc",
        searchQuery: searchQuery.value,
        extensionFilter: "all",
        sizeFilter: "all",
        statusFilter: "all",
        vaultMode: false,
        includeHidden: false,
        trashedOnly: false,
      },
      { signal: controller.signal },
    );

    if (controller.signal.aborted) return;

    const normalized = Array.isArray(result?.fileList)
      ? result.fileList.map((raw) => normalizeFileRecord(raw)).filter((item) => item.type === "folder")
      : [];
    const normalizedBreadcrumbs = Array.isArray(result?.breadcrumbs)
      ? result.breadcrumbs.map((entry) => normalizeBreadcrumbRecord(entry)).filter(Boolean)
      : [];

    browseParentId.value = parentId ?? null;
    currentPage.value = Number(result?.currentPage ?? page) || 0;
    totalPage.value = Number(result?.totalPage ?? 0) || 0;
    breadcrumbs.value = normalizedBreadcrumbs;
    folders.value = normalized;
  } catch (error) {
    if (isCanceledError(error)) return;
    errorMessage.value = error?.response?.data?.message || error?.message || "일반 저장소 폴더를 불러오지 못했습니다.";
  } finally {
    if (activeAbortController === controller) {
      activeAbortController = null;
      isLoading.value = false;
    }
  }
};

const enterFolder = (folderId = null) => {
  if (isExporting.value) return;
  currentPage.value = 0;
  void loadDriveFolders({ parentId: folderId ?? null, page: 0 });
};

const changePage = (nextPage) => {
  if (isLoading.value || isExporting.value || nextPage < 0 || nextPage >= totalPage.value) return;
  void loadDriveFolders({ parentId: browseParentId.value, page: nextPage });
};

const closeModal = () => {
  if (isExporting.value) return;
  emit("close");
};

const handleExport = async () => {
  if (isExporting.value || !normalizedItems.value.length) return;

  const restoreOriginalParent = destinationMode.value === "origin";
  const targetParentId = restoreOriginalParent ? null : (browseParentId.value ?? null);
  const nameById = new Map(
    normalizedItems.value.map((item) => [Number(item.id), item.name || item.fileOriginName || `항목 #${item.id}`]),
  );

  isExporting.value = true;
  errorMessage.value = "";
  progressState.value = {
    completed: 0,
    total: normalizedItems.value.length,
    currentName: normalizedItems.value[0]?.name || normalizedItems.value[0]?.fileOriginName || "",
  };

  try {
    const result = await fileStore.moveFilesFromVault(
      normalizedItems.value.map((item) => item.id),
      {
        targetParentId,
        restoreOriginalParent,
        onProgress: ({ completed, total, currentId }) => {
          progressState.value = {
            completed,
            total,
            currentName: nameById.get(Number(currentId)) || "",
          };
        },
      },
    );
    emit("exported", {
      affectedCount: Number(result?.affectedCount ?? normalizedItems.value.length),
      restoreOriginalParent,
      targetParentId: result?.targetIdx ?? targetParentId,
    });
  } catch (error) {
    const code = error?.response?.data?.code;
    if (code === 7304) {
      secretFolderStore.invalidateVaultUnlock?.();
      errorMessage.value = "비밀 폴더 잠금이 만료되었습니다. PIN을 다시 인증한 뒤 시도해 주세요.";
      return;
    }
    if (code === 7306) {
      errorMessage.value = "하위에 잠긴 폴더가 있어 꺼낼 수 없습니다.";
      return;
    }
    errorMessage.value = error?.response?.data?.message || error?.message || "일반 저장소로 꺼내는 중 오류가 발생했습니다.";
  } finally {
    isExporting.value = false;
  }
};

watch(
  () => props.open,
  (isOpen) => {
    clearSearchTimer();
    abortActiveRequest();
    if (isOpen) {
      destinationMode.value = "origin";
      browseParentId.value = null;
      breadcrumbs.value = [];
      folders.value = [];
      currentPage.value = 0;
      totalPage.value = 0;
      searchInput.value = "";
      searchQuery.value = "";
      errorMessage.value = "";
      progressState.value = { completed: 0, total: 0, currentName: "" };
    }
  },
);

watch(destinationMode, (mode) => {
  if (props.open && mode === "custom" && folders.value.length === 0 && !isLoading.value) {
    void loadDriveFolders({ parentId: browseParentId.value, page: 0 });
  }
});

watch(searchInput, (value) => {
  if (!props.open || destinationMode.value !== "custom") return;
  clearSearchTimer();
  searchDebounceTimer = window.setTimeout(() => {
    searchQuery.value = String(value || "").trim();
    currentPage.value = 0;
    void loadDriveFolders({ parentId: browseParentId.value, page: 0 });
  }, 250);
});

onBeforeUnmount(() => {
  clearSearchTimer();
  abortActiveRequest();
});
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-[1300] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs"
      @click.self="closeModal"
    >
      <div
        role="dialog"
        aria-modal="true"
        class="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
      >
        <div class="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-4 dark:border-slate-800">
          <div>
            <div class="flex items-center gap-2">
              <span class="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                <i class="fa-solid fa-lock-open"></i>
              </span>
              <h3 class="text-base font-extrabold text-slate-900 dark:text-slate-100">
                일반 저장소로 꺼내기 (복호화)
              </h3>
            </div>
            <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">
              선택한 {{ normalizedItems.length }}개 항목을 복호화해 일반 저장소로 옮깁니다. 기존 암호화 파일·썸네일은 안전하게 정리됩니다.
            </p>
          </div>
          <button
            type="button"
            class="rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 disabled:opacity-40 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            :disabled="isExporting"
            @click="closeModal"
          >
            <i class="fa-solid fa-xmark text-base"></i>
          </button>
        </div>

        <div class="flex-1 space-y-4 overflow-y-auto px-6 py-4">
          <!-- Selected items preview -->
          <div class="rounded-2xl border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-700 dark:bg-slate-800/40">
            <div class="flex flex-wrap items-center gap-1.5">
              <span
                v-for="item in normalizedItems.slice(0, 8)"
                :key="item.id"
                class="inline-flex items-center gap-1.5 rounded-xl bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-2xs ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700"
              >
                <i
                  class="fa-solid text-[11px]"
                  :class="item.type === 'folder' ? 'fa-folder text-amber-500' : 'fa-file-shield text-emerald-600'"
                ></i>
                <span class="max-w-[160px] truncate">{{ item.name || item.fileOriginName }}</span>
              </span>
              <span
                v-if="normalizedItems.length > 8"
                class="rounded-xl bg-slate-200/80 px-2.5 py-1 text-xs font-bold text-slate-600 dark:bg-slate-700 dark:text-slate-300"
              >
                +{{ normalizedItems.length - 8 }}개 더
              </span>
            </div>
          </div>

          <!-- Destination Mode Cards -->
          <div class="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              data-testid="vault-export-mode-origin"
              class="flex flex-col items-start rounded-2xl border p-4 text-left transition"
              :class="destinationMode === 'origin'
                ? 'border-emerald-500 bg-emerald-50/70 ring-2 ring-emerald-500/20 dark:border-emerald-500/70 dark:bg-emerald-950/30'
                : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800/40'"
              :disabled="isExporting"
              @click="destinationMode = 'origin'"
            >
              <div class="flex items-center gap-2 text-sm font-extrabold text-slate-900 dark:text-slate-100">
                <i class="fa-solid fa-rotate-left text-emerald-600 dark:text-emerald-400"></i>
                <span>원래 위치로 돌려보내기</span>
              </div>
              <p class="mt-1.5 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                기존 일반 드라이브 폴더에서 비밀구역으로 옮긴 항목은 원래 폴더로 복원됩니다.
                <span v-if="itemsWithoutOriginCount > 0">
                  (원래 위치 기록 없음 또는 삭제된 {{ itemsWithoutOriginCount }}개 항목은 홈 최상위로 이동)
                </span>
              </p>
            </button>

            <button
              type="button"
              data-testid="vault-export-mode-custom"
              class="flex flex-col items-start rounded-2xl border p-4 text-left transition"
              :class="destinationMode === 'custom'
                ? 'border-indigo-500 bg-indigo-50/70 ring-2 ring-indigo-500/20 dark:border-indigo-500/70 dark:bg-indigo-950/30'
                : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800/40'"
              :disabled="isExporting"
              @click="destinationMode = 'custom'"
            >
              <div class="flex items-center gap-2 text-sm font-extrabold text-slate-900 dark:text-slate-100">
                <i class="fa-solid fa-folder-tree text-indigo-600 dark:text-indigo-400"></i>
                <span>일반 저장소 폴더 직접 선택</span>
              </div>
              <p class="mt-1.5 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                원하는 일반 드라이브 폴더(또는 홈 최상위)를 직접 지정하여 복호화해 꺼냅니다.
              </p>
            </button>
          </div>

          <!-- Custom Drive Folder Picker -->
          <div
            v-if="destinationMode === 'custom'"
            class="space-y-3 rounded-2xl border border-slate-200 p-4 dark:border-slate-700"
          >
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div class="flex flex-wrap items-center gap-1 text-xs font-semibold text-slate-600 dark:text-slate-300">
                <button
                  type="button"
                  class="rounded-lg px-2 py-1 hover:bg-slate-100 dark:hover:bg-slate-800"
                  :disabled="isExporting"
                  @click="enterFolder(null)"
                >
                  <i class="fa-solid fa-house mr-1 text-slate-400"></i>홈
                </button>
                <template v-for="crumb in breadcrumbs" :key="crumb.id">
                  <span class="text-slate-400">/</span>
                  <button
                    type="button"
                    class="rounded-lg px-2 py-1 hover:bg-slate-100 dark:hover:bg-slate-800"
                    :disabled="isExporting"
                    @click="enterFolder(crumb.id)"
                  >
                    {{ crumb.name }}
                  </button>
                </template>
              </div>
              <span class="rounded-lg bg-indigo-50 px-2.5 py-1 text-[11px] font-bold text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300">
                대상: {{ currentFolderLabel }}
              </span>
            </div>

            <div class="relative">
              <i class="fa-solid fa-magnifying-glass pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400"></i>
              <input
                v-model="searchInput"
                type="text"
                placeholder="일반 저장소 폴더 검색..."
                class="w-full rounded-xl border border-slate-200 bg-white py-2 pl-8 pr-3 text-xs text-slate-800 outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                :disabled="isExporting"
              />
            </div>

            <div class="max-h-52 overflow-y-auto rounded-xl border border-slate-100 dark:border-slate-800">
              <div v-if="isLoading" class="px-4 py-8 text-center text-xs text-slate-500">
                일반 저장소 폴더를 불러오는 중...
              </div>
              <div v-else-if="folders.length === 0" class="px-4 py-8 text-center text-xs text-slate-500">
                하위 폴더가 없습니다. 상단 대상 위치(<b>{{ currentFolderLabel }}</b>)로 바로 꺼낼 수 있습니다.
              </div>
              <button
                v-for="folder in folders"
                :key="folder.id"
                type="button"
                class="flex w-full items-center justify-between border-b border-slate-100 px-3.5 py-2.5 text-left text-xs font-semibold text-slate-700 transition last:border-b-0 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-200 dark:hover:bg-slate-800/70"
                :disabled="isExporting"
                @click="enterFolder(folder.id)"
              >
                <span class="flex items-center gap-2 truncate">
                  <i class="fa-solid fa-folder text-amber-500"></i>
                  <span class="truncate">{{ folder.name }}</span>
                </span>
                <span class="text-[11px] font-bold text-indigo-600 dark:text-indigo-400">열기 →</span>
              </button>
            </div>

            <div v-if="totalPage > 1" class="flex items-center justify-between text-xs text-slate-500">
              <button
                type="button"
                class="rounded-lg border border-slate-200 px-2.5 py-1 disabled:opacity-40 dark:border-slate-700"
                :disabled="currentPage <= 0 || isExporting"
                @click="changePage(currentPage - 1)"
              >
                이전
              </button>
              <span>{{ currentPage + 1 }} / {{ totalPage }}</span>
              <button
                type="button"
                class="rounded-lg border border-slate-200 px-2.5 py-1 disabled:opacity-40 dark:border-slate-700"
                :disabled="currentPage >= totalPage - 1 || isExporting"
                @click="changePage(currentPage + 1)"
              >
                다음
              </button>
            </div>
          </div>

          <!-- Decryption / Export Progress -->
          <div
            v-if="isExporting"
            data-testid="vault-export-progress"
            class="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 dark:border-emerald-800/60 dark:bg-emerald-950/30"
          >
            <div class="flex items-center justify-between text-xs font-bold text-emerald-800 dark:text-emerald-200">
              <span>
                복호화 및 이동 중 ({{ progressState.completed }} / {{ progressState.total }})
              </span>
              <span>{{ progressPercent }}%</span>
            </div>
            <div class="mt-2 h-2 w-full overflow-hidden rounded-full bg-emerald-200/80 dark:bg-emerald-900">
              <div
                class="h-full rounded-full bg-emerald-600 transition-all duration-300"
                :style="{ width: `${progressPercent}%` }"
              ></div>
            </div>
            <p v-if="progressState.currentName" class="mt-1.5 truncate text-[11px] text-emerald-700 dark:text-emerald-300">
              처리 중: {{ progressState.currentName }}
            </p>
          </div>

          <p
            v-if="errorMessage"
            class="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-semibold text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300"
          >
            {{ errorMessage }}
          </p>
        </div>

        <div class="flex items-center justify-end gap-2 border-t border-slate-100 px-6 py-4 dark:border-slate-800">
          <button
            type="button"
            class="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            :disabled="isExporting"
            @click="closeModal"
          >
            취소
          </button>
          <button
            type="button"
            data-testid="vault-export-submit"
            class="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-500 disabled:opacity-50"
            :disabled="isExporting || normalizedItems.length === 0"
            @click="handleExport"
          >
            {{ isExporting ? "복호화 중..." : `${normalizedItems.length}개 항목 꺼내기 (복호화)` }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
