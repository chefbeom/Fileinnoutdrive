<script setup>
const props = defineProps({
  text: { type: String, default: '' },
  options: { type: Array, default: () => [] },
  canInsert: { type: Boolean, default: false },
  addingId: { type: [String, Number, Boolean], default: '' },
})

const emit = defineEmits([
  'update:text',
  'insert-block',
])

const insertPrimaryBlock = () => {
  const primaryBlock = props.options[0]
  if (primaryBlock) emit('insert-block', primaryBlock)
}
</script>

<template>
  <div class="workspace-inline-block-bar">
    <label class="workspace-inline-block-input">
      <i class="fa-solid fa-plus" aria-hidden="true"></i>
      <input
        :value="text"
        type="text"
        maxlength="500"
        placeholder="빠른 블록 내용"
        :disabled="!canInsert || Boolean(addingId)"
        @input="emit('update:text', $event.target.value)"
        @keydown.enter.prevent="insertPrimaryBlock"
      />
    </label>
    <div class="workspace-inline-block-actions" aria-label="빠른 블록">
      <button
        v-for="block in options"
        :key="`inline-block-${block.id}`"
        type="button"
        :disabled="!canInsert || Boolean(addingId)"
        :title="block.label"
        @click="emit('insert-block', block)"
      >
        <i :class="addingId === block.id ? 'fa-solid fa-spinner fa-spin' : block.icon"></i>
        <span>{{ block.label }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped src="../styles/11-inline-block-bar.css"></style>