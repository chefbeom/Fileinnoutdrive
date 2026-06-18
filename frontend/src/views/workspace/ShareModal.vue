<script setup>
import { computed, ref, watch } from "vue";
import postApi from "@/api/postApi.js";
import loadpost from "@/components/workspace/loadpost.js";
import { fetchGroupOverview, shareWorkspacesWithTargets } from "@/api/groupApi.js";
import GroupRecipientSelector from "@/components/group/GroupRecipientSelector.vue";

const props = defineProps({
  isOpen: Boolean,
  postIdx: [Number, String],
  uuid: String,
  initialStatus: String,
});

const emit = defineEmits(["close", "refresh"]);

const privacyStatus = ref(props.initialStatus || "Private");
const overview = ref(null);
const isOverviewLoading = ref(false);
const shareEmail = ref("");
const shareRole = ref("WRITE");
const memberRoles = ref([]);
const isMemberRolesLoading = ref(false);
const memberRoleActionLoading = ref("");
const memberRoleError = ref("");
const pendingRemoveMemberId = ref("");
const selectedUserIds = ref([]);
const selectedGroupIds = ref([]);
const pendingInvites = ref([]);
const shareError = ref("");
const shareSuccess = ref("");
const linkCopyMessage = ref("");
const linkCopyError = ref("");
const statusMessage = ref("");
const statusError = ref("");
const isSharing = ref(false);
const isSavingStatus = ref(false);

const inviteUrl = computed(() => (
  `${typeof window !== "undefined" ? window.location.origin : ""}/workspace/invite?uuid=${props.uuid || ""}`
));

const memberRoleOptions = [
  { value: "READ", label: "보기" },
  { value: "WRITE", label: "편집" },
];

const roleLabel = (role) => {
  if (role === "ADMIN") return "관리자";
  if (role === "WRITE") return "편집";
  if (role === "READ") return "보기";
  return role || "알 수 없음";
};

const memberDisplayName = (member) => (
  member?.username || member?.name || member?.email || "이름 없음"
);

const memberInitial = (member) => (
  memberDisplayName(member).trim().slice(0, 1).toUpperCase() || "?"
);

const memberActionKey = (member, action) => `${member?.idx || member?.userIdx || member?.id || ""}:${action}`;

const memberIdentity = (member) => String(member?.idx ?? member?.userIdx ?? member?.id ?? member?.email ?? "");

const normalizeMemberRole = (member) => ({
  idx: member?.idx ?? member?.userIdx ?? member?.id ?? null,
  username: member?.username ?? member?.name ?? "",
  email: member?.email ?? "",
  image: member?.image ?? member?.profileImage ?? "",
  role: String(member?.role ?? member?.level ?? "READ").toUpperCase(),
});

const hasMemberRoles = computed(() => memberRoles.value.length > 0);

const resetShareState = () => {
  shareEmail.value = "";
  shareRole.value = "WRITE";
  memberRoles.value = [];
  memberRoleActionLoading.value = "";
  memberRoleError.value = "";
  pendingRemoveMemberId.value = "";
  selectedUserIds.value = [];
  selectedGroupIds.value = [];
  pendingInvites.value = [];
  shareError.value = "";
  shareSuccess.value = "";
  linkCopyMessage.value = "";
  linkCopyError.value = "";
  statusMessage.value = "";
  statusError.value = "";
  overview.value = null;
};

const loadOverview = async () => {
  isOverviewLoading.value = true;
  shareError.value = "";

  try {
    overview.value = await fetchGroupOverview();
  } catch (error) {
    overview.value = null;
    shareError.value =
      error?.response?.data?.message ||
      error?.message ||
      "공유 대상을 불러오지 못했습니다.";
  } finally {
    isOverviewLoading.value = false;
  }
};

const loadMemberRoles = async () => {
  if (!props.postIdx) {
    memberRoles.value = [];
    memberRoleError.value = "";
    return [];
  }

  isMemberRolesLoading.value = true;
  memberRoleError.value = "";

  try {
    const result = await postApi.loadRole(props.postIdx);
    memberRoles.value = (Array.isArray(result) ? result : []).map(normalizeMemberRole);
    pendingRemoveMemberId.value = "";
    return memberRoles.value;
  } catch (error) {
    memberRoles.value = [];
    memberRoleError.value =
      error?.response?.data?.message ||
      error?.message ||
      "현재 멤버를 불러오지 못했습니다.";
    return [];
  } finally {
    isMemberRolesLoading.value = false;
  }
};

