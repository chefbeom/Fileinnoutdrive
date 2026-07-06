<script setup>
defineProps({
  quickBlockOptions: {
    type: Array,
    default: () => [],
  },
  quickBlockText: {
    type: String,
    default: '',
  },
  quickBlockAdding: {
    type: [String, Number, Boolean],
    default: '',
  },
  canInsertQuickBlock: {
    type: Boolean,
    default: false,
  },
  canModifyPage: {
    type: Boolean,
    default: false,
  },
  isPageLocked: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits([
  'insert-block',
  'update:quick-block-text',
])
</script>

<template>
  <section class="workspace-block-insert-panel">
    <div class="workspace-floating-panel__header">
      <div>
        <h3>빠른 블록</h3>
        <p>제목, 체크리스트, 표 같은 자주 쓰는 블록을 본문 끝에 추가합니다.</p>
      </div>
      <span class="workspace-floating-panel__count">{{ quickBlockOptions.length }}</span>
    </div>

    <label class="workspace-block-insert-input">
      <span>내용</span>
      <input
        :value="quickBlockText"
        type="text"
        maxlength="500"
        placeholder="비워두면 기본 내용으로 추가합니다."
        :disabled="!canInsertQuickBlock || Boolean(quickBlockAdding)"
        @input="emit('update:quick-block-text', $event.target.value)"
      />
    </label>

    <div class="workspace-block-insert-grid">
      <button
        v-for="block in quickBlockOptions"
        :key="block.id"
        type="button"
        class="workspace-block-insert-card"
        :disabled="!canInsertQuickBlock || Boolean(quickBlockAdding)"
        @click="emit('insert-block', block)"
      >
        <span class="workspace-block-insert-card__icon">
          <i :class="quickBlockAdding === block.id ? 'fa-solid fa-spinner fa-spin' : block.icon"></i>
        </span>
        <strong>{{ block.label }}</strong>
        <small>{{ block.description }}</small>
      </button>
    </div>

    <div v-if="!canModifyPage" class="workspace-floating-panel__empty">
      {{ isPageLocked ? '페이지 잠금 중에는 블록을 삽입할 수 없습니다.' : '보기 권한에서는 블록을 삽입할 수 없습니다.' }}
    </div>
  </section>
</template>