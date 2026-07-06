<script setup>
import { ref } from 'vue'

defineProps({
  workspaceId: {
    type: [String, Number, null],
    default: null,
  },
  relationCount: {
    type: Number,
    default: 0,
  },
  parentPage: {
    type: Object,
    default: null,
  },
  childPages: {
    type: Array,
    default: () => [],
  },
  linkedDocuments: {
    type: Array,
    default: () => [],
  },
  linkedEmptyLabel: {
    type: String,
    default: '',
  },
  backlinks: {
    type: Array,
    default: () => [],
  },
  backlinkLoading: {
    type: Boolean,
    default: false,
  },
  backlinkError: {
    type: String,
    default: '',
  },
  backlinkEmptyLabel: {
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
  subpageTitle: {
    type: String,
    default: '',
  },
  subpageCreating: {
    type: Boolean,
    default: false,
  },
  subpageError: {
    type: String,
    default: '',
  },
  canStartSubpage: {
    type: Boolean,
    default: false,
  },
  canCreateSubpage: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits([
  'refresh-backlinks',
  'open-parent',
  'open-document',
  'insert-link',
  'copy-link',
  'focus-linked-source',
  'create-subpage',
  'update:subpage-title',
])

const subpageInput = ref(null)

defineExpose({
  focus: () => subpageInput.value?.focus?.(),
})
</script>

<template>
  <section class="workspace-linked-panel">
    <div class="workspace-floating-panel__header">
      <div>
        <h3>관련 페이지</h3>
        <p>본문에서 언급한 워크스페이스 문서를 자동으로 연결합니다.</p>
      </div>
      <div class="workspace-linked-header-actions">
        <span class="workspace-floating-panel__count">{{ relationCount }}</span>
        <button
          type="button"
          class="workspace-history-refresh-btn"
          :disabled="backlinkLoading || !workspaceId"
          title="백링크 새로고침"
          @click="emit('refresh-backlinks')"
        >
          <i class="fa-solid fa-rotate-right"></i>
        </button>
      </div>
    </div>

    <template v-if="parentPage">
      <div class="workspace-linked-subheader">
        <span>Parent page</span>
        <strong>1</strong>
      </div>
      <article class="workspace-linked-item workspace-linked-item--parent">
        <button type="button" class="workspace-linked-item__main" @click="emit('open-parent')">
          <span class="workspace-linked-item__icon">
            <i class="fa-solid fa-turn-up"></i>
          </span>
          <span class="workspace-linked-item__body">
            <strong>{{ parentPage.title }}</strong>
            <small>
              {{ parentPage.scopeLabel }}
              <template v-if="parentPage.roleLabel"> · {{ parentPage.roleLabel }}</template>
              <template v-if="parentPage.updatedLabel"> · {{ parentPage.updatedLabel }}</template>
            </small>
          </span>
          <i class="fa-solid fa-arrow-right"></i>
        </button>
        <div class="workspace-linked-item__actions">
          <button
            type="button"
            :disabled="!canModifyPage || !hasEditor"
            title="본문에 링크 삽입"
            @click="emit('insert-link', parentPage)"
          >
            <i class="fa-solid fa-link"></i>
          </button>
          <button
            type="button"
            title="페이지 링크 복사"
            @click="emit('copy-link', parentPage)"
          >
            <i class="fa-regular fa-clipboard"></i>
          </button>
        </div>
      </article>
    </template>

    <form class="workspace-subpage-composer" @submit.prevent="emit('create-subpage')">
      <label>
        <span><i class="fa-regular fa-file-lines"></i> 하위 페이지</span>
        <input
          ref="subpageInput"
          :value="subpageTitle"
          type="text"
          maxlength="80"
          placeholder="새 페이지 제목"
          :disabled="!canStartSubpage || subpageCreating"
          @input="emit('update:subpage-title', $event.target.value)"
        />
      </label>
      <button type="submit" :disabled="!canCreateSubpage">
        <i :class="subpageCreating ? 'fa-solid fa-spinner fa-spin' : 'fa-regular fa-square-plus'"></i>
        만들기
      </button>
      <p v-if="subpageError" class="workspace-assets__error">{{ subpageError }}</p>
    </form>

    <template v-if="childPages.length > 0">
      <div class="workspace-linked-subheader">
        <span>Child pages</span>
        <strong>{{ childPages.length }}</strong>
      </div>
      <div class="workspace-linked-list workspace-linked-list--children">
        <article
          v-for="document in childPages"
          :key="`child-${document.id}`"
          class="workspace-linked-item workspace-linked-item--child"
        >
          <button type="button" class="workspace-linked-item__main" @click="emit('open-document', document)">
            <span class="workspace-linked-item__icon" :class="{ 'workspace-linked-item__icon--shared': document.scope === 'shared' }">
              {{ document.icon }}
            </span>
            <span class="workspace-linked-item__body">
              <strong>{{ document.title }}</strong>
              <small>{{ document.scopeLabel }} · {{ document.roleLabel }} · {{ document.updatedLabel }}</small>
            </span>
            <i class="fa-solid fa-arrow-right"></i>
          </button>
          <div class="workspace-linked-item__actions">
            <button
              type="button"
              :disabled="!canModifyPage || !hasEditor"
              title="본문에 링크 삽입"
              @click="emit('insert-link', document)"
            >
              <i class="fa-solid fa-link"></i>
            </button>
            <button
              type="button"
              title="페이지 링크 복사"
              @click="emit('copy-link', document)"
            >
              <i class="fa-regular fa-clipboard"></i>
            </button>
          </div>
        </article>
      </div>
    </template>

    <div class="workspace-linked-subheader">
      <span>Outgoing</span>
      <strong>{{ linkedDocuments.length }}</strong>
    </div>
    <div v-if="linkedDocuments.length === 0" class="workspace-floating-panel__empty">
      {{ linkedEmptyLabel }}
    </div>
    <div v-else class="workspace-linked-list">
      <article
        v-for="document in linkedDocuments"
        :key="document.id"
        class="workspace-linked-item"
      >
        <button type="button" class="workspace-linked-item__main" @click="emit('open-document', document)">
          <span class="workspace-linked-item__icon" :class="{ 'workspace-linked-item__icon--shared': document.scope === 'shared' }">
            <i :class="document.scope === 'shared' ? 'fa-solid fa-user-group' : 'fa-regular fa-file-lines'"></i>
          </span>
          <span class="workspace-linked-item__body">
            <strong>{{ document.title }}</strong>
            <small>{{ document.linkSourceLabel }} · {{ document.scopeLabel }} · {{ document.roleLabel }} · {{ document.updatedLabel }}</small>
          </span>
          <i class="fa-solid fa-arrow-right"></i>
        </button>
        <div class="workspace-linked-item__actions">
          <button
            type="button"
            :disabled="!canModifyPage || !hasEditor"
            title="본문에 링크 삽입"
            @click="emit('insert-link', document)"
          >
            <i class="fa-solid fa-link"></i>
          </button>
          <button
            type="button"
            :disabled="!document.linkAnchorBlockId"
            title="링크 위치로 이동"
            @click="emit('focus-linked-source', document)"
          >
            <i class="fa-solid fa-location-crosshairs"></i>
          </button>
          <button
            type="button"
            title="페이지 링크 복사"
            @click="emit('copy-link', document)"
          >
            <i class="fa-regular fa-clipboard"></i>
          </button>
        </div>
      </article>
    </div>

    <div class="workspace-linked-subheader">
      <span>Backlinks</span>
      <strong>{{ backlinks.length }}</strong>
    </div>
    <div v-if="backlinkLoading" class="workspace-floating-panel__empty">
      백링크를 찾는 중입니다.
    </div>
    <p v-else-if="backlinkError" class="workspace-assets__error">{{ backlinkError }}</p>
    <div v-else-if="backlinks.length === 0" class="workspace-floating-panel__empty">
      {{ backlinkEmptyLabel }}
    </div>
    <div v-else class="workspace-linked-list workspace-linked-list--backlinks">
      <article
        v-for="document in backlinks"
        :key="`backlink-${document.id}`"
        class="workspace-linked-item workspace-linked-item--backlink"
      >
        <button type="button" class="workspace-linked-item__main" @click="emit('open-document', document)">
          <span class="workspace-linked-item__icon" :class="{ 'workspace-linked-item__icon--shared': document.scope === 'shared' }">
            <i :class="document.scope === 'shared' ? 'fa-solid fa-user-group' : 'fa-regular fa-file-lines'"></i>
          </span>
          <span class="workspace-linked-item__body">
            <strong>{{ document.title }}</strong>
            <small>{{ document.backlinkSourceLabel }} · {{ document.scopeLabel }} · {{ document.roleLabel }} · {{ document.updatedLabel }}</small>
          </span>
          <i class="fa-solid fa-arrow-right"></i>
        </button>
        <p v-if="document.backlinkPreview" class="workspace-linked-item__preview">
          {{ document.backlinkPreview }}
        </p>
        <div class="workspace-linked-item__actions">
          <button
            type="button"
            title="페이지 링크 복사"
            @click="emit('copy-link', document)"
          >
            <i class="fa-regular fa-clipboard"></i>
          </button>
        </div>
      </article>
    </div>
  </section>
</template>