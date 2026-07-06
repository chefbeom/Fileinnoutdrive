<script setup>
defineProps({
  assets: { type: Array, default: () => [] },
  images: { type: Array, default: () => [] },
  files: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  uploading: { type: Boolean, default: false },
  error: { type: String, default: '' },
  workspaceId: { type: [String, Number, null], default: null },
  canManageAssets: { type: Boolean, default: false },
  isDeletingAsset: { type: Function, default: () => false },
})

const emit = defineEmits([
  'trigger-image-select',
  'trigger-file-select',
  'delete-asset',
  'download-asset',
])
</script>

<template>
  <div class="workspace-assets">
    <div class="workspace-assets__header">
      <div>
        <p class="workspace-assets__summary workspace-assets__summary--plain">첨부 파일 {{ assets.length }}개</p>
        <p class="workspace-assets__hint workspace-assets__hint--plain">
          업로드한 파일은 오른쪽 플로팅 목록에서 바로 저장하거나 확인할 수 있습니다.
        </p>
        <p class="workspace-assets__summary">
          이미지 {{ images.length }}개 · 파일 {{ files.length }}개
        </p>
      </div>

      <div v-if="canManageAssets" class="workspace-assets__actions">
        <button type="button" class="asset-action-btn" :disabled="uploading" @click="emit('trigger-image-select')">
          이미지 업로드
        </button>
        <button type="button" class="asset-action-btn asset-action-btn--secondary" :disabled="uploading" @click="emit('trigger-file-select')">
          파일 업로드
        </button>
      </div>
    </div>

    <p v-if="error" class="workspace-assets__error">{{ error }}</p>
    <p v-else-if="!workspaceId" class="workspace-assets__hint">처음 업로드할 때 워크스페이스가 먼저 저장됩니다.</p>

    <div v-if="loading" class="workspace-assets__loading">첨부 자산을 불러오는 중입니다...</div>

    <section v-if="images.length > 0" class="workspace-assets__group">
      <div class="workspace-assets__group-header"><h4>이미지</h4></div>
      <div class="workspace-image-grid">
        <article v-for="asset in images" :key="asset.id" class="workspace-image-card">
          <button
            v-if="canManageAssets"
            type="button"
            class="asset-remove-btn"
            :disabled="isDeletingAsset(asset.id)"
            @click.stop="emit('delete-asset', asset)"
          >×</button>
          <a :href="asset.previewUrl" target="_blank" rel="noopener noreferrer" class="workspace-image-card__preview">
            <img :src="asset.previewUrl" :alt="asset.originalName" class="workspace-image-card__image" />
          </a>
          <div class="workspace-image-card__meta">
            <strong>{{ asset.originalName }}</strong>
            <span>{{ asset.fileSizeLabel }}</span>
            <span v-if="asset.createdAtLabel">{{ asset.createdAtLabel }}</span>
          </div>
        </article>
      </div>
    </section>

    <section v-if="files.length > 0" class="workspace-assets__group">
      <div class="workspace-assets__group-header"><h4>파일</h4></div>
      <div class="workspace-file-list">
        <article v-for="asset in files" :key="asset.id" class="workspace-file-card-wrap">
          <button
            v-if="canManageAssets"
            type="button"
            class="asset-remove-btn asset-remove-btn--file"
            :disabled="isDeletingAsset(asset.id)"
            @click.stop="emit('delete-asset', asset)"
          >×</button>
          <button type="button" class="workspace-file-card" @click="emit('download-asset', asset)">
            <div class="workspace-file-card__icon">
              <i class="fa-solid fa-file-arrow-down"></i>
            </div>
            <div class="workspace-file-card__meta">
              <strong>{{ asset.originalName }}</strong>
              <span>{{ asset.fileSizeLabel }}</span>
              <span v-if="asset.createdAtLabel">{{ asset.createdAtLabel }}</span>
            </div>
          </button>
        </article>
      </div>
    </section>

    <div v-if="!loading && images.length === 0 && files.length === 0" class="workspace-assets__empty">
      업로드된 이미지나 파일이 없습니다.
    </div>
  </div>
</template>

<style scoped src="../styles/04-inline-assets.css"></style>