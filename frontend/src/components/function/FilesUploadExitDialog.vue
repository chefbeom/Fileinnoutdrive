<script setup>
defineProps({
  open: {
    type: Boolean,
    default: false,
  },
  busy: {
    type: Boolean,
    default: false,
  },
  titleId: {
    type: String,
    required: true,
  },
  title: {
    type: String,
    default: "",
  },
  description: {
    type: String,
    default: "",
  },
  actionLabel: {
    type: String,
    default: "",
  },
});

const emit = defineEmits(["cancel", "confirm"]);
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="upload-exit"
      role="presentation"
      @click.self="emit('cancel')"
    >
      <div class="upload-exit__dialog" role="dialog" aria-modal="true" :aria-labelledby="titleId">
        <strong :id="titleId" class="upload-exit__title">{{ title }}</strong>
        <p class="upload-exit__description">{{ description }}</p>
        <div class="upload-exit__actions">
          <button
            type="button"
            class="upload-exit__button upload-exit__button--secondary"
            :disabled="busy"
            @click="emit('cancel')"
          >
            취소
          </button>
          <button
            type="button"
            class="upload-exit__button upload-exit__button--primary"
            :disabled="busy"
            @click="emit('confirm')"
          >
            {{ actionLabel }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
