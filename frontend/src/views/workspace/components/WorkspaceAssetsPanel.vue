<script setup>
defineProps({
  assets: {
    type: Array,
    default: () => [],
  },
  loading: {
    type: Boolean,
    default: false,
  },
  hasAssets: {
    type: Boolean,
    default: false,
  },
  activeAssetId: {
    type: [String, Number, null],
    default: null,
  },
  canManageAssets: {
    type: Boolean,
    default: false,
  },
  getAssetBadge: {
    type: Function,
    default: () => '',
  },
  isDeletingAsset: {
    type: Function,
    default: () => false,
  },
  isSavingAsset: {
    type: Function,
    default: () => false,
  },
})

const emit = defineEmits([
  'toggle-asset',
  'delete-asset',
  'save-asset-to-drive',
  'download-asset',
])
</script>

<template>
  <section class="workspace-assets-panel">
    <div class="workspace-floating-panel__header">
      <div><h3>첨부 파일</h3></div>
      <span class="workspace-floating-panel__count">{{ assets.length }}</span>
    </div>

    <div v-if="loading" class="workspace-floating-panel__empty">
      첨부 파일을 불러오는 중입니다...
    </div>
    <div v-else-if="!hasAssets" class="workspace-floating-panel__empty">
      아직 첨부한 파일이 없습니다.
    </div>
    <div v-else class="workspace-floating-list">
      <article
        v-for="asset in assets"
        :key="asset.id"
        class="workspace-floating-item"
        :class="{ 'workspace-floating-item--active': activeAssetId === asset.id }"
      >
        <button
          type="button"
          class="workspace-floating-item__main"
          @click="emit('toggle-asset', asset.id)"
        >
          <div
            class="workspace-floating-item__icon"
            :class="asset.assetType === 'IMAGE' ? 'workspace-floating-item__icon--image' : 'workspace-floating-item__icon--file'"
          >
            <i :class="asset.assetType === 'IMAGE' ? 'fa-regular fa-image' : 'fa-regular fa-file-lines'"></i>
          </div>
          <div class="workspace-floating-item__meta">
            <div class="workspace-floating-item__title-row">
              <strong>{{ asset.originalName }}</strong>
              <span class="workspace-floating-item__badge">{{ getAssetBadge(asset) }}</span>
            </div>
            <span>{{ asset.fileSizeLabel }}</span>
            <span v-if="asset.createdAtLabel">{{ asset.createdAtLabel }}</span>
          </div>
        </button>

        <button
          v-if="canManageAssets"
          type="button"
          class="workspace-floating-item__remove"
          :disabled="isDeletingAsset(asset.id)"
          @click.stop="emit('delete-asset', asset)"
        >×</button>

        <div v-if="activeAssetId === asset.id" class="workspace-floating-item__actions">
          <button
            type="button"
            class="workspace-floating-item__action workspace-floating-item__action--drive"
            :disabled="isSavingAsset(asset.id)"
            @click.stop="emit('save-asset-to-drive', asset)"
          >
            {{ isSavingAsset(asset.id) ? '저장 중...' : '드라이브에 저장' }}
          </button>
          <button
            type="button"
            class="workspace-floating-item__action workspace-floating-item__action--download"
            @click.stop="emit('download-asset', asset)"
          >
            로컬에 저장
          </button>
        </div>
      </article>
    </div>
  </section>
</template>