<script setup>
import { ref } from 'vue'

const props = defineProps({
  unresolvedComments: {
    type: Array,
    default: () => [],
  },
  commentFilters: {
    type: Array,
    default: () => [],
  },
  commentFilter: {
    type: String,
    default: 'open',
  },
  canComment: {
    type: Boolean,
    default: false,
  },
  selectedBlockAnchor: {
    type: Object,
    default: null,
  },
  commentAnchorLabel: {
    type: Function,
    default: () => '',
  },
  showMentionMenu: {
    type: Boolean,
    default: false,
  },
  canUseMentions: {
    type: Boolean,
    default: false,
  },
  mentionCandidates: {
    type: Array,
    default: () => [],
  },
  newComment: {
    type: String,
    default: '',
  },
  commentSaving: {
    type: Boolean,
    default: false,
  },
  commentError: {
    type: String,
    default: '',
  },
  commentLoading: {
    type: Boolean,
    default: false,
  },
  comments: {
    type: Array,
    default: () => [],
  },
  visibleComments: {
    type: Array,
    default: () => [],
  },
  emptyLabel: {
    type: String,
    default: '',
  },
  editDraft: {
    type: String,
    default: '',
  },
  isMentioningCurrentUser: {
    type: Function,
    default: () => false,
  },
  canEditComment: {
    type: Function,
    default: () => false,
  },
  isCommentUpdating: {
    type: Function,
    default: () => false,
  },
  isCommentDeleting: {
    type: Function,
    default: () => false,
  },
  isCommentEditing: {
    type: Function,
    default: () => false,
  },
  isCommentResolving: {
    type: Function,
    default: () => false,
  },
})

const emit = defineEmits([
  'clear-anchor',
  'insert-mention',
  'create-comment',
  'start-edit',
  'delete-comment',
  'focus-anchor',
  'update-comment',
  'cancel-edit',
  'toggle-resolved',
  'update:comment-filter',
  'update:show-mention-menu',
  'update:new-comment',
  'update:edit-draft',
])

const commentInput = ref(null)

const emitInput = (event, name) => {
  emit(name, event.target.value)
}

const currentAnchorLabel = () => (
  props.selectedBlockAnchor ? props.commentAnchorLabel(props.selectedBlockAnchor) : '문서 전체'
)

defineExpose({
  focus: () => commentInput.value?.focus?.(),
  scrollIntoView: (options) => commentInput.value?.scrollIntoView?.(options),
  setSelectionRange: (...args) => commentInput.value?.setSelectionRange?.(...args),
  get selectionStart() {
    return commentInput.value?.selectionStart ?? 0
  },
  get selectionEnd() {
    return commentInput.value?.selectionEnd ?? 0
  },
})
</script>

