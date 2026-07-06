<script setup>
defineProps({
  query: {
    type: String,
    default: '',
  },
  results: {
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
  canSearch: {
    type: Boolean,
    default: false,
  },
  canModifyPage: {
    type: Boolean,
    default: false,
  },
  hasEditor: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['update:query', 'search', 'open-document', 'copy-link', 'insert-link'])
</script>

<template>
  <section class="workspace-fulltext-panel">
    <div class="workspace-floating-panel__header">
      <div>
        <h3>워크스페이스 검색</h3>
        <p>제목과 본문을 함께 검색해 필요한 페이지를 찾습니다.</p>
      </div>
      <span class="workspace-floating-panel__count">{{ results.length }}</span>
    </div>

    <form class="workspace-fulltext-search" @submit.prevent="emit('search')">
      <label>
        <i class="fa-solid fa-magnifying-glass"></i>
        <input
          :value="query"
          type="search"
          maxlength="80"
          placeholder="본문 검색어"
          @input="emit('update:query', $event.target.value)"
        />
      </label>
      <button
        type="submit"
        :disabled="!canSearch"
      >
        <i :class="loading ? 'fa-solid fa-spinner fa-spin' : 'fa-solid fa-arrow-right'"></i>
        <span>검색</span>
      </button>
    </form>

    <p v-if="error" class="workspace-assets__error">{{ error }}</p>
    <div v-if="loading" class="workspace-floating-panel__empty">
      문서 본문을 검색하는 중입니다.
    </div>
    <div v-else-if="results.length === 0" class="workspace-floating-panel__empty">
      검색어를 입력하면 워크스페이스 문서 본문까지 찾아봅니다.
    </div>
    <div v-else class="workspace-fulltext-results">
      <article
        v-for="result in results"
        :key="`fulltext-${result.id}`"
        class="workspace-fulltext-result"
      >
        <button type="button" class="workspace-fulltext-result__main" @click="emit('open-document', result)">
          <span class="workspace-fulltext-result__icon" :class="{ 'workspace-fulltext-result__icon--shared': result.scope === 'shared' }">
            <i :class="result.scope === 'shared' ? 'fa-solid fa-user-group' : 'fa-regular fa-file-lines'"></i>
          </span>
          <span class="workspace-fulltext-result__body">
            <strong>{{ result.title }}</strong>
            <small>{{ result.matchTypeLabel }} · {{ result.scopeLabel }} · {{ result.roleLabel }} · {{ result.updatedLabel }}</small>
          </span>
          <i class="fa-solid fa-arrow-right"></i>
        </button>
        <p>{{ result.snippet }}</p>
        <div class="workspace-fulltext-result__actions">
          <button type="button" title="페이지 링크 복사" @click="emit('copy-link', result)">
            <i class="fa-regular fa-clipboard"></i>
          </button>
          <button
            type="button"
            :disabled="!canModifyPage || !hasEditor"
            title="본문에 링크 삽입"
            @click="emit('insert-link', result)"
          >
            <i class="fa-solid fa-link"></i>
          </button>
        </div>
      </article>
    </div>
  </section>
</template>
