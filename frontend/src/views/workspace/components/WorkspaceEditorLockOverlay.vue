<script setup>
defineProps({
  canEditWorkspace: { type: Boolean, default: false },
  isSaving: { type: Boolean, default: false },
  isEditorLoading: { type: Boolean, default: false },
})

const emit = defineEmits(['unlock'])
</script>

<template>
  <div class="workspace-editor-lock-overlay">
    <div>
      <i class="fa-solid fa-lock"></i>
      <strong>페이지가 잠겨 있습니다.</strong>
      <span>잠금을 해제하면 본문과 속성을 다시 편집할 수 있습니다.</span>
    </div>
    <button
      type="button"
      :disabled="!canEditWorkspace || isSaving || isEditorLoading"
      @click="emit('unlock')"
    >
      잠금 해제
    </button>
  </div>
</template>

<style scoped src="../styles/11-editor-lock-overlay.css"></style>