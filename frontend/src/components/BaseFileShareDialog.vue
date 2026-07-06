<script setup>
import { computed } from "vue";
import {
  formatBaseDisplayDate,
  formatBaseSharedFilesLabel,
  formatBaseSharePermissionLabel,
  formatBaseSharePolicyLabel,
} from "./baseFileViewModel.js";

const props = defineProps({
  targets: { type: Array, default: () => [] },
  email: { type: String, default: "" },
  permission: { type: String, default: "WRITE" },
  permissionOptions: { type: Array, default: () => [] },
  expiresAt: { type: String, default: "" },
  downloadLimit: { type: [String, Number], default: "" },
  password: { type: String, default: "" },
  cancelEmail: { type: String, default: "" },
  canCreateShares: { type: Boolean, default: false },
  isSharing: { type: Boolean, default: false },
  isOverviewLoading: { type: Boolean, default: false },
  overviewUsers: { type: Array, default: () => [] },
  overviewGroups: { type: Array, default: () => [] },
  targetUserIds: { type: Array, default: () => [] },
  targetGroupIds: { type: Array, default: () => [] },
  error: { type: String, default: "" },
  pendingInvites: { type: Array, default: () => [] },
  shareInfo: { type: Array, default: () => [] },
  isInfoLoading: { type: Boolean, default: false },
});

const emit = defineEmits([
  "update:email",
  "update:permission",
  "update:expiresAt",
  "update:downloadLimit",
  "update:password",
  "update:cancelEmail",
  "update:targetUserIds",
  "update:targetGroupIds",
  "submit",
  "cancel-share",
  "close",
]);

const emailModel = computed({
  get: () => props.email,
  set: (value) => emit("update:email", value),
});
const permissionModel = computed({
  get: () => props.permission,
  set: (value) => emit("update:permission", value),
});
const expiresAtModel = computed({
  get: () => props.expiresAt,
  set: (value) => emit("update:expiresAt", value),
});
const downloadLimitModel = computed({
  get: () => props.downloadLimit,
  set: (value) => emit("update:downloadLimit", value),
});
const passwordModel = computed({
  get: () => props.password,
  set: (value) => emit("update:password", value),
});
const cancelEmailModel = computed({
  get: () => props.cancelEmail,
  set: (value) => emit("update:cancelEmail", value),
});
const targetUserIdsModel = computed({
  get: () => props.targetUserIds,
  set: (value) => emit("update:targetUserIds", value),
});
const targetGroupIdsModel = computed({
  get: () => props.targetGroupIds,
  set: (value) => emit("update:targetGroupIds", value),
});

