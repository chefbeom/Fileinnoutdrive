<script setup>
import { computed } from "vue";
import {
  DOWNLOAD_LIMIT_PRESET_OPTIONS,
  DURATION_PRESET_OPTIONS,
} from "@/components/useDownloadShareLinkDialog.js";

const props = defineProps({
  open: {
    type: Boolean,
    default: false,
  },
  targetFile: {
    type: Object,
    default: null,
  },
  durationMode: {
    type: String,
    default: "30",
  },
  customMinutes: {
    type: [Number, String],
    default: 30,
  },
  customExpiresAt: {
    type: String,
    default: "",
  },
  limitMode: {
    type: String,
    default: "1",
  },
  customMaxDownloads: {
    type: [Number, String],
    default: 1,
  },
  password: {
    type: String,
    default: "",
  },
  resolvedDurationMinutes: {
    type: Number,
    default: 30,
  },
  resolvedMaxDownloads: {
    type: Number,
    default: 1,
  },
  issuedLink: {
    type: Object,
    default: null,
  },
  existingLinks: {
    type: Array,
    default: () => [],
  },
  isLoadingLinks: {
    type: Boolean,
    default: false,
  },
  isCreating: {
    type: Boolean,
    default: false,
  },
  revokingLinkIdx: {
    type: [Number, String],
    default: null,
  },
  errorMessage: {
    type: String,
    default: "",
  },
  copiedKey: {
    type: String,
    default: "",
  },
  getSharePageUrl: {
    type: Function,
    required: true,
  },
  getDirectDownloadUrl: {
    type: Function,
    required: true,
  },
});

const emit = defineEmits([
  "close",
  "create",
  "revoke",
  "copy",
  "update:durationMode",
  "update:customMinutes",
  "update:customExpiresAt",
  "update:limitMode",
  "update:customMaxDownloads",
  "update:password",
]);

const fileDisplayName = computed(
  () => props.targetFile?.name || props.targetFile?.fileOriginName || "선택한 파일",
);

const policyPreviewText = computed(() => {
  const durationLabel =
    props.durationMode === "custom_datetime"
      ? (props.customExpiresAt ? `${props.customExpiresAt.replace("T", " ")}까지 유효` : "지정 만료 시각까지 유효")
      : `발급 시점부터 ${props.resolvedDurationMinutes || 0}분간 유효`;
  const countLabel =
    props.resolvedMaxDownloads === null
      ? "다운로드 횟수 무제한"
      : `최대 ${props.resolvedMaxDownloads}회 다운로드 가능`;
  const passwordLabel = String(props.password || "").trim() ? "비밀번호 보호 적용" : "비밀번호 없음";
  return `${durationLabel} · ${countLabel} · ${passwordLabel}`;
});

