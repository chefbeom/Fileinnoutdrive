<template>
  <Teleport to="body">
    <div
      v-if="modal.open"
      class="fixed inset-0 z-[1200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      @click.self="handleCancel"
    >
      <div
        class="w-full max-w-sm max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-2xl border border-[var(--border-color)] bg-[var(--bg-secondary)] shadow-2xl"
        role="dialog"
        aria-modal="true"
      >
        <div class="px-5 py-4 border-b border-[var(--border-color)] flex items-center justify-between gap-3">
          <div class="flex items-center gap-2.5 min-w-0">
            <span class="w-9 h-9 rounded-xl bg-amber-500/15 text-amber-500 flex items-center justify-center shrink-0">
              <i class="fa-solid fa-key text-sm"></i>
            </span>
            <div class="min-w-0">
              <h3 class="text-sm font-bold text-[var(--text-main)] truncate">
                {{ modal.title }}
              </h3>
              <p class="text-[11px] text-[var(--text-muted)] truncate">
                숫자 4자리 PIN 인증
              </p>
            </div>
          </div>
          <button
            type="button"
            class="w-8 h-8 rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-input)] hover:text-[var(--text-main)] transition-colors"
            @click="handleCancel"
          >
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>

        <form class="p-5 space-y-4" @submit.prevent="handleSubmit">
          <p v-if="modal.description" class="text-xs leading-relaxed text-[var(--text-secondary)]">
            {{ modal.description }}
          </p>

          <div v-if="isChangeMode">
            <label class="block text-xs font-semibold text-[var(--text-main)] mb-1.5">
              현재 PIN (4자리)
            </label>
            <input
              ref="currentPinInputRef"
              v-model="currentPin"
              :type="showPins ? 'text' : 'password'"
              inputmode="numeric"
              pattern="[0-9]*"
              maxlength="4"
              autocomplete="off"
              placeholder="••••"
              class="w-full px-3.5 py-2.5 rounded-xl border border-[var(--border-color)] bg-[var(--bg-input)] text-center text-lg font-bold tracking-[0.6em] text-[var(--text-main)] focus:outline-none focus:border-amber-500"
              @input="currentPin = sanitizePin(currentPin)"
            />
          </div>

          <div>
            <label class="block text-xs font-semibold text-[var(--text-main)] mb-1.5">
              {{ pinFieldLabel }}
            </label>
            <input
              ref="pinInputRef"
              v-model="pin"
              :type="showPins ? 'text' : 'password'"
              inputmode="numeric"
              pattern="[0-9]*"
              maxlength="4"
              autocomplete="off"
              placeholder="••••"
              class="w-full px-3.5 py-2.5 rounded-xl border border-[var(--border-color)] bg-[var(--bg-input)] text-center text-lg font-bold tracking-[0.6em] text-[var(--text-main)] focus:outline-none focus:border-amber-500"
              @input="pin = sanitizePin(pin)"
            />
          </div>

          <div v-if="needsConfirm">
            <label class="block text-xs font-semibold text-[var(--text-main)] mb-1.5">
              PIN 번호 확인 (4자리)
            </label>
            <input
              v-model="confirmPin"
              :type="showPins ? 'text' : 'password'"
              inputmode="numeric"
              pattern="[0-9]*"
              maxlength="4"
              autocomplete="off"
              placeholder="••••"
              class="w-full px-3.5 py-2.5 rounded-xl border border-[var(--border-color)] bg-[var(--bg-input)] text-center text-lg font-bold tracking-[0.6em] text-[var(--text-main)] focus:outline-none focus:border-amber-500"
              @input="confirmPin = sanitizePin(confirmPin)"
            />
          </div>

          <div class="flex items-center justify-between text-xs">
            <label class="inline-flex items-center gap-1.5 text-[var(--text-secondary)] cursor-pointer select-none">
              <input v-model="showPins" type="checkbox" class="rounded border-[var(--border-color)] accent-amber-500" />
              <span>번호 표시</span>
            </label>
            <span class="text-[11px] text-[var(--text-muted)]">4자리 숫자</span>
          </div>

          <div
            v-if="modal.errorMessage"
            class="px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-500 font-medium"
          >
            {{ modal.errorMessage }}
          </div>

          <div class="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              class="px-4 py-2 rounded-xl border border-[var(--border-color)] text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-input)] transition-colors"
              :disabled="modal.loading"
              @click="handleCancel"
            >
              취소
            </button>
            <button
              type="submit"
              class="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold transition-colors disabled:opacity-50"
              :disabled="modal.loading"
            >
              {{ modal.loading ? "확인 중..." : submitLabel }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useSecretFolderStore } from "@/stores/useSecretFolderStore.js";

const secretFolderStore = useSecretFolderStore();
const modal = computed(() => secretFolderStore.pinModal);

const currentPin = ref("");
const pin = ref("");
const confirmPin = ref("");
const showPins = ref(false);
const pinInputRef = ref(null);
const currentPinInputRef = ref(null);

const isChangeMode = computed(() => modal.value.mode === "vault-change");
const needsConfirm = computed(() =>
  modal.value.mode === "vault-register" ||
  modal.value.mode === "folder-register" ||
  modal.value.mode === "vault-change",
);
const pinFieldLabel = computed(() => {
  if (modal.value.mode === "vault-change") return "새 PIN (4자리)";
  if (modal.value.mode === "vault-register" || modal.value.mode === "folder-register") {
    return "등록할 PIN (4자리)";
  }
  return "PIN 번호 (4자리)";
});
const submitLabel = computed(() => {
  if (modal.value.mode === "vault-register" || modal.value.mode === "folder-register") {
    return "PIN 등록 및 열기";
  }
  if (modal.value.mode === "vault-change") {
    return "PIN 변경";
  }
  return "확인";
});

const sanitizePin = (value) => String(value || "").replace(/\D/g, "").slice(0, 4);

const resetFields = () => {
  currentPin.value = "";
  pin.value = "";
  confirmPin.value = "";
  showPins.value = false;
};

watch(
  () => modal.value.open,
  async (open) => {
    resetFields();
    if (!open) return;
    await nextTick();
    if (isChangeMode.value) {
      currentPinInputRef.value?.focus();
    } else {
      pinInputRef.value?.focus();
    }
  },
);

const handleSubmit = async () => {
  await secretFolderStore.submitPinModal({
    currentPin: currentPin.value,
    pin: pin.value,
    confirmPin: confirmPin.value,
  });
};

const handleCancel = () => {
  secretFolderStore.cancelPinModal();
};

const handleKeydown = (event) => {
  if (event.key === "Escape" && modal.value.open) {
    event.preventDefault();
    handleCancel();
  }
};

onMounted(() => {
  window.addEventListener("keydown", handleKeydown);
});

onBeforeUnmount(() => {
  window.removeEventListener("keydown", handleKeydown);
});
</script>
