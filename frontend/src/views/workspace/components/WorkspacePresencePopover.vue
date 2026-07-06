<script setup>
import {
  roleLabel,
  userInitial,
  workspacePresenceStatusLabel,
} from '../services/workspacePresentation.js'

const props = defineProps({
  open: { type: Boolean, default: false },
  activeUserPreview: { type: Array, default: () => [] },
  extraActiveUserCount: { type: Number, default: 0 },
  activeUsers: { type: Array, default: () => [] },
  presenceSummaryLabel: { type: String, default: '' },
  canManageShare: { type: Boolean, default: false },
  openRoleDropdownId: { type: [String, Number], default: null },
})

const emit = defineEmits([
  'update:open',
  'update:openRoleDropdownId',
  'change-role',
])

const toggleOpen = () => {
  emit('update:open', !props.open)
}

const toggleRoleDropdown = (user) => {
  const nextId = props.openRoleDropdownId === user.clientId ? null : user.clientId
  emit('update:openRoleDropdownId', nextId)
}

const changeRole = (user, role) => {
  emit('change-role', user, role)
}
</script>

<template>
  <div class="user-presence-wrapper">
    <button
      class="presence-toggle-btn"
      type="button"
      :aria-expanded="open"
      aria-label="참여자 목록"
      @click.stop="toggleOpen"
    >
      <span class="presence-avatar-stack" aria-hidden="true">
        <span
          v-for="user in activeUserPreview"
          :key="`presence-${user.clientId}`"
          class="presence-avatar"
          :style="{ background: user.color }"
          :title="`${user.name} · ${workspacePresenceStatusLabel(user)}`"
        >
          {{ user.initial || userInitial(user.name) }}
        </span>
        <span v-if="extraActiveUserCount > 0" class="presence-avatar presence-avatar--overflow">
          +{{ extraActiveUserCount }}
        </span>
        <span v-if="activeUsers.length === 0" class="presence-avatar presence-avatar--empty">0</span>
      </span>
      <span class="presence-toggle-label">{{ presenceSummaryLabel }}</span>
    </button>

    <div v-if="open" class="user-list-popover" @click.stop>
      <div class="popover-title">현재 참여 중인 사용자</div>
      <div class="user-item-list">
        <div v-for="user in activeUsers" :key="user.clientId" class="user-item">
          <div class="user-avatar" :style="{ background: user.color }">
            {{ user.initial || userInitial(user.name) }}
          </div>
          <div class="user-info">
            <div class="user-name-row">
              <span class="user-name">{{ user.name }}</span>
              <span v-if="user.isMe" class="me-tag">(나)</span>
              <span class="role-badge" :class="`role-badge--${(user.role || 'READ').toLowerCase()}`">
                {{ roleLabel(user.role) }}
              </span>
            </div>
            <div class="user-subtitle">
              <span class="presence-status-dot" :class="{ 'presence-status-dot--away': user.status === 'away' }"></span>
              <span>{{ user.email || (user.isMe ? '현재 계정' : '공동 편집자') }} · {{ workspacePresenceStatusLabel(user) }}</span>
            </div>

            <div v-if="canManageShare && !user.isMe" class="permission-dropdown-wrapper" @click.stop>
              <button class="permission-dropdown-trigger" @click.stop="toggleRoleDropdown(user)">
                권한 변경 <span class="dropdown-arrow">▼</span>
              </button>

              <div v-if="openRoleDropdownId === user.clientId" class="permission-dropdown-menu">
                <button class="dropdown-item" @click.stop="changeRole(user, 'ADMIN')">관리자로 변경</button>
                <button class="dropdown-item" @click.stop="changeRole(user, 'WRITE')">편집자로 변경</button>
                <button class="dropdown-item" @click.stop="changeRole(user, 'READ')">뷰어로 변경</button>
                <div class="dropdown-divider"></div>
                <button class="dropdown-item dropdown-item--danger" @click.stop="changeRole(user, 'KICKED')">추방하기</button>
              </div>
            </div>
          </div>
        </div>
        <div v-if="activeUsers.length === 0" class="workspace-floating-panel__empty">
          아직 참여자가 표시되지 않았습니다.
        </div>
      </div>
    </div>
  </div>
