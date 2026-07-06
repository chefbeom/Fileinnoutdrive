<script setup>
defineProps({
  workspaceId: {
    type: [String, Number, null],
    default: null,
  },
  revisions: {
    type: Array,
    default: () => [],
  },
  loading: {
    type: Boolean,
    default: false,
  },
  error: {
    type: String,
    default: '',
  },
  activeRevision: {
    type: Object,
    default: null,
  },
  revisionDiff: {
    type: Object,
    default: null,
  },
  diffSummary: {
    type: Array,
    default: () => [],
  },
  diffItems: {
    type: Array,
    default: () => [],
  },
  previewLoading: {
    type: [String, Number],
    default: '',
  },
  restoring: {
    type: [String, Number],
    default: '',
  },
  canRestore: {
    type: Boolean,
    default: false,
  },
  revisionReasonLabel: {
    type: Function,
    default: () => '',
  },
})

const emit = defineEmits([
  'refresh',
  'preview',
  'restore',
])
</script>

<template>
  <section class="workspace-history-panel">
    <div class="workspace-floating-panel__header">
      <div>
        <h3>버전 기록</h3>
        <p>저장된 시점으로 문서를 되돌릴 수 있습니다.</p>
      </div>
      <button
        v-if="workspaceId"
        type="button"
        class="workspace-history-refresh-btn"
        :disabled="loading"
        title="버전 기록 새로고침"
        @click="emit('refresh')"
      >
        <i class="fa-solid fa-rotate-right"></i>
      </button>
    </div>

    <p v-if="error" class="workspace-assets__error">{{ error }}</p>
    <div v-if="!workspaceId" class="workspace-floating-panel__empty">
      문서를 저장하면 버전 기록이 생성됩니다.
    </div>
    <div v-else-if="loading" class="workspace-floating-panel__empty">
      버전 기록을 불러오는 중입니다.
    </div>
    <div v-else-if="revisions.length === 0" class="workspace-floating-panel__empty">
      아직 저장된 기록이 없습니다.
    </div>
    <div v-else class="workspace-history-list">
      <article
        v-for="revision in revisions"
        :key="revision.id"
        class="workspace-history-item"
        :class="{ 'workspace-history-item--active': activeRevision?.id === revision.id }"
      >
        <button
          type="button"
          class="workspace-history-item__main"
          :disabled="previewLoading === String(revision.id)"
          @click="emit('preview', revision)"
        >
          <span>{{ revisionReasonLabel(revision.reason) }}</span>
          <strong>{{ revision.title }}</strong>
          <small>{{ revision.actorName }} · {{ revision.createdAtLabel }}</small>
        </button>
      </article>
    </div>

    <div v-if="activeRevision" class="workspace-history-preview">
      <div>
        <span>선택한 기록</span>
        <strong>{{ activeRevision.title }}</strong>
        <small>{{ activeRevision.actorName }} · {{ activeRevision.createdAtLabel }}</small>
      </div>

      <div v-if="revisionDiff" class="workspace-history-diff">
        <div
          v-if="revisionDiff.titleChanged"
          class="workspace-history-title-diff"
        >
          <span>제목 변경</span>
          <strong>{{ revisionDiff.currentTitle }}</strong>
          <i class="fa-solid fa-arrow-right"></i>
          <strong>{{ revisionDiff.targetTitle }}</strong>
        </div>

        <div class="workspace-history-diff-summary" aria-label="버전 변경 요약">
          <span
            v-for="item in diffSummary"
            :key="item.id"
            :class="`workspace-history-diff-summary__item workspace-history-diff-summary__item--${item.id}`"
          >
            {{ item.label }} {{ item.count }}
          </span>
        </div>

        <div v-if="diffItems.length > 0" class="workspace-history-diff-list">
          <article
            v-for="item in diffItems"
            :key="`${item.kind}-${item.key}`"
            class="workspace-history-diff-item"
            :class="`workspace-history-diff-item--${item.kind}`"
          >
            <span>{{ item.label }}</span>
            <div>
              <strong>{{ item.typeLabel }}</strong>
              <p>{{ item.preview }}</p>
              <small v-if="item.previousPreview && item.previousPreview !== item.preview">
                현재: {{ item.previousPreview }}
              </small>
            </div>
          </article>
        </div>
        <p v-else class="workspace-history-diff-empty">
          현재 문서와 블록 내용이 같습니다.
        </p>
      </div>

      <button
        type="button"
        :disabled="!canRestore || restoring === String(activeRevision.id)"
        @click="emit('restore', activeRevision)"
      >
        {{ restoring === String(activeRevision.id) ? '복구 중' : '이 버전으로 복구' }}
      </button>
    </div>
  </section>
</template>