watch(
  [() => props.isOpen, () => props.initialStatus],
  async ([isOpen, nextStatus]) => {
    if (!isOpen) {
      resetShareState();
      return;
    }

    resetShareState();
    privacyStatus.value = nextStatus || "Private";
    await Promise.all([loadOverview(), loadMemberRoles()]);
  },
  { immediate: true },
);

const copyLink = async () => {
  if (privacyStatus.value !== "Public") return;
  linkCopyMessage.value = "";
  linkCopyError.value = "";

  try {
    if (!navigator?.clipboard?.writeText) {
      throw new Error("이 브라우저에서는 클립보드를 사용할 수 없습니다.");
    }
    await navigator.clipboard.writeText(inviteUrl.value);
    linkCopyMessage.value = "링크가 클립보드에 복사되었습니다.";
  } catch (error) {
    linkCopyError.value = error?.message || "링크를 복사하지 못했습니다.";
  }
};

const handleShareTargets = async () => {
  const recipientEmail = shareEmail.value.trim();
  const userIds = selectedUserIds.value.filter(Boolean);
  const groupIds = selectedGroupIds.value.filter(Boolean);

  if (!recipientEmail && userIds.length === 0 && groupIds.length === 0) {
    shareError.value = "공유할 사용자, 그룹, 이메일 중 하나 이상을 선택해주세요.";
    return;
  }

  isSharing.value = true;
  shareError.value = "";
  shareSuccess.value = "";
  statusMessage.value = "";
  statusError.value = "";

  try {
    if (privacyStatus.value === "Private") {
      await postApi.updateShareStatus(props.postIdx, "Shared");
      privacyStatus.value = "Shared";
    }

    const result = await shareWorkspacesWithTargets({
      workspaceId: props.postIdx,
      userIds,
      groupIds,
      emails: recipientEmail ? [recipientEmail] : [],
      role: shareRole.value,
    });

    selectedUserIds.value = [];
    selectedGroupIds.value = [];
    shareEmail.value = "";
    pendingInvites.value = result?.pendingInvites || [];
    shareSuccess.value = "워크스페이스 공유 대상을 적용했습니다.";

    await loadMemberRoles();

    if (loadpost?.side_list) {
      await loadpost.side_list();
    }
    emit("refresh");
  } catch (error) {
    shareError.value =
      error?.response?.data?.message ||
      error?.message ||
      "워크스페이스를 공유하지 못했습니다.";
  } finally {
    isSharing.value = false;
  }
};

const handleMemberRoleChange = async (member, nextRole) => {
  const targetUserIdx = member?.idx ?? member?.userIdx ?? member?.id ?? null;
  const role = String(nextRole || "").toUpperCase();

  if (!props.postIdx || !targetUserIdx || member?.role === "ADMIN") return;
  if (!["READ", "WRITE"].includes(role) || role === member?.role) return;

  memberRoleActionLoading.value = memberActionKey(member, role);
  memberRoleError.value = "";

  try {
    await postApi.changeUserRole(props.postIdx, targetUserIdx, role);
    memberRoles.value = memberRoles.value.map((item) => (
      String(item.idx) === String(targetUserIdx) ? { ...item, role } : item
    ));
    emit("refresh");
  } catch (error) {
    memberRoleError.value =
      error?.response?.data?.message ||
      error?.message ||
      "멤버 권한을 변경하지 못했습니다.";
    await loadMemberRoles();
  } finally {
    memberRoleActionLoading.value = "";
  }
};

const handleRemoveMember = async (member) => {
  const targetUserIdx = member?.idx ?? member?.userIdx ?? member?.id ?? null;
  if (!props.postIdx || !targetUserIdx || member?.role === "ADMIN") return;

  const identity = memberIdentity(member);
  if (pendingRemoveMemberId.value !== identity) {
    pendingRemoveMemberId.value = identity;
    return;
  }

  memberRoleActionLoading.value = memberActionKey(member, "KICKED");
  memberRoleError.value = "";

  try {
    await postApi.kickUser(props.postIdx, targetUserIdx);
    memberRoles.value = memberRoles.value.filter((item) => String(item.idx) !== String(targetUserIdx));
    pendingRemoveMemberId.value = "";
    shareSuccess.value = `${memberDisplayName(member)} 님을 공유 대상에서 제거했습니다.`;
    emit("refresh");
  } catch (error) {
    memberRoleError.value =
      error?.response?.data?.message ||
      error?.message ||
      "멤버를 제거하지 못했습니다.";
    await loadMemberRoles();
  } finally {
    memberRoleActionLoading.value = "";
  }
};