</template>
<style scoped>
.user-presence-wrapper { position: relative; }

.presence-toggle-btn {
  display: inline-flex;
  align-items: center;
  max-width: 260px;
  min-height: 38px;
  gap: 10px;
  padding: 6px 11px 6px 7px;
  background: var(--editor-input-bg);
  border: 1px solid var(--editor-border);
  border-radius: 10px;
  cursor: pointer;
  color: var(--editor-text);
  font-size: 13px;
  font-weight: 800;
}

.presence-avatar-stack {
  display: inline-flex;
  align-items: center;
  min-width: 0;
}

.presence-avatar {
  display: inline-flex;
  width: 26px;
  height: 26px;
  align-items: center;
  justify-content: center;
  margin-left: -8px;
  border: 2px solid var(--editor-bg);
  border-radius: 999px;
  color: white;
  font-size: 11px;
  font-weight: 900;
  line-height: 1;
  box-shadow: 0 2px 6px rgba(15, 23, 42, 0.14);
}

.presence-avatar:first-child { margin-left: 0; }

.presence-avatar--overflow,
.presence-avatar--empty {
  background: #e2e8f0;
  color: #475569;
}

.presence-toggle-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.user-list-popover {
  position: absolute;
  top: 45px;
  right: 0;
  width: 280px;
  background: var(--editor-bg);
  border: 1px solid var(--editor-border);
  border-radius: 12px;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.15);
  z-index: 9999;
  padding: 16px;
}

.popover-title {
  font-size: 12px;
  color: #888;
  margin-bottom: 12px;
  font-weight: 600;
}

.user-item-list { display: grid; gap: 10px; }

.user-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.user-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-weight: bold;
  font-size: 14px;
  flex-shrink: 0;
}

.user-info { flex: 1; min-width: 0; }

.user-name-row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.user-name { font-size: 14px; font-weight: 500; }
.me-tag    { font-size: 11px; color: #888; }

.user-subtitle {
  display: flex;
  align-items: center;
  min-width: 0;
  gap: 6px;
  margin-top: 3px;
  color: #64748b;
  font-size: 11px;
}

.user-subtitle span:last-child {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.presence-status-dot {
  width: 7px;
  height: 7px;
  flex: 0 0 auto;
  border-radius: 999px;
  background: #16a34a;
}

.presence-status-dot--away { background: #f59e0b; }

.role-badge {
  font-size: 10px;
  font-weight: 700;
  padding: 2px 7px;
  border-radius: 999px;
  margin-left: auto;
  white-space: nowrap;
}

.role-badge--admin { background: rgba(37, 99, 235, 0.12); color: #2563eb; }
.role-badge--write { background: rgba(22, 163, 74, 0.12);  color: #16a34a; }
.role-badge--read  { background: rgba(100, 116, 139, 0.12); color: #64748b; }

.permission-dropdown-wrapper {
  position: relative;
  margin-top: 4px;
}

.permission-dropdown-trigger {
  font-size: 11px;
  color: #2563eb;
  background: none;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0;
}

.dropdown-arrow { font-size: 9px; }

.permission-dropdown-menu {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  min-width: 150px;
  background: var(--editor-bg);
  border: 1px solid var(--editor-border);
  border-radius: 10px;
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.12);
  z-index: 2000;
  overflow: hidden;
  padding: 4px 0;
}

.dropdown-item {
  display: block;
  width: 100%;
  text-align: left;
  padding: 8px 14px;
  font-size: 12px;
  font-weight: 500;
  background: none;
  border: none;
  cursor: pointer;
  color: var(--editor-text);
  transition: background 0.15s;
}

.dropdown-item:hover { background: rgba(0, 0, 0, 0.05); }

.dropdown-divider {
  height: 1px;
  background: var(--editor-border);
  margin: 4px 0;
}

.dropdown-item--danger       { color: #dc2626; }
.dropdown-item--danger:hover { background: rgba(220, 38, 38, 0.07); }

.workspace-floating-panel__empty {
  padding: 10px;
  border-radius: 10px;
  color: #64748b;
  font-size: 12px;
  line-height: 1.45;
}
</style>