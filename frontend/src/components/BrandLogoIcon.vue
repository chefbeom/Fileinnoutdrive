<template>
  <img
    :src="brandIconSrc"
    :alt="alt"
    :aria-hidden="alt ? undefined : 'true'"
    draggable="false"
    decoding="async"
    class="block select-none object-contain"
  />
</template>

<script setup>
const brandIconSrc = "/favicon.svg?v=4";

defineProps({
  alt: {
    type: String,
    default: "",
  },
});
</script>