const cancelMemberRemoval = () => {
  pendingRemoveMemberId.value = "";
};

const handleSaveStatus = async () => {
  isSavingStatus.value = true;
  statusMessage.value = "";
  statusError.value = "";

  try {
    await postApi.updateShareStatus(props.postIdx, privacyStatus.value);
    if (loadpost?.side_list) {
      await loadpost.side_list();
    }
    emit("refresh");
    statusMessage.value = "공유 설정이 저장되었습니다.";
  } catch (error) {
    console.error("Save Status Error:", error);
    statusError.value =
      error?.response?.data?.message ||
      error?.message ||
      "설정 저장 중 오류가 발생했습니다.";
  } finally {
    isSavingStatus.value = false;
  }
};
</script>

<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 z-[1000] flex items-center justify-center px-4"
  >
    <div class="absolute inset-0 bg-black/50 backdrop-blur-sm" @click="$emit('close')"></div>

    <div class="relative flex h-[min(82vh,760px)] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-[var(--border-color)] bg-[var(--bg-main)] shadow-2xl">
      <div class="shrink-0 border-b border-[var(--border-color)] p-6">
        <div class="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 class="text-2xl font-black text-[var(--text-main)]">워크스페이스 공유</h2>
          <p class="mt-1 text-sm text-[var(--text-muted)]">
            공개 링크를 관리하고, 사용자와 그룹을 선택해 워크스페이스를 공유할 수 있습니다.
          </p>
        </div>

        <div class="flex rounded-xl border border-[var(--border-color)] bg-[var(--bg-input)] p-1">
          <button
            v-for="status in ['Private', 'Shared', 'Public']"
            :key="status"
            type="button"
            class="rounded-lg px-3 py-1.5 text-xs font-bold transition-all"
            :class="privacyStatus === status ? 'bg-white text-sky-600 shadow-sm dark:bg-slate-700' : 'text-[var(--text-muted)]'"
            @click="privacyStatus = status"
          >
            {{ status === "Private" ? "개인" : status === "Shared" ? "공유" : "공개" }}
          </button>
        </div>
        </div>
      </div>

      <div class="min-h-0 flex-1 overflow-y-auto px-6 py-6">
        <div class="space-y-6 pr-1">
        <section class="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-input)]/60 p-5">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p class="text-sm font-extrabold text-[var(--text-main)]">공개 링크</p>
              <p class="mt-1 text-xs text-[var(--text-muted)]">
                공개 상태일 때만 링크로 바로 입장할 수 있습니다.
              </p>
            </div>
            <span class="rounded-full bg-white/80 px-3 py-1 text-xs font-bold text-[var(--text-muted)] dark:bg-slate-800/70">
              현재 상태: {{ privacyStatus === "Private" ? "개인" : privacyStatus === "Shared" ? "공유" : "공개" }}
            </span>
          </div>

          <div class="mt-4 flex gap-2">
            <input
              type="text"
              readonly
              :value="inviteUrl"
              :disabled="privacyStatus !== 'Public'"
              class="flex-1 rounded-xl border border-[var(--border-color)] bg-[var(--bg-main)] px-3 py-2.5 text-sm text-[var(--text-main)] outline-none disabled:cursor-not-allowed disabled:opacity-60"
            />
            <button
              type="button"
              class="rounded-xl border border-[var(--border-color)] bg-[var(--bg-main)] px-4 py-2.5 text-sm font-semibold text-[var(--text-main)] transition hover:bg-white/70 disabled:cursor-not-allowed disabled:opacity-60 dark:hover:bg-slate-700/80"
              :disabled="privacyStatus !== 'Public'"
              @click="copyLink"
            >
              링크 복사
            </button>
          </div>
          <p v-if="linkCopyMessage" class="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700">
            {{ linkCopyMessage }}
          </p>
          <p v-if="linkCopyError" class="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-xs font-bold text-rose-600">
            {{ linkCopyError }}
          </p>
        </section>

        <section class="space-y-4">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p class="text-base font-black text-[var(--text-main)]">멤버 공유</p>
              <p class="mt-1 text-sm text-[var(--text-muted)]">
                사용자, 그룹, 이메일을 함께 선택할 수 있습니다. 개인 상태에서 공유하면 자동으로 공유 상태로 전환됩니다.
              </p>
            </div>
            <div class="flex rounded-xl border border-[var(--border-color)] bg-[var(--bg-input)] p-1">
              <button
                type="button"
                class="rounded-lg px-3 py-1.5 text-xs font-bold transition-all"
                :class="shareRole === 'READ' ? 'bg-white text-sky-600 shadow-sm dark:bg-slate-700' : 'text-[var(--text-muted)]'"
                :disabled="isSharing"
                title="문서를 볼 수 있지만 수정할 수 없습니다."
                @click="shareRole = 'READ'"
              >
                보기
              </button>
              <button
                type="button"
                class="rounded-lg px-3 py-1.5 text-xs font-bold transition-all"
                :class="shareRole === 'WRITE' ? 'bg-white text-sky-600 shadow-sm dark:bg-slate-700' : 'text-[var(--text-muted)]'"
                :disabled="isSharing"
                title="문서를 보고 수정할 수 있습니다."
                @click="shareRole = 'WRITE'"
              >
                편집
              </button>
            </div>
          </div>

          <GroupRecipientSelector
            :overview="overview"
            :loading="isOverviewLoading"
            :disabled="isSharing"
            :selected-user-ids="selectedUserIds"
            :selected-group-ids="selectedGroupIds"
            @update:selected-user-ids="selectedUserIds = $event"
            @update:selected-group-ids="selectedGroupIds = $event"
          />

          <p v-if="shareError" class="rounded-2xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-600">
            {{ shareError }}
          </p>
          <p v-if="shareSuccess" class="rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
            {{ shareSuccess }}
          </p>

          <div
            v-if="pendingInvites.length"
            class="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700"
          >
            <p class="font-bold">회원이 아닌 이메일은 연결 초대로 저장되었습니다.</p>
            <ul class="mt-2 list-disc space-y-1 pl-5">
              <li v-for="invite in pendingInvites" :key="invite.inviteId">
                {{ invite.email }}
              </li>
            </ul>
            
          </div>

          <div class="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
            <input
              v-model="shareEmail"
              type="email"
              class="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-input)] px-4 py-3 text-sm text-[var(--text-main)] outline-none"
              placeholder="직접 입력할 이메일"
              :disabled="isSharing"
              @keydown.enter.prevent="handleShareTargets"
            />
            <button
              type="button"
              class="rounded-2xl bg-sky-600 px-5 py-3 text-sm font-extrabold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-70"
              :disabled="isSharing"
              @click="handleShareTargets"
            >
              {{ isSharing ? "공유 중..." : "공유 적용" }}
            </button>
          </div>
        </section>

        <section class="space-y-4 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-input)]/50 p-5">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p class="text-base font-black text-[var(--text-main)]">현재 멤버</p>
              <p class="mt-1 text-sm text-[var(--text-muted)]">
                공유된 사용자의 권한을 바로 조정하거나 공유 대상에서 제거할 수 있습니다.
              </p>
            </div>
            <button
              type="button"
              class="rounded-xl border border-[var(--border-color)] bg-[var(--bg-main)] px-4 py-2 text-sm font-bold text-[var(--text-main)] transition hover:bg-white/70 disabled:cursor-not-allowed disabled:opacity-60 dark:hover:bg-slate-700/80"
              :disabled="isMemberRolesLoading"
              @click="loadMemberRoles"
            >
              {{ isMemberRolesLoading ? "새로고침 중..." : "새로고침" }}
            </button>
          </div>

          <p v-if="memberRoleError" class="rounded-2xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-600">
            {{ memberRoleError }}
          </p>

          <div v-if="isMemberRolesLoading" class="rounded-2xl border border-dashed border-[var(--border-color)] px-4 py-6 text-center text-sm font-semibold text-[var(--text-muted)]">
            멤버를 불러오는 중입니다.
          </div>

          <div v-else-if="!hasMemberRoles" class="rounded-2xl border border-dashed border-[var(--border-color)] px-4 py-6 text-center text-sm font-semibold text-[var(--text-muted)]">
            아직 표시할 멤버가 없습니다.
          </div>

          <div v-else class="divide-y divide-[var(--border-color)] overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[var(--bg-main)]">
            <div
              v-for="member in memberRoles"
              :key="member.idx || member.email"
              class="grid gap-3 px-4 py-3 md:grid-cols-[minmax(0,1fr)_auto_minmax(110px,auto)] md:items-center"
            >
              <div class="flex min-w-0 items-center gap-3">
                <img
                  v-if="member.image"
                  :src="member.image"
                  alt=""
                  class="h-10 w-10 shrink-0 rounded-full object-cover"
                />
                <div
                  v-else
                  class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sm font-black text-sky-700"
                >
                  {{ memberInitial(member) }}
                </div>
                <div class="min-w-0">
                  <p class="truncate text-sm font-extrabold text-[var(--text-main)]">
                    {{ memberDisplayName(member) }}
                  </p>
                  <p class="truncate text-xs font-medium text-[var(--text-muted)]">
                    {{ member.email || roleLabel(member.role) }}
                  </p>
                </div>
              </div>

              <select
                v-if="member.role !== 'ADMIN'"
                :value="member.role"
                class="rounded-xl border border-[var(--border-color)] bg-[var(--bg-input)] px-3 py-2 text-sm font-bold text-[var(--text-main)] outline-none disabled:cursor-not-allowed disabled:opacity-60"
                :disabled="Boolean(memberRoleActionLoading)"
                @change="handleMemberRoleChange(member, $event.target.value)"
              >
                <option
                  v-for="option in memberRoleOptions"
                  :key="option.value"
                  :value="option.value"
                >
                  {{ option.label }}
                </option>
              </select>
              <span
                v-else
                class="rounded-xl border border-[var(--border-color)] bg-[var(--bg-input)] px-3 py-2 text-center text-sm font-bold text-[var(--text-muted)]"
              >
                {{ roleLabel(member.role) }}
              </span>

              <div class="flex justify-end gap-2">
                <button
                  v-if="pendingRemoveMemberId === memberIdentity(member)"
                  type="button"
                  class="rounded-xl border border-[var(--border-color)] bg-[var(--bg-input)] px-3 py-2 text-sm font-bold text-[var(--text-muted)] transition hover:text-[var(--text-main)] disabled:cursor-not-allowed disabled:opacity-50"
                  :disabled="Boolean(memberRoleActionLoading)"
                  @click="cancelMemberRemoval"
                >
                  취소
                </button>
                <button
                  type="button"
                  class="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-extrabold text-rose-600 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
                  :disabled="member.role === 'ADMIN' || Boolean(memberRoleActionLoading)"
                  @click="handleRemoveMember(member)"
                >
                  {{
                    memberRoleActionLoading === memberActionKey(member, "KICKED")
                      ? "제거 중..."
                      : pendingRemoveMemberId === memberIdentity(member)
                        ? "제거 확인"
                        : "제거"
                  }}
                </button>
              </div>
            </div>
          </div>
        </section>
        </div>
      </div>

      <div class="flex shrink-0 justify-end gap-3 border-t border-[var(--border-color)] bg-[var(--bg-input)] p-4">
        <div class="mr-auto min-w-0 self-center">
          <p v-if="statusMessage" class="truncate text-sm font-bold text-emerald-700">
            {{ statusMessage }}
          </p>
          <p v-if="statusError" class="truncate text-sm font-bold text-rose-600">
            {{ statusError }}
          </p>
        </div>
        <button
          type="button"
          class="px-4 py-2 text-sm font-semibold text-[var(--text-muted)] transition hover:text-[var(--text-main)]"
          @click="$emit('close')"
        >
          닫기
        </button>
        <button
          type="button"
          class="rounded-xl bg-blue-600 px-7 py-2.5 text-sm font-extrabold text-white shadow-lg shadow-blue-500/20 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-70"
          :disabled="isSavingStatus"
          @click="handleSaveStatus"
        >
          {{ isSavingStatus ? "저장 중..." : "설정 저장" }}
        </button>
      </div>
    </div>
  </div>
</template>
