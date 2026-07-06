<script setup>
import { nextTick, ref, watch } from 'vue'

const props = defineProps({
  loading: {
    type: Boolean,
    default: false,
  },
  query: {
    type: String,
    default: '',
  },
  rows: {
    type: Array,
    default: () => [],
  },
  emptyLabel: {
    type: String,
    default: '',
  },
  collapsedIdSet: {
    type: Object,
    default: () => new Set(),
  },
  subpageError: {
    type: String,
    default: '',
  },
  renameError: {
    type: String,
    default: '',
  },
  moveError: {
    type: String,
    default: '',
  },
  subpageCreatingId: {
    type: String,
    default: '',
  },
  subpageComposerParentId: {
    type: String,
    default: '',
  },
  subpageTitle: {
    type: String,
    default: '',
  },
  renamingId: {
    type: String,
    default: '',
  },
  renameDraft: {
    type: String,
    default: '',
  },
  renameSavingId: {
    type: String,
    default: '',
  },
  movingId: {
    type: String,
    default: '',
  },
  moveTargetId: {
    type: String,
    default: '',
  },
  moveSavingId: {
    type: String,
    default: '',
  },
  canModifyPage: {
    type: Boolean,
    default: false,
  },
  hasEditor: {
    type: Boolean,
    default: false,
  },
  isDocumentLinkCopied: {
    type: Function,
    default: () => false,
  },
  moveTargetOptions: {
    type: Function,
    default: () => [],
  },
  canApplyMove: {
    type: Function,
    default: () => false,
  },
})

const emit = defineEmits([
  'refresh',
  'update:query',
  'update:subpageTitle',
  'update:renameDraft',
  'update:moveTargetId',
  'toggle-node',
  'open-document',
  'open-rename',
  'open-subpage',
  'open-move',
  'copy-link',
  'insert-link',
  'rename-page',
  'cancel-rename',
  'move-page',
  'cancel-move',
  'create-subpage',
  'cancel-subpage',
])

const renameInput = ref(null)
const subpageInput = ref(null)

const nodeId = (node) => String(node?.id || '')
const isCollapsed = (node) => props.collapsedIdSet?.has?.(nodeId(node))
const isRenameOpen = (node) => Boolean(node?.id && props.renamingId === nodeId(node))
const isMoveOpen = (node) => Boolean(node?.id && props.movingId === nodeId(node))
const isSubpageOpen = (node) => Boolean(node?.id && props.subpageComposerParentId === nodeId(node))
const isRenameSaving = (node) => props.renameSavingId === nodeId(node)
const isMoveSaving = (node) => props.moveSavingId === nodeId(node)
const isSubpageCreating = (node) => props.subpageCreatingId === nodeId(node)
const treeIndent = (node) => ({ '--workspace-tree-indent': `${8 + Number(node?.treeDepth || 0) * 14}px` })
const moveOptionLabel = (option) => `${'· '.repeat(Number(option?.treeDepth || 0))}${option?.title || ''}`

watch(() => props.renamingId, async (value) => {
  if (!value) return
  await nextTick()
  renameInput.value?.focus?.()
  renameInput.value?.select?.()
})

watch(() => props.subpageComposerParentId, async (value) => {
  if (!value) return
  await nextTick()
  subpageInput.value?.focus?.()
})
</script>

