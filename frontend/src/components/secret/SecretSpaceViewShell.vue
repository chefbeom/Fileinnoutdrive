<script setup>
import { computed, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { useFileStore } from "@/stores/useFileStore.js";
import { useMediaPhotoStore } from "@/stores/useMediaPhotoStore.js";
import { useSecretFolderStore } from "@/stores/useSecretFolderStore.js";

const props = defineProps({
  mode: {
    type: String,
    required: true, // 'media' | 'photos' | 'favorites'
  },
});

const router = useRouter();
const fileStore = useFileStore();
const mediaPhotoStore = useMediaPhotoStore();
const secretFolderStore = useSecretFolderStore();

const isUnlockPrompting = ref(false);
const wasVaultReadyOnMount = ref(false);

const isVaultReady = computed(() =>
  Boolean(secretFolderStore.vaultMode && secretFolderStore.vaultUnlocked),
);

const spaceTitle = computed(() => {
  if (props.mode === "favorites") return "비밀 즐겨찾기";
  if (props.mode === "photos") return "비밀 사진첩";
  return "비밀 미디어";
});
const peerRouteName = computed(() => (props.mode === "photos" ? "secretMedia" : "secretPhotos"));
const peerButtonLabel = computed(() => (props.mode === "photos" ? "비밀 미디어" : "비밀 사진첩"));
const peerButtonIcon = computed(() => (props.mode === "photos" ? "fa-solid fa-clapperboard" : "fa-solid fa-images"));

const handleRequestUnlock = async () => {
  if (isUnlockPrompting.value) return;
  isUnlockPrompting.value = true;
  try {
    await secretFolderStore.openVaultAccess();
  } finally {
    isUnlockPrompting.value = false;
  }
};

const handleGoVaultFiles = () => {
  secretFolderStore.setVaultTrashView(false);
  fileStore.navigateToFolder(null);
  router.push({ name: "home" });
};

const handleGoPeerSecretView = () => {
  router.push({ name: peerRouteName.value });
};

const handleLockAndExit = () => {
  secretFolderStore.exitVaultMode({ lockVault: true });
  mediaPhotoStore.clearVaultMediaSession?.();
  fileStore.navigateToFolder(null);
  router.push({ name: "home" });
};

watch(
  isVaultReady,
  (ready, prevReady) => {
    if (ready) {
      wasVaultReadyOnMount.value = true;
    } else if (prevReady && wasVaultReadyOnMount.value) {
      router.replace({ name: "home" }).catch(() => {});
    }
  },
  { flush: "post" },
);

onMounted(async () => {
  if (isVaultReady.value) {
    wasVaultReadyOnMount.value = true;
    return;
  }
  await handleRequestUnlock();
});
</script>

<template>
  <div class="secret-space-shell space-y-4">
    <template v-if="isVaultReady">
      <div
        data-testid="secret-space-banner"
        class="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-300/70 bg-amber-50/85 px-4 py-3 text-xs text-amber-950 shadow-sm dark:border-amber-500/35 dark:bg-amber-950/35 dark:text-amber-100"
      >
        <div class="flex min-w-0 items-center gap-2.5">
          <span class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-amber-500/20 text-amber-700 dark:text-amber-300">
            <i class="fa-solid fa-shield-halved"></i>
          </span>
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <strong class="text-xs font-black">{{ spaceTitle }} · 자체 비밀 공간</strong>
              <span class="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-extrabold text-amber-800 dark:text-amber-200">
                PIN 잠금 보호
              </span>
            </div>
            <p class="mt-0.5 text-[11px] font-medium text-amber-900/80 dark:text-amber-200/80">
              비밀 공간 전용 라이브러리입니다. 일반 홈·최근 문서·일반 미디어·일반 사진첩에 노출되지 않습니다.
            </p>
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <button
            type="button"
            data-testid="secret-go-files"
            class="inline-flex items-center gap-1.5 rounded-xl border border-amber-400/60 bg-white/90 px-3 py-1.5 text-xs font-bold text-amber-900 transition hover:bg-white dark:border-amber-500/40 dark:bg-slate-900/70 dark:text-amber-200 dark:hover:bg-slate-900"
            @click="handleGoVaultFiles"
          >
            <i class="fa-solid fa-folder-open"></i>
            <span>비밀 파일로</span>
          </button>

          <button
            v-if="mode !== 'favorites'"
            type="button"
            data-testid="secret-go-favorites"
            class="inline-flex items-center gap-1.5 rounded-xl border border-amber-400/60 bg-amber-500/15 px-3 py-1.5 text-xs font-bold text-amber-900 transition hover:bg-amber-500/25 dark:border-amber-500/40 dark:text-amber-200"
            @click="router.push({ name: 'secretFavorites' })"
          >
            <i class="fa-solid fa-star text-amber-500"></i>
            <span>비밀 즐겨찾기</span>
          </button>

          <button
            v-if="mode !== 'favorites'"
            type="button"
            data-testid="secret-go-peer"
            class="inline-flex items-center gap-1.5 rounded-xl border border-amber-400/60 bg-amber-500/15 px-3 py-1.5 text-xs font-bold text-amber-900 transition hover:bg-amber-500/25 dark:border-amber-500/40 dark:text-amber-200"
            @click="handleGoPeerSecretView"
          >
            <i :class="peerButtonIcon"></i>
            <span>{{ peerButtonLabel }}</span>
          </button>

          <template v-else>
            <button
              type="button"
              data-testid="secret-go-media"
              class="inline-flex items-center gap-1.5 rounded-xl border border-amber-400/60 bg-amber-500/15 px-3 py-1.5 text-xs font-bold text-amber-900 transition hover:bg-amber-500/25 dark:border-amber-500/40 dark:text-amber-200"
              @click="router.push({ name: 'secretMedia' })"
            >
              <i class="fa-solid fa-clapperboard"></i>
              <span>비밀 미디어</span>
            </button>
            <button
              type="button"
              data-testid="secret-go-photos"
              class="inline-flex items-center gap-1.5 rounded-xl border border-amber-400/60 bg-amber-500/15 px-3 py-1.5 text-xs font-bold text-amber-900 transition hover:bg-amber-500/25 dark:border-amber-500/40 dark:text-amber-200"
              @click="router.push({ name: 'secretPhotos' })"
            >
              <i class="fa-solid fa-images"></i>
              <span>비밀 사진첩</span>
            </button>
          </template>

          <button
            type="button"
            class="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            @click="secretFolderStore.openChangeVaultPinModal()"
          >
            <i class="fa-solid fa-key"></i>
            <span>PIN 변경</span>
          </button>

          <button
            type="button"
            data-testid="secret-lock-exit"
            class="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-slate-800 dark:bg-blue-600 dark:hover:bg-blue-500"
            @click="handleLockAndExit"
          >
            <i class="fa-solid fa-lock"></i>
            <span>일반 홈으로 · 잠금</span>
          </button>
        </div>
      </div>

      <slot />
    </template>

    <div
      v-else
      data-testid="secret-space-locked-gate"
      class="mx-auto mt-10 max-w-lg rounded-3xl border border-amber-400/40 bg-[var(--bg-elevated)] p-8 text-center shadow-lg"
    >
      <div class="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-500">
        <i class="fa-solid fa-vault text-2xl"></i>
      </div>
      <h2 class="mt-4 text-lg font-black text-[var(--text-main)]">
        {{ spaceTitle }} 잠금 상태
      </h2>
      <p class="mt-1.5 text-xs text-[var(--text-muted)]">
        {{
          mode === "photos"
            ? "비밀 사진첩은 자체 비밀 폴더 PIN 인증을 완료한 뒤 비밀 공간 안에서만 작동합니다."
            : "비밀 미디어는 자체 비밀 폴더 PIN 인증을 완료한 뒤 비밀 공간 안에서만 작동합니다."
        }}
      </p>
      <div class="mt-6 flex flex-wrap justify-center gap-2.5">
        <button
          type="button"
          data-testid="secret-gate-unlock-btn"
          class="inline-flex items-center gap-2 rounded-2xl bg-amber-600 px-4 py-2.5 text-xs font-extrabold text-white shadow-sm transition hover:bg-amber-500"
          :disabled="isUnlockPrompting"
          @click="handleRequestUnlock"
        >
          <i class="fa-solid fa-unlock-keyhole"></i>
          <span>PIN 입력해 비밀 공간 열기</span>
        </button>
        <button
          type="button"
          class="inline-flex items-center gap-2 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-main)] px-4 py-2.5 text-xs font-bold text-[var(--text-secondary)] transition hover:bg-[var(--bg-input)] hover:text-[var(--text-main)]"
          @click="handleLockAndExit"
        >
          <span>일반 홈으로</span>
        </button>
      </div>
    </div>
  </div>
</template>