<template>
  <section class="workspace-review-panel">
    <div class="workspace-floating-panel__header">
      <div>
        <h3>검토 댓글</h3>
        <p>문서 단위로 의견을 남기고 해결 상태를 관리합니다.</p>
      </div>
      <span class="workspace-floating-panel__count">{{ unresolvedComments.length }}</span>
    </div>

    <div class="workspace-comment-filters" role="tablist" aria-label="댓글 필터">
      <button
        v-for="filter in commentFilters"
        :key="filter.id"
        type="button"
        class="workspace-comment-filter"
        :class="{ 'workspace-comment-filter--active': commentFilter === filter.id }"
        :disabled="filter.disabled"
        @click="emit('update:comment-filter', filter.id)"
      >
        <span>{{ filter.label }}</span>
        <strong>{{ filter.count }}</strong>
      </button>
    </div>

    <div v-if="canComment" class="workspace-comment-composer">
      <div
        class="workspace-comment-anchor-target"
        :class="{ 'workspace-comment-anchor-target--document': !selectedBlockAnchor }"
      >
        <div>
          <span>{{ selectedBlockAnchor ? '현재 블록' : '문서 전체' }}</span>
          <strong>{{ currentAnchorLabel() }}</strong>
        </div>
        <button
          v-if="selectedBlockAnchor"
          type="button"
          @click="emit('clear-anchor')"
        >
          문서 전체로
        </button>
      </div>
      <div class="workspace-mention-tools">
        <button
          type="button"
          class="workspace-mention-toggle"
          :class="{ 'workspace-mention-toggle--active': showMentionMenu }"
          :disabled="!canUseMentions"
          @click="emit('update:show-mention-menu', !showMentionMenu)"
        >
          <i class="fa-solid fa-at"></i>
          <span>멘션</span>
        </button>
        <div v-if="showMentionMenu && canUseMentions" class="workspace-mention-menu">
          <button
            v-for="candidate in mentionCandidates"
            :key="candidate.email"
            type="button"
            class="workspace-mention-option"
            @click="emit('insert-mention', candidate)"
          >
            <span class="workspace-mention-avatar">
              <img v-if="candidate.image" :src="candidate.image" :alt="candidate.name" />
              <span v-else>{{ candidate.initial }}</span>
            </span>
            <span class="workspace-mention-meta">
              <strong>{{ candidate.name }}</strong>
              <small>{{ candidate.email }}</small>
            </span>
          </button>
        </div>
      </div>
      <textarea
        ref="commentInput"
        :value="newComment"
        rows="3"
        maxlength="4000"
        placeholder="의견, 요청사항, 확인할 내용을 남겨주세요."
        @input="emitInput($event, 'update:new-comment')"
        @keydown.ctrl.enter.prevent="emit('create-comment')"
        @keydown.meta.enter.prevent="emit('create-comment')"
      ></textarea>
      <button
        type="button"
        class="workspace-comment-submit"
        :disabled="commentSaving || !newComment.trim()"
        @click="emit('create-comment')"
      >
        {{ commentSaving ? '작성 중' : '댓글 추가' }}
      </button>
    </div>

    <p v-if="commentError" class="workspace-assets__error">{{ commentError }}</p>
    <div v-if="commentLoading" class="workspace-floating-panel__empty">
      댓글을 불러오는 중입니다.
    </div>
    <div v-else-if="comments.length === 0" class="workspace-floating-panel__empty">
      아직 댓글이 없습니다.
    </div>
    <div v-else-if="visibleComments.length === 0" class="workspace-floating-panel__empty">
      {{ emptyLabel }}
    </div>
    <div v-else class="workspace-comment-list">
      <article
        v-for="comment in visibleComments"
        :key="comment.id"
        class="workspace-comment-item"
        :class="{
          'workspace-comment-item--resolved': comment.resolved,
          'workspace-comment-item--mentioned': isMentioningCurrentUser(comment),
        }"
      >
        <div class="workspace-comment-item__header">
          <div>
            <strong>{{ comment.authorName }}</strong>
            <span>
              {{ comment.createdAtLabel }}
              <template v-if="comment.isEdited"> · {{ comment.editedLabel }}</template>
            </span>
            <span
              v-if="isMentioningCurrentUser(comment)"
              class="workspace-comment-mention-chip"
            >
              <i class="fa-solid fa-at"></i>
              내 멘션
            </span>
          </div>
          <div class="workspace-comment-item__actions">
            <button
              v-if="canEditComment(comment)"
              type="button"
              class="workspace-comment-icon-btn"
              :disabled="isCommentUpdating(comment.id) || isCommentDeleting(comment.id)"
              @click="emit('start-edit', comment)"
            >
              수정
            </button>
            <button
              type="button"
              class="workspace-comment-icon-btn"
              :disabled="isCommentDeleting(comment.id)"
              @click="emit('delete-comment', comment)"
            >
              삭제
            </button>
          </div>
        </div>
        <button
          v-if="comment.anchorBlockId"
          type="button"
          class="workspace-comment-anchor"
          @click="emit('focus-anchor', comment)"
        >
          <i class="fa-solid fa-location-dot"></i>
          <span>{{ commentAnchorLabel(comment) }}</span>
        </button>
        <form
          v-if="isCommentEditing(comment)"
          class="workspace-comment-edit"
          @submit.prevent="emit('update-comment', comment)"
        >
          <textarea
            :value="editDraft"
            rows="3"
            maxlength="4000"
            :disabled="isCommentUpdating(comment.id)"
            @input="emitInput($event, 'update:edit-draft')"
            @keydown.ctrl.enter.prevent="emit('update-comment', comment)"
            @keydown.meta.enter.prevent="emit('update-comment', comment)"
          ></textarea>
          <div>
            <button
              type="button"
              class="workspace-comment-edit__cancel"
              :disabled="isCommentUpdating(comment.id)"
              @click="emit('cancel-edit')"
            >
              취소
            </button>
            <button
              type="submit"
              class="workspace-comment-edit__save"
              :disabled="isCommentUpdating(comment.id) || !editDraft.trim()"
            >
              {{ isCommentUpdating(comment.id) ? '저장 중' : '저장' }}
            </button>
          </div>
        </form>
        <p v-else>{{ comment.contents }}</p>
        <button
          type="button"
          class="workspace-comment-resolve"
          :disabled="isCommentResolving(comment.id) || isCommentEditing(comment)"
          @click="emit('toggle-resolved', comment)"
        >
          {{ isCommentResolving(comment.id) ? '처리 중' : comment.resolved ? '다시 열기' : '해결로 표시' }}
        </button>
      </article>
    </div>
  </section>
</template>