const title = computed(() => (
  props.targets.length === 1
    ? props.targets[0]?.name
    : `${props.targets.length}개 항목 선택`
));
const submitButtonLabel = computed(() => (props.isSharing ? "공유 중..." : "공유 적용"));
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 px-4" @click.self="emit('close')">
    <div class="w-full max-w-2xl rounded-3xl bg-white p-6 shadow-2xl">
      <div class="flex items-start justify-between gap-3">
        <div>
          <p class="text-xs font-semibold uppercase tracking-wide text-gray-400">파일/폴더 공유</p>
          <h3 class="mt-1 text-xl font-bold text-gray-900">{{ title }}</h3>
          <p class="mt-2 text-sm text-gray-500">상대방의 공유 문서함과 데스크톱 동기화 폴더에서 사용할 권한을 선택할 수 있습니다.</p>
        </div>
        <button type="button" class="rounded-full p-2 text-gray-400 transition hover:bg-slate-100 hover:text-gray-600" @click="emit('close')">
          <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18 18 6M6 6l12 12" /></svg>
        </button>
      </div>
      <div class="mt-5 grid gap-3 md:grid-cols-[minmax(0,1fr)_12rem_auto]">
        <input v-model="emailModel" type="email" class="file-filter__input" :disabled="!canCreateShares" :placeholder="canCreateShares ? '공유할 상대의 이메일' : '플러스 이상 멤버십에서 새 공유 추가 가능'" @keydown.enter.prevent="emit('submit')" />
        <select v-model="permissionModel" class="file-filter__input" :disabled="!canCreateShares">
          <option v-for="option in permissionOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
        </select>
        <button type="button" class="rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300" :disabled="isSharing || !canCreateShares" @click="emit('submit')">{{ submitButtonLabel }}</button>
      </div>
      <div class="mt-3 grid gap-3 md:grid-cols-3">
        <label class="block text-xs font-semibold text-gray-500">
          <span>만료일</span>
          <input v-model="expiresAtModel" type="datetime-local" class="file-filter__input mt-1" :disabled="!canCreateShares" />
        </label>
        <label class="block text-xs font-semibold text-gray-500">
          <span>다운로드 횟수 제한</span>
          <input v-model.number="downloadLimitModel" type="number" min="1" step="1" class="file-filter__input mt-1" :disabled="!canCreateShares" placeholder="제한 없음" />
        </label>
        <label class="block text-xs font-semibold text-gray-500">
          <span>공유 비밀번호</span>
          <input v-model="passwordModel" type="password" maxlength="128" class="file-filter__input mt-1" :disabled="!canCreateShares" placeholder="Optional" autocomplete="new-password" />
        </label>
      </div>
      <div class="mt-4 rounded-2xl border border-gray-200 p-4">
        <div class="flex items-center justify-between gap-2">
          <p class="text-sm font-semibold text-gray-900">대상 선택</p>
          <p class="text-xs text-gray-500">사용자, 그룹, 이메일을 함께 선택할 수 있습니다.</p>
        </div>
        <div v-if="isOverviewLoading" class="mt-4 rounded-2xl bg-slate-50 px-4 py-6 text-center text-sm text-gray-500">공유 대상을 불러오는 중입니다.</div>
        <div v-else class="mt-4 grid gap-4 lg:grid-cols-2">
          <div class="rounded-2xl bg-slate-50 p-4">
            <p class="text-sm font-semibold text-gray-900">사용자</p>
            <div v-if="overviewUsers.length" class="mt-3 space-y-2">
              <label v-for="relationship in overviewUsers" :key="relationship.relationshipId" class="flex items-start gap-3 rounded-2xl border border-white/70 bg-white px-3 py-3 text-sm text-gray-700">
                <input v-model="targetUserIdsModel" type="checkbox" :value="relationship.targetUser?.userId" class="mt-1" />
                <span class="flex flex-col">
                  <strong class="text-gray-900">{{ relationship.targetUser?.name || '이름 없음' }}</strong>
                  <span>{{ relationship.targetUser?.email || '-' }}</span>
                </span>
              </label>
            </div>
            <div v-else class="mt-3 text-sm text-gray-500">선택 가능한 사용자가 없습니다.</div>
          </div>
          <div class="rounded-2xl bg-slate-50 p-4">
            <p class="text-sm font-semibold text-gray-900">그룹</p>
            <div v-if="overviewGroups.length" class="mt-3 space-y-2">
              <label v-for="group in overviewGroups" :key="group.groupId" class="flex items-center gap-3 rounded-2xl border border-white/70 bg-white px-3 py-3 text-sm text-gray-700">
                <input v-model="targetGroupIdsModel" type="checkbox" :value="group.groupId" class="mt-0.5" />
                <span class="flex flex-col">
                  <strong class="text-gray-900">{{ group.name }}</strong>
                  <span>{{ group.relationshipCount || 0 }}명 연결</span>
                </span>
              </label>
            </div>
            <div v-else class="mt-3 text-sm text-gray-500">생성된 그룹이 없습니다.</div>
          </div>
        </div>
      </div>
      <div class="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
        <input v-model="cancelEmailModel" type="email" class="file-filter__input" placeholder="공유 취소할 이메일" @keydown.enter.prevent="emit('cancel-share')" />
        <button type="button" class="rounded-2xl border border-gray-200 px-4 py-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed" :disabled="isSharing" @click="emit('cancel-share')">공유 취소</button>
      </div>
      <p v-if="error" class="mt-3 text-sm text-rose-500">{{ error }}</p>
      <div v-if="pendingInvites.length" class="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
        <p class="font-semibold">회원이 아닌 이메일은 초대로 저장되었습니다.</p>
        <ul class="mt-2 space-y-1">
          <li v-for="invite in pendingInvites" :key="invite.inviteId">{{ invite.email }}</li>
        </ul>
      </div>
      <div class="mt-6 rounded-2xl border border-gray-200 p-4">
        <div class="flex items-center justify-between gap-2">
          <p class="text-sm font-semibold text-gray-900">현재 공유 목록</p>
          <p class="text-xs text-gray-500">선택한 파일들을 기준으로 수신자와 공유 파일 목록을 함께 표시합니다.</p>
        </div>
        <div v-if="isInfoLoading" class="mt-4 rounded-2xl bg-slate-50 px-4 py-8 text-center text-sm text-gray-500">공유 정보를 불러오는 중입니다.</div>
        <div v-else-if="shareInfo.length === 0" class="mt-4 rounded-2xl bg-slate-50 px-4 py-8 text-center text-sm text-gray-500">현재 공유 중인 상대가 없습니다.</div>
        <div v-else class="mt-4 space-y-3">
          <div v-for="item in shareInfo" :key="item.shareIdx || `${item.fileIdx}-${item.recipientEmail}`" class="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gray-100 px-4 py-3">
            <div>
              <p class="text-sm font-semibold text-gray-900">{{ item.recipientName || item.recipientEmail }}</p>
              <p class="text-xs text-gray-500">{{ item.recipientEmail }}</p>
              <p class="mt-1 text-xs text-gray-500">항목: {{ formatBaseSharedFilesLabel(item) }}</p>
              <p class="mt-1 text-xs font-semibold text-emerald-700">권한: {{ formatBaseSharePermissionLabel(item.permission) }}</p>
              <p v-if="formatBaseSharePolicyLabel(item)" class="mt-1 text-xs text-amber-600">{{ formatBaseSharePolicyLabel(item) }}</p>
              <p class="mt-1 text-xs text-gray-400">{{ formatBaseDisplayDate(item.createdAt) }}</p>
            </div>
            <button type="button" class="rounded-full bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-600 transition hover:bg-rose-100" @click="emit('cancel-share', item.recipientEmail)">이 상대 공유 취소</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped src="./BaseFileDialog.css"></style>