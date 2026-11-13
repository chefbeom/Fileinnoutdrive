<template>
  <Teleport to="body">
    <div
      v-if="dialog.open"
      class="fixed inset-0 z-[1200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      @click.self="handleCancel"
    >
      <div
        class="w-full max-w-md max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-2xl border border-[var(--border-color)] bg-[var(--bg-secondary)] shadow-2xl"
        role="dialog"
        aria-modal="true"
      >
        <div class="px-5 py-4 border-b border-[var(--border-color)] flex items-center justify-between gap-3">
          <div class="flex items-center gap-2.5 min-w-0">
            <span class="w-9 h-9 rounded-xl bg-indigo-500/15 text-indigo-400 flex items-center justify-center shrink-0">
              <i class="fa-solid fa-eye-slash text-sm"></i>
            </span>
            <div class="min-w-0">
              <h3 class="text-sm font-bold text-[var(--text-main)] truncate">
                {{ dialog.mode === "create" ? "비밀 폴더 생성 (숨김)" : "비밀 폴더 숨김 및 PIN 설정" }}
              </h3>
              <p class="text-[11px] text-[var(--text-muted)] truncate">
                평소에는 보이지 않으며 H 키를 눌러 표시합니다.
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
          <div v-if="dialog.mode === 'create'">
            <label class="block text-xs font-semibold text-[var(--text-main)] mb-1.5">
              비밀 폴더 이름
            </label>
            <input
              ref="nameInputRef"
              v-model="folderName"
              type="text"
              maxlength="100"
              placeholder="예: 개인 서류"
              class="w-full px-3.5 py-2.5 rounded-xl border border-[var(--border-color)] bg-[var(--bg-input)] text-sm text-[var(--text-main)] focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div
            v-if="dialog.mode === 'configure'"
            class="flex items-center justify-between gap-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-main)] px-3.5 py-3"
          >
            <div>
              <p class="text-xs font-semibold text-[var(--text-main)]">숨긴 폴더로 설정</p>
              <p class="text-[11px] text-[var(--text-muted)]">해제하면 일반 폴더처럼 항상 보입니다.</p>
            </div>
            <input v-model="hidden" type="checkbox" class="w-4 h-4 accent-indigo-500 cursor-pointer" />
          </div>

          <div
            v-if="hidden"
            class="rounded-xl border border-[var(--border-color)] bg-[var(--bg-main)] p-3.5 space-y-3"
          >
            <label class="flex items-center justify-between gap-3 cursor-pointer select-none">
              <div>
                <p class="text-xs font-semibold text-[var(--text-main)]">4자리 PIN 비밀번호 보호 (선택사항)</p>
                <p class="text-[11px] text-[var(--text-muted)]">
                  설정하지 않으면 H 키로 표시한 뒤 바로 열 수 있습니다.
                </p>
              </div>
              <input v-model="pinEnabled" type="checkbox" class="w-4 h-4 accent-amber-500 cursor-pointer" />
            </label>

            <div v-if="pinEnabled" class="space-y-2.5 pt-2 border-t border-[var(--border-color)]">
              <div v-if="dialog.mode === 'configure' && dialog.hasExistingPin">
                <label class="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
                  현재 PIN (4자리)
                </label>
                <input
                  v-model="currentPin"
                  type="password"
                  inputmode="numeric"
                  maxlength="4"
                  placeholder="현재 4자리 PIN"
                  class="w-full px-3 py-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-input)] text-sm text-[var(--text-main)] focus:outline-none focus:border-amber-500"
                  @input="currentPin = sanitizePin(currentPin)"
                />
              </div>

              <label
                v-if="dialog.mode === 'create'"
                class="flex items-center gap-2 text-xs text-[var(--text-secondary)] cursor-pointer select-none"
              >
                <input v-model="registerLater" type="checkbox" class="accent-amber-500" />
                <span>첫 폴더 접근 시 4자리 PIN 번호 등록하기</span>
              </label>

              <template v-if="!registerLater">
                <div>
                  <label class="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
                    {{ dialog.mode === "configure" && dialog.hasExistingPin ? "새 PIN (변경 시만 입력)" : "4자리 PIN 번호" }}
                  </label>
                  <input
                    v-model="pin"
                    type="password"
                    inputmode="numeric"
                    maxlength="4"
                    placeholder="숫자 4자리"
                    class="w-full px-3 py-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-input)] text-sm text-[var(--text-main)] focus:outline-none focus:border-amber-500"
                    @input="pin = sanitizePin(pin)"
                  />
                </div>
                <div v-if="pin || dialog.mode === 'create'">
                  <label class="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
                    PIN 번호 확인
                  </label>
                  <input
                    v-model="confirmPin"
                    type="password"
                    inputmode="numeric"
                    maxlength="4"
                    placeholder="숫자 4자리 다시 입력"
                    class="w-full px-3 py-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-input)] text-sm text-[var(--text-main)] focus:outline-none focus:border-amber-500"
                    @input="confirmPin = sanitizePin(confirmPin)"
                  />
                </div>
              </template>
            </div>
          </div>

          <div
            v-if="(!hidden || !pinEnabled) && dialog.mode === 'configure' && dialog.hasExistingPin"
          >
            <label class="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
              현재 PIN 확인 (숨김/PIN 해제)
            </label>
            <input
              v-model="currentPin"
              type="password"
              inputmode="numeric"
              maxlength="4"
              placeholder="현재 4자리 PIN"
              class="w-full px-3 py-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-input)] text-sm text-[var(--text-main)] focus:outline-none focus:border-amber-500"
              @input="currentPin = sanitizePin(currentPin)"
            />
          </div>

          <div
            v-if="dialog.errorMessage"
            class="px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-500 font-medium"
          >
            {{ dialog.errorMessage }}
          </div>

          <div class="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              class="px-4 py-2 rounded-xl border border-[var(--border-color)] text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-input)] transition-colors"
              :disabled="dialog.loading"
              @click="handleCancel"
            >
              취소
            </button>
            <button
              type="submit"
              class="px-4 py-2 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-semibold transition-colors disabled:opacity-50"
              :disabled="dialog.loading"
            >
              {{ dialog.loading ? "저장 중..." : (dialog.mode === "create" ? "비밀 폴더 생성" : "설정 저장") }}
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
const dialog = computed(() => secretFolderStore.folderDialog);

const folderName = ref("");
const hidden = ref(true);
const pinEnabled = ref(false);
const registerLater = ref(false);
const pin = ref("");
const confirmPin = ref("");
const currentPin = ref("");
const nameInputRef = ref(null);

const sanitizePin = (value) => String(value || "").replace(/\D/g, "").slice(0, 4);

watch(
  () => dialog.value.open,
  async (open) => {
    if (!open) return;
    folderName.value = dialog.value.initialName || "";
    hidden.value = Boolean(dialog.value.hidden ?? true);
    pinEnabled.value = Boolean(dialog.value.pinEnabled ?? false);
    registerLater.value = false;
    pin.value = "";
    confirmPin.value = "";
    currentPin.value = "";
    await nextTick();
    if (dialog.value.mode === "create") {
      nameInputRef.value?.focus();
    }
  },
);

const handleSubmit = async () => {
  await secretFolderStore.submitFolderDialog({
    folderName: folderName.value,
    hidden: hidden.value,
    pinEnabled: pinEnabled.value,
    pin: pin.value,
    confirmPin: confirmPin.value,
    currentPin: currentPin.value,
    registerLater: registerLater.value,
  });
};

const handleCancel = () => {
  secretFolderStore.cancelFolderDialog();
};

const handleKeydown = (event) => {
  if (event.key === "Escape" && dialog.value.open) {
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
