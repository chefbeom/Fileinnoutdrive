<script setup>
defineProps({
  activeUsers: { type: Array, default: () => [] },
  accessRole: { type: String, default: '' },
  shareStatusLabel: { type: String, default: '' },
  permissionItems: { type: Array, default: () => [] },
  canManageShare: { type: Boolean, default: false },
  canManageAssets: { type: Boolean, default: false },
  canComment: { type: Boolean, default: false },
  isValid: { type: Boolean, default: false },
  isSaving: { type: Boolean, default: false },
  isEditorLoading: { type: Boolean, default: false },
  shareButtonTitle: { type: String, default: '' },
  assetUploading: { type: Boolean, default: false },
  workspaceId: { type: [Number, String], default: null },
  memberSummaryLabel: { type: String, default: '' },
  memberError: { type: String, default: '' },
  memberLoading: { type: Boolean, default: false },
  memberRows: { type: Array, default: () => [] },
  roleLabel: { type: Function, default: (role) => role || '뷰어' },
  userInitial: { type: Function, default: (name) => String(name || '?').charAt(0).toUpperCase() },
  isMemberBusy: { type: Function, default: () => false },
})

const emit = defineEmits(['open-share', 'trigger-file-select', 'focus-comment', 'refresh-members', 'change-member-role', 'remove-member'])
</script>

<template>
  <section class="workspace-collaboration-panel">
    <div class="workspace-floating-panel__header">
      <div>
        <h3>협업 상태</h3>
        <p>현재 문서의 권한과 공동 작업 상태를 확인합니다.</p>
      </div>
      <span class="workspace-floating-panel__count">{{ activeUsers.length }}</span>
    </div>

    <div class="workspace-collaboration-summary">
      <div class="workspace-collaboration-summary__item">
        <span>내 권한</span>
        <strong>{{ roleLabel(accessRole) }}</strong>
      </div>
      <div class="workspace-collaboration-summary__item">
        <span>공유 상태</span>
        <strong>{{ shareStatusLabel }}</strong>
      </div>
      <div class="workspace-collaboration-summary__item">
        <span>참여자</span>
        <strong>{{ activeUsers.length }}명</strong>
      </div>
    </div>

    <div class="workspace-permission-grid" aria-label="현재 권한으로 가능한 작업">
      <div
        v-for="item in permissionItems"
        :key="item.id"
        class="workspace-permission-chip"
        :class="{ 'workspace-permission-chip--disabled': !item.enabled }"
      >
        <span>{{ item.label }}</span>
        <strong>{{ item.detail }}</strong>
      </div>
    </div>

    <div class="workspace-collaboration-actions">
      <button
        type="button"
        class="workspace-collaboration-action"
        :disabled="!canManageShare || !isValid || isSaving || isEditorLoading"
        :title="shareButtonTitle"
        @click="emit('open-share')"
      >
        <i class="fa-solid fa-share-nodes"></i>
        <span>초대</span>
      </button>
      <button
        type="button"
        class="workspace-collaboration-action"
        :disabled="!canManageAssets || assetUploading"
        title="첨부 파일 추가"
        @click="emit('trigger-file-select')"
      >
        <i class="fa-solid fa-paperclip"></i>
        <span>첨부</span>
      </button>
      <button
        type="button"
        class="workspace-collaboration-action"
        :disabled="!canComment"
        title="평가 작성"
        @click="emit('focus-comment')"
      >
        <i class="fa-regular fa-comment-dots"></i>
        <span>평가</span>
      </button>
    </div>

    <section class="workspace-member-panel">
      <div class="workspace-member-panel__header">
        <div>
          <h4>문서 멤버</h4>
          <p>{{ memberSummaryLabel }}</p>
        </div>
        <button
          v-if="canManageShare && workspaceId"
          type="button"
          class="workspace-member-refresh-btn"
          :disabled="memberLoading"
          title="멤버 목록 새로고침"
          @click="emit('refresh-members')"
        >
          <i class="fa-solid fa-rotate-right"></i>
        </button>
      </div>

      <p v-if="memberError" class="workspace-member-error">{{ memberError }}</p>
      <div v-else-if="!workspaceId" class="workspace-member-empty">문서를 저장하면 멤버를 관리할 수 있습니다.</div>
      <div v-else-if="!canManageShare" class="workspace-member-empty">관리자만 전체 멤버 목록을 볼 수 있습니다.</div>
      <div v-else-if="memberLoading" class="workspace-member-empty">멤버 목록을 불러오는 중입니다.</div>
      <div v-else-if="memberRows.length === 0" class="workspace-member-empty">아직 등록된 멤버가 없습니다.</div>
      <div v-else class="workspace-member-list">
        <article
          v-for="member in memberRows"
          :key="member.userIdx"
          class="workspace-member-item"
        >
          <div class="workspace-member-avatar">
            <img v-if="member.image" :src="member.image" :alt="member.name" />
            <span v-else>{{ userInitial(member.name) }}</span>
          </div>
          <div class="workspace-member-meta">
            <div class="workspace-member-name-row">
              <strong>{{ member.name }}</strong>
              <span v-if="member.isMe" class="me-tag">나</span>
              <span
                class="workspace-member-online"
                :class="{ 'workspace-member-online--active': member.isOnline }"
              >
                {{ member.isOnline ? '접속 중' : '오프라인' }}
              </span>
            </div>
            <span>{{ roleLabel(member.role) }}</span>
          </div>
          <div class="workspace-member-actions">
            <select
              :value="member.role"
              :disabled="member.isMe || isMemberBusy(member)"
              title="멤버 권한 변경"
              @change="emit('change-member-role', member, $event)"
            >
              <option value="ADMIN">관리자</option>
              <option value="WRITE">편집자</option>
              <option value="READ">뷰어</option>
            </select>
            <button
              type="button"
              :disabled="member.isMe || isMemberBusy(member)"
              title="멤버 추방"
              @click="emit('remove-member', member)"
            >
              <i class="fa-regular fa-trash-can"></i>
            </button>
          </div>
        </article>
      </div>
    </section>
  </section>
</template>
