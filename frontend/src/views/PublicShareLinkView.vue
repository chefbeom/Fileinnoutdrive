<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import BrandLogoIcon from "@/components/BrandLogoIcon.vue";
import {
  fetchPublicShareLinkMeta,
  issuePublicSharePresignedUrl,
} from "@/api/publicShareLinkApi.js";

const route = useRoute();
const router = useRouter();

const token = computed(() => String(route.params.token || "").trim());
const meta = ref(null);
const passwordInput = ref("");
const isLoading = ref(true);
const isDownloading = ref(false);
const errorMessage = ref("");
const downloadError = ref("");
const lastPresignedUrl = ref("");
const remainingSeconds = ref(0);
let countdownTimer = null;

const stopTimer = () => {
  if (countdownTimer) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }
};

const syncCountdown = (seconds) => {
  stopTimer();
  remainingSeconds.value = Math.max(0, Number(seconds || 0));
  if (remainingSeconds.value <= 0) {
    return;
  }
  countdownTimer = setInterval(() => {
    if (remainingSeconds.value > 0) {
      remainingSeconds.value -= 1;
    } else {
      stopTimer();
      if (meta.value && meta.value.status === "ACTIVE") {
        meta.value = { ...meta.value, status: "EXPIRED", downloadable: false };
      }
    }
  }, 1000);
};

const loadMetadata = async () => {
  if (!token.value) {
    isLoading.value = false;
    errorMessage.value = "유효하지 않은 다운로드 링크입니다.";
    return;
  }
  isLoading.value = true;
  errorMessage.value = "";
  downloadError.value = "";
  try {
    const data = await fetchPublicShareLinkMeta(token.value);
    meta.value = data;
    syncCountdown(data?.remainingSeconds ?? 0);
  } catch (error) {
    meta.value = null;
    stopTimer();
    errorMessage.value =
      error?.response?.data?.message || error?.message || "다운로드 링크 정보를 불러오지 못했습니다.";
  } finally {
    isLoading.value = false;
  }
};