<template>
  <section class="workspace-page-tree-panel">
    <div class="workspace-floating-panel__header">
      <div>
        <h3>Page Tree</h3>
      </div>
      <button
        type="button"
        class="workspace-history-refresh-btn"
        :disabled="loading"
        title="Refresh page tree"
        @click="emit('refresh')"
      >
        <i :class="loading ? 'fa-solid fa-spinner fa-spin' : 'fa-solid fa-rotate-right'"></i>
      </button>
    </div>

    <label class="workspace-page-tree-search">
      <i class="fa-solid fa-magnifying-glass"></i>
      <input
        :value="query"
        type="search"
        placeholder="Find pages"
        @input="emit('update:query', $event.target.value)"
      />
      <button
        v-if="query"
        type="button"
        title="Clear"
        @click="emit('update:query', '')"
      >
        <i class="fa-solid fa-xmark"></i>
      </button>
    </label>

    <div v-if="loading" class="workspace-floating-panel__empty">
      페이지 트리를 불러오는 중입니다.
    </div>
    <template v-else>
      <p v-if="subpageError" class="workspace-assets__error">{{ subpageError }}</p>
      <p v-if="renameError" class="workspace-assets__error">{{ renameError }}</p>
      <p v-if="moveError" class="workspace-assets__error">{{ moveError }}</p>
      <div v-if="rows.length === 0" class="workspace-floating-panel__empty">
        {{ emptyLabel }}
      </div>
      <div v-else class="workspace-page-tree-list">
        <article
          v-for="node in rows"
          :key="`tree-node-${node.id}`"
          class="workspace-page-tree-item"
          :class="{
            'workspace-page-tree-item--active': node.isCurrentDocument,
            'workspace-page-tree-item--overdue': node.isOverdue,
            'workspace-page-tree-item--matched': node.treeMatchesQuery,
          }"
          :style="treeIndent(node)"
        >
          <button
            v-if="node.childCount > 0"
            type="button"
            class="workspace-page-tree-toggle"
            :aria-expanded="!isCollapsed(node)"
            :title="isCollapsed(node) ? 'Expand' : 'Collapse'"
            @click="emit('toggle-node', node)"
          >
            <i :class="isCollapsed(node) ? 'fa-solid fa-chevron-right' : 'fa-solid fa-chevron-down'"></i>
          </button>
          <span v-else class="workspace-page-tree-toggle workspace-page-tree-toggle--empty"></span>

          <button type="button" class="workspace-page-tree-main" @click="emit('open-document', node)">
            <span class="workspace-page-tree-icon">{{ node.icon }}</span>
            <span class="workspace-page-tree-body">
              <strong>{{ node.title }}</strong>
              <small>
                {{ node.scopeLabel }} · {{ node.statusLabel }}
                <template v-if="node.locked"> · 잠김</template>
                <template v-if="node.childCount > 0"> · 하위 {{ node.childCount }}</template>
              </small>
            </span>
          </button>

          <div class="workspace-page-tree-actions">
            <button
              type="button"
              :disabled="!node.canEditProperties || Boolean(renameSavingId)"
              title="Rename page"
              @click="emit('open-rename', node)"
            >
              <i :class="isRenameOpen(node) ? 'fa-solid fa-pen' : 'fa-regular fa-pen-to-square'"></i>
            </button>
            <button
              type="button"
              :disabled="!node.canEditProperties || Boolean(subpageCreatingId)"
              title="Create child page"
              @click="emit('open-subpage', node)"
            >
              <i :class="isSubpageOpen(node) ? 'fa-solid fa-pen' : 'fa-solid fa-plus'"></i>
            </button>
            <button
              type="button"
              :disabled="!node.canEditProperties || Boolean(moveSavingId)"
              title="Move page"
              @click="emit('open-move', node)"
            >
              <i :class="isMoveOpen(node) ? 'fa-solid fa-location-arrow' : 'fa-solid fa-turn-up'"></i>
            </button>
            <button type="button" title="Copy page link" @click="emit('copy-link', node)">
              <i :class="isDocumentLinkCopied(node) ? 'fa-solid fa-check' : 'fa-regular fa-clipboard'"></i>
            </button>
            <button
              type="button"
              :disabled="!canModifyPage || !hasEditor"
              title="Insert page link"
              @click="emit('insert-link', node)"
            >
              <i class="fa-solid fa-link"></i>
            </button>
          </div>

          <form
            v-if="isRenameOpen(node)"
            class="workspace-page-tree-composer workspace-page-tree-composer--rename"
            @submit.prevent="emit('rename-page', node)"
          >
            <label>
              <i class="fa-regular fa-pen-to-square"></i>
              <input
                ref="renameInput"
                :value="renameDraft"
                type="text"
                maxlength="120"
                placeholder="Page name"
                :disabled="isRenameSaving(node)"
                @input="emit('update:renameDraft', $event.target.value)"
                @keydown.esc.prevent="emit('cancel-rename')"
              />
            </label>
            <button
              type="submit"
              :disabled="isRenameSaving(node) || !renameDraft.trim()"
              title="Save"
            >
              <i :class="isRenameSaving(node) ? 'fa-solid fa-spinner fa-spin' : 'fa-solid fa-check'"></i>
            </button>
            <button
              type="button"
              :disabled="isRenameSaving(node)"
              title="Cancel"
              @click="emit('cancel-rename')"
            >
              <i class="fa-solid fa-xmark"></i>
            </button>
          </form>

          <form
            v-if="isMoveOpen(node)"
            class="workspace-page-tree-composer workspace-page-tree-composer--move"
            @submit.prevent="emit('move-page', node)"
          >
            <label>
              <i class="fa-solid fa-turn-up"></i>
              <select
                :value="moveTargetId"
                :disabled="isMoveSaving(node)"
                @change="emit('update:moveTargetId', $event.target.value)"
                @keydown.esc.prevent="emit('cancel-move')"
              >
                <option
                  v-for="option in moveTargetOptions(node)"
                  :key="`move-target-${node.id}-${option.id || 'root'}`"
                  :value="option.id"
                >
                  {{ moveOptionLabel(option) }}
                </option>
              </select>
            </label>
            <button
              type="submit"
              :disabled="!canApplyMove(node)"
              title="Move"
            >
              <i :class="isMoveSaving(node) ? 'fa-solid fa-spinner fa-spin' : 'fa-solid fa-check'"></i>
            </button>
            <button
              type="button"
              :disabled="isMoveSaving(node)"
              title="Cancel"
              @click="emit('cancel-move')"
            >
              <i class="fa-solid fa-xmark"></i>
            </button>
          </form>

          <form
            v-if="isSubpageOpen(node)"
            class="workspace-page-tree-composer"
            @submit.prevent="emit('create-subpage', node)"
          >
            <label>
              <i class="fa-regular fa-file-lines"></i>
              <input
                ref="subpageInput"
                :value="subpageTitle"
                type="text"
                maxlength="80"
                placeholder="New child page"
                :disabled="isSubpageCreating(node)"
                @input="emit('update:subpageTitle', $event.target.value)"
                @keydown.esc.prevent="emit('cancel-subpage')"
              />
            </label>
            <button
              type="submit"
              :disabled="isSubpageCreating(node) || !subpageTitle.trim()"
              title="Create"
            >
              <i :class="isSubpageCreating(node) ? 'fa-solid fa-spinner fa-spin' : 'fa-solid fa-check'"></i>
            </button>
            <button
              type="button"
              :disabled="isSubpageCreating(node)"
              title="Cancel"
              @click="emit('cancel-subpage')"
            >
              <i class="fa-solid fa-xmark"></i>
            </button>
          </form>
        </article>
      </div>
    </template>
  </section>
</template>