const formatDateTime = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatFileSize = (bytes) => {
  const num = Number(bytes || 0);
  if (!Number.isFinite(num) || num <= 0) return "";
  if (num < 1024) return `${num} B`;
  if (num < 1024 * 1024) return `${(num / 1024).toFixed(1)} KB`;
  if (num < 1024 * 1024 * 1024) return `${(num / (1024 * 1024)).toFixed(1)} MB`;
  return `${(num / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

const statusLabelMap = {
  ACTIVE: { text: "활성", cls: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 border-emerald-500/30" },
  EXHAUSTED: { text: "횟수 소진", cls: "bg-amber-500/15 text-amber-600 dark:text-amber-300 border-amber-500/30" },
  EXPIRED: { text: "기간 만료", cls: "bg-slate-500/15 text-slate-500 dark:text-slate-400 border-slate-500/30" },
  REVOKED: { text: "중단됨", cls: "bg-rose-500/15 text-rose-600 dark:text-rose-300 border-rose-500/30" },
  UNAVAILABLE: { text: "파일 불가", cls: "bg-rose-500/15 text-rose-600 dark:text-rose-300 border-rose-500/30" },
};

const resolveStatusBadge = (status) =>
  statusLabelMap[status] || { text: status || "-", cls: "bg-slate-500/15 text-slate-500 border-slate-500/30" };
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open && targetFile"
      class="fixed inset-0 z-[1300] flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-sm"
      @click.self="emit('close')"
    >
      <div class="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-[var(--border-color)] bg-[var(--bg-elevated)] text-[var(--text-main)] shadow-2xl">
        <!-- Header -->
        <div class="flex items-start justify-between gap-3 border-b border-[var(--border-color)] px-6 py-4">
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2">
              <span class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-sky-500/15 text-sky-500">
                <i class="fa-solid fa-link"></i>
              </span>
              <h2 class="truncate text-lg font-extrabold tracking-tight">다운로드 링크 공유 (Presigned URL)</h2>
            </div>
            <p class="mt-1 truncate text-xs font-semibold text-[var(--text-muted)]">
              {{ fileDisplayName }}
              <span v-if="targetFile.sizeBytes || targetFile.fileSize">
                · {{ formatFileSize(targetFile.sizeBytes || targetFile.fileSize) }}
              </span>
            </p>
          </div>
          <button
            type="button"
            class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[var(--text-muted)] transition hover:bg-[var(--bg-input)] hover:text-[var(--text-main)]"
            aria-label="닫기"
            @click="emit('close')"
          >
            <i class="fa-solid fa-xmark text-base"></i>
          </button>
        </div>

        <!-- Scrollable Body -->
        <div class="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <!-- Duration Picker -->
          <section class="space-y-2.5">
            <div class="flex items-center justify-between">
              <label class="text-xs font-extrabold uppercase tracking-wide text-[var(--text-muted)]">
                유효 시간 (발급 시점 기준)
              </label>
              <span class="text-[11px] font-semibold text-sky-500">최대 30일</span>
            </div>
            <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <button
                v-for="option in DURATION_PRESET_OPTIONS"
                :key="option.key"
                type="button"
                class="rounded-xl border px-3 py-2 text-xs font-bold transition"
                :class="
                  durationMode === option.key
                    ? 'border-sky-500 bg-sky-500/15 text-sky-600 dark:text-sky-300'
                    : 'border-[var(--border-color)] bg-[var(--bg-input)] text-[var(--text-main)] hover:border-sky-400/50'
                "
                @click="emit('update:durationMode', option.key)"
              >
                {{ option.label }}
              </button>
            </div>
            <div v-if="durationMode === 'custom_minutes'" class="flex items-center gap-2 pt-1">
              <input
                :value="customMinutes"
                type="number"
                min="1"
                max="43200"
                class="w-36 rounded-xl border border-[var(--border-color)] bg-[var(--bg-input)] px-3 py-2 text-sm font-bold outline-none focus:border-sky-500"
                @input="emit('update:customMinutes', $event.target.value)"
              />
              <span class="text-xs font-semibold text-[var(--text-muted)]">분 (예: 30분 = 30)</span>
            </div>
            <div v-else-if="durationMode === 'custom_datetime'" class="flex items-center gap-2 pt-1">
              <input
                :value="customExpiresAt"
                type="datetime-local"
                class="w-full max-w-xs rounded-xl border border-[var(--border-color)] bg-[var(--bg-input)] px-3 py-2 text-sm font-bold outline-none focus:border-sky-500"
                @input="emit('update:customExpiresAt', $event.target.value)"
              />
            </div>
          </section>

          <!-- Download Count Picker -->
          <section class="space-y-2.5">
            <div class="flex items-center justify-between">
              <label class="text-xs font-extrabold uppercase tracking-wide text-[var(--text-muted)]">
                최대 다운로드 횟수
              </label>
              <span class="text-[11px] font-semibold text-sky-500">선착순 차감</span>
            </div>
            <div class="grid grid-cols-3 gap-2 sm:grid-cols-6">
              <button
                v-for="option in DOWNLOAD_LIMIT_PRESET_OPTIONS"
                :key="option.key"
                type="button"
                class="rounded-xl border px-3 py-2 text-xs font-bold transition"
                :class="
                  limitMode === option.key
                    ? 'border-sky-500 bg-sky-500/15 text-sky-600 dark:text-sky-300'
                    : 'border-[var(--border-color)] bg-[var(--bg-input)] text-[var(--text-main)] hover:border-sky-400/50'
                "
                @click="emit('update:limitMode', option.key)"
              >
                {{ option.label }}
              </button>
            </div>
            <div v-if="limitMode === 'custom'" class="flex items-center gap-2 pt-1">
              <input
                :value="customMaxDownloads"
                type="number"
                min="1"
                max="10000"
                class="w-36 rounded-xl border border-[var(--border-color)] bg-[var(--bg-input)] px-3 py-2 text-sm font-bold outline-none focus:border-sky-500"
                @input="emit('update:customMaxDownloads', $event.target.value)"
              />
              <span class="text-xs font-semibold text-[var(--text-muted)]">회 (1~10,000회)</span>
            </div>
          </section>

          <!-- Optional Password -->
          <section class="space-y-2">
            <label class="block text-xs font-extrabold uppercase tracking-wide text-[var(--text-muted)]">
              링크 비밀번호 (선택)
            </label>
            <input
              :value="password"
              type="password"
              autocomplete="new-password"
              placeholder="비워두면 비밀번호 없이 링크로 바로 다운로드할 수 있습니다 (설정 시 4~64자)"
              class="w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-input)] px-3.5 py-2.5 text-sm outline-none focus:border-sky-500"
              @input="emit('update:password', $event.target.value)"
            />
          </section>

          <!-- Summary + Issue Button -->
          <div class="flex flex-col gap-3 rounded-2xl border border-sky-500/25 bg-sky-500/5 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div class="space-y-0.5">
              <p class="text-[11px] font-extrabold text-sky-600 dark:text-sky-300">발급 정책 미리보기</p>
              <p class="text-xs font-bold text-[var(--text-main)]">{{ policyPreviewText }}</p>
            </div>
            <button
              type="button"
              class="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-xs font-extrabold text-white shadow-sm transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-60"
              :disabled="isCreating"
              @click="emit('create')"
            >
              <i :class="isCreating ? 'fa-solid fa-spinner fa-spin' : 'fa-solid fa-wand-magic-sparkles'"></i>
              <span>{{ isCreating ? "발급 중..." : "다운로드 링크 발급" }}</span>
            </button>
          </div>

          <!-- Error -->
          <div
            v-if="errorMessage"
            class="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3.5 py-2.5 text-xs font-bold text-rose-500"
          >
            {{ errorMessage }}
          </div>

          <!-- Newly Issued Result -->
          <section
            v-if="issuedLink"
            class="space-y-3 rounded-2xl border border-emerald-500/35 bg-emerald-500/10 p-4"
          >
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div class="flex items-center gap-2 text-xs font-extrabold text-emerald-600 dark:text-emerald-300">
                <i class="fa-solid fa-circle-check"></i>
                <span>새 다운로드 링크가 발급되었습니다</span>
              </div>
              <span class="rounded-full border border-emerald-500/30 bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-bold text-emerald-600 dark:text-emerald-200">
                {{ issuedLink.maxDownloads == null ? "무제한" : `남은 ${issuedLink.remainingDownloads} / ${issuedLink.maxDownloads}회` }}
                · {{ formatDateTime(issuedLink.expiresAt) }} 만료
              </span>
            </div>

            <div class="space-y-2">
              <div class="flex flex-col gap-2 sm:flex-row">
                <input
                  :value="getSharePageUrl(issuedLink.token)"
                  type="text"
                  readonly
                  class="flex-1 rounded-xl border border-[var(--border-color)] bg-[var(--bg-elevated)] px-3 py-2 font-mono text-xs text-[var(--text-main)]"
                />
                <button
                  type="button"
                  class="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-extrabold text-white transition hover:bg-emerald-500"
                  @click="emit('copy', issuedLink.token, 'page', 'issued')"
                >
                  <i :class="copiedKey === `issued:page:${issuedLink.token}` ? 'fa-solid fa-check' : 'fa-regular fa-copy'"></i>
                  <span>{{ copiedKey === `issued:page:${issuedLink.token}` ? "복사됨" : "공유 링크 복사" }}</span>
                </button>
              </div>

              <div class="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[var(--text-muted)]">
                <span>메신저 미리보기에 횟수가 소진되지 않도록 공유 페이지 링크 복사를 권장합니다.</span>
                <div class="flex items-center gap-3">
                  <button
                    type="button"
                    class="font-bold text-sky-500 hover:underline"
                    @click="emit('copy', issuedLink.token, 'direct', 'issued')"
                  >
                    {{ copiedKey === `issued:direct:${issuedLink.token}` ? "직접 URL 복사됨 ✓" : "직접 다운로드 URL 복사" }}
                  </button>
                  <a
                    :href="getSharePageUrl(issuedLink.token)"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="font-bold text-emerald-500 hover:underline"
                  >
                    새 탭에서 열기
                  </a>
                </div>
              </div>
            </div>
          </section>

          <!-- Issued Link History -->
          <section class="space-y-2.5">
            <div class="flex items-center justify-between">
              <h3 class="text-xs font-extrabold uppercase tracking-wide text-[var(--text-muted)]">
                이 파일에 발급된 링크 ({{ existingLinks.length }})
              </h3>
              <span v-if="isLoadingLinks" class="text-[11px] font-semibold text-[var(--text-muted)]">불러오는 중...</span>
            </div>

            <div
              v-if="!isLoadingLinks && existingLinks.length === 0"
              class="rounded-2xl border border-dashed border-[var(--border-color)] px-4 py-5 text-center text-xs text-[var(--text-muted)]"
            >
              아직 발급된 다운로드 공유 링크가 없습니다.
            </div>

            <div v-else class="space-y-2">
              <div
                v-for="link in existingLinks"
                :key="link.idx"
                class="flex flex-col gap-2 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-input)]/70 p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div class="min-w-0 space-y-1">
                  <div class="flex flex-wrap items-center gap-1.5">
                    <span
                      class="rounded-full border px-2 py-0.5 text-[10px] font-extrabold"
                      :class="resolveStatusBadge(link.status).cls"
                    >
                      {{ resolveStatusBadge(link.status).text }}
                    </span>
                    <span class="text-xs font-bold text-[var(--text-main)]">
                      {{
                        link.maxDownloads == null
                          ? `다운로드 ${link.downloadCount}회 · 무제한`
                          : `다운로드 ${link.downloadCount} / ${link.maxDownloads}회`
                      }}
                    </span>
                    <span
                      v-if="link.passwordProtected"
                      class="rounded-md bg-slate-500/15 px-1.5 py-0.5 text-[10px] font-bold text-[var(--text-muted)]"
                    >
                      <i class="fa-solid fa-lock mr-1"></i>잠금
                    </span>
                  </div>
                  <p class="truncate text-[11px] text-[var(--text-muted)]">
                    만료: {{ formatDateTime(link.expiresAt) }}
                    <span v-if="link.lastDownloadedAt"> · 최근 다운로드: {{ formatDateTime(link.lastDownloadedAt) }}</span>
                  </p>
                </div>

                <div class="flex shrink-0 items-center gap-2">
                  <button
                    v-if="link.status === 'ACTIVE'"
                    type="button"
                    class="rounded-lg border border-[var(--border-color)] bg-[var(--bg-elevated)] px-2.5 py-1.5 text-[11px] font-bold text-[var(--text-main)] hover:border-sky-400"
                    @click="emit('copy', link.token, 'page', `list-${link.idx}`)"
                  >
                    {{ copiedKey === `list-${link.idx}:page:${link.token}` ? "복사됨 ✓" : "링크 복사" }}
                  </button>
                  <button
                    v-if="link.status === 'ACTIVE'"
                    type="button"
                    class="rounded-lg border border-rose-500/30 bg-rose-500/10 px-2.5 py-1.5 text-[11px] font-bold text-rose-500 hover:bg-rose-500/20 disabled:opacity-50"
                    :disabled="revokingLinkIdx === link.idx"
                    @click="emit('revoke', link.idx)"
                  >
                    {{ revokingLinkIdx === link.idx ? "중단 중..." : "중단" }}
                  </button>
                </div>
              </div>
            </div>
          </section>
        </div>

        <!-- Footer -->
        <div class="flex items-center justify-end border-t border-[var(--border-color)] px-6 py-3.5">
          <button
            type="button"
            class="rounded-xl border border-[var(--border-color)] bg-[var(--bg-input)] px-4 py-2 text-xs font-bold text-[var(--text-main)] hover:bg-[var(--bg-elevated)]"
            @click="emit('close')"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