const triggerBrowserDownload = (url, fileName) => {
  const link = document.createElement("a");
  link.href = url;
  if (fileName) {
    link.download = fileName;
  }
  link.rel = "noopener noreferrer";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

const handleDownload = async () => {
  if (!meta.value || !meta.value.downloadable || isDownloading.value) {
    return;
  }
  if (meta.value.passwordProtected && !String(passwordInput.value || "").trim()) {
    downloadError.value = "다운로드하려면 비밀번호를 입력해 주세요.";
    return;
  }

  isDownloading.value = true;
  downloadError.value = "";
  try {
    const issued = await issuePublicSharePresignedUrl(token.value, passwordInput.value.trim());
    lastPresignedUrl.value = issued?.presignedUrl || "";

    if (meta.value) {
      meta.value = {
        ...meta.value,
        downloadCount: issued?.downloadCount ?? meta.value.downloadCount + 1,
        remainingDownloads: issued?.remainingDownloads ?? meta.value.remainingDownloads,
        status: issued?.status ?? meta.value.status,
        downloadable: (issued?.status || "ACTIVE") === "ACTIVE" && remainingSeconds.value > 0,
      };
    }

    if (issued?.presignedUrl) {
      triggerBrowserDownload(issued.presignedUrl, issued.fileName || meta.value?.fileName);
    }
  } catch (error) {
    downloadError.value =
      error?.response?.data?.message || error?.message || "다운로드 URL 발급에 실패했습니다.";
    const code = error?.response?.data?.code;
    if ([7402, 7403, 7404, 7407].includes(code)) {
      await loadMetadata();
    }
  } finally {
    isDownloading.value = false;
  }
};

const formatFileSize = (bytes) => {
  const num = Number(bytes || 0);
  if (!Number.isFinite(num) || num <= 0) return "크기 정보 없음";
  if (num < 1024) return `${num} B`;
  if (num < 1024 * 1024) return `${(num / 1024).toFixed(1)} KB`;
  if (num < 1024 * 1024 * 1024) return `${(num / (1024 * 1024)).toFixed(1)} MB`;
  return `${(num / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

const formattedCountdown = computed(() => {
  const total = Math.max(0, Number(remainingSeconds.value || 0));
  if (total <= 0) return "만료됨";
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (days > 0) return `${days}일 ${hours}시간 남음`;
  if (hours > 0) return `${hours}시간 ${mins}분 ${secs}초 남음`;
  if (mins > 0) return `${mins}분 ${secs}초 남음`;
  return `${secs}초 남음`;
});

const statusDescription = computed(() => {
  const status = meta.value?.status;
  if (status === "ACTIVE") return "현재 다운로드 가능한 링크입니다.";
  if (status === "EXHAUSTED") return "설정된 다운로드 허용 횟수를 모두 사용했습니다.";
  if (status === "EXPIRED") return "설정된 유효 시간이 지나 링크가 만료되었습니다.";
  if (status === "REVOKED") return "파일 소유자에 의해 공유가 중단된 링크입니다.";
  if (status === "UNAVAILABLE") return "파일이 삭제되었거나 잠금 상태로 다운로드할 수 없습니다.";
  return "";
});

onMounted(loadMetadata);
watch(token, loadMetadata);
onBeforeUnmount(stopTimer);
</script>

<template>
  <main class="flex min-h-screen items-center justify-center bg-[var(--bg-main)] px-4 py-10 text-[var(--text-main)]">
    <div class="w-full max-w-lg rounded-3xl border border-[var(--border-color)] bg-[var(--bg-elevated)] p-6 shadow-2xl sm:p-8">
      <div class="flex items-center justify-between gap-3 border-b border-[var(--border-color)] pb-4">
        <div class="flex items-center gap-2.5">
          <BrandLogoIcon class="h-10 w-10 shrink-0 rounded-[10px] shadow-md shadow-sky-500/20" />
          <div>
            <p class="text-[11px] font-extrabold uppercase tracking-wider text-sky-500">FileInNOut</p>
            <h1 class="text-base font-extrabold">보안 다운로드 링크</h1>
          </div>
        </div>
        <button
          type="button"
          class="rounded-xl border border-[var(--border-color)] px-3 py-1.5 text-xs font-bold text-[var(--text-muted)] hover:text-[var(--text-main)]"
          @click="router.push('/')"
        >
          홈으로
        </button>
      </div>

      <div v-if="isLoading" class="flex flex-col items-center gap-3 py-14 text-sm font-semibold text-[var(--text-muted)]">
        <i class="fa-solid fa-spinner fa-spin text-2xl text-sky-500"></i>
        <span>다운로드 링크 정보를 확인하고 있습니다...</span>
      </div>

      <div v-else-if="errorMessage" class="space-y-4 py-10 text-center">
        <div class="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-rose-500/15 text-rose-500">
          <i class="fa-solid fa-link-slash text-xl"></i>
        </div>
        <p class="text-base font-extrabold">링크를 열 수 없습니다</p>
        <p class="text-sm text-[var(--text-muted)]">{{ errorMessage }}</p>
      </div>

      <div v-else-if="meta" class="mt-6 space-y-5">
        <div class="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-input)]/70 p-4">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <p class="truncate text-lg font-extrabold text-[var(--text-main)]">{{ meta.fileName }}</p>
              <p class="mt-1 text-xs font-semibold text-[var(--text-muted)]">
                {{ formatFileSize(meta.fileSize) }}
                <span v-if="meta.fileFormat"> · {{ String(meta.fileFormat).toUpperCase() }}</span>
                <span v-if="meta.ownerName"> · 공유자: {{ meta.ownerName }}</span>
              </p>
            </div>
            <span
              class="shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-extrabold"
              :class="
                meta.downloadable
                  ? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-600 dark:text-emerald-300'
                  : 'border-rose-500/30 bg-rose-500/15 text-rose-600 dark:text-rose-300'
              "
            >
              {{ meta.downloadable ? "다운로드 가능" : "다운로드 불가" }}
            </span>
          </div>

          <div class="mt-4 grid grid-cols-2 gap-2.5 text-xs">
            <div class="rounded-xl border border-[var(--border-color)] bg-[var(--bg-elevated)] p-3">
              <p class="text-[11px] font-semibold text-[var(--text-muted)]">남은 유효 시간</p>
              <p class="mt-1 font-extrabold text-[var(--text-main)]">{{ formattedCountdown }}</p>
            </div>
            <div class="rounded-xl border border-[var(--border-color)] bg-[var(--bg-elevated)] p-3">
              <p class="text-[11px] font-semibold text-[var(--text-muted)]">남은 다운로드 횟수</p>
              <p class="mt-1 font-extrabold text-[var(--text-main)]">
                {{
                  meta.maxDownloads == null
                    ? `무제한 (${meta.downloadCount}회 완료)`
                    : `${meta.remainingDownloads} / ${meta.maxDownloads}회`
                }}
              </p>
            </div>
          </div>
        </div>

        <p
          class="rounded-xl px-3.5 py-2.5 text-xs font-bold"
          :class="
            meta.downloadable
              ? 'bg-sky-500/10 text-sky-600 dark:text-sky-300'
              : 'bg-rose-500/10 text-rose-600 dark:text-rose-300'
          "
        >
          {{ statusDescription }}
        </p>

        <form v-if="meta.downloadable" class="space-y-3" @submit.prevent="handleDownload">
          <div v-if="meta.passwordProtected" class="space-y-1.5">
            <label class="block text-xs font-extrabold text-[var(--text-muted)]">비밀번호 입력</label>
            <input
              v-model="passwordInput"
              type="password"
              autocomplete="current-password"
              placeholder="공유자가 설정한 비밀번호를 입력하세요"
              class="w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-input)] px-3.5 py-2.5 text-sm outline-none focus:border-sky-500"
            />
          </div>

          <div
            v-if="downloadError"
            class="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3.5 py-2.5 text-xs font-bold text-rose-500"
          >
            {{ downloadError }}
          </div>

          <button
            type="submit"
            class="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-sky-600 px-5 py-3.5 text-sm font-extrabold text-white shadow-lg shadow-sky-600/20 transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-60"
            :disabled="isDownloading"
          >
            <i :class="isDownloading ? 'fa-solid fa-spinner fa-spin' : 'fa-solid fa-download'"></i>
            <span>{{ isDownloading ? "Presigned URL 생성 중..." : "파일 다운로드" }}</span>
          </button>
        </form>

        <div
          v-if="lastPresignedUrl"
          class="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-center text-xs font-semibold text-emerald-600 dark:text-emerald-300"
        >
          <p>Presigned URL이 발급되어 다운로드를 시작했습니다.</p>
          <a
            :href="lastPresignedUrl"
            rel="noopener noreferrer"
            class="mt-1 inline-block font-extrabold underline"
          >
            다운로드가 자동으로 시작되지 않으면 여기를 클릭하세요
          </a>
        </div>
      </div>
    </div>
  </main>
</template>
