<template>
  <nav
    class="header-custom-nav"
    :class="[
      `is-pos-${position}`,
      `is-style-${navStyle}`,
      `is-align-${align}`,
    ]"
    aria-label="사용자 지정 상단 메뉴"
  >
    <template v-for="item in items" :key="item.id">
      <button
        v-if="item.kind === 'action'"
        type="button"
        class="header-custom-nav__btn"
        :title="item.label"
        :aria-label="item.label"
        @click="handleAction(item)"
      >
        <i :class="item.icon"></i>
        <span v-if="navStyle !== 'icon-only'" class="header-custom-nav__label">
          {{ navStyle === "compact" ? item.shortLabel : item.label }}
        </span>
      </button>

      <RouterLink
        v-else
        :to="{ name: item.routeName }"
        class="header-custom-nav__btn"
        :class="{ 'is-active': route.name === item.routeName }"
        :title="item.label"
        :aria-label="item.label"
        @click="handleRouteClick(item)"
      >
        <i :class="item.icon"></i>
        <span v-if="navStyle !== 'icon-only'" class="header-custom-nav__label">
          {{ navStyle === "compact" ? item.shortLabel : item.label }}
        </span>
        <span v-if="getBadgeCount(item.id) > 0" class="header-custom-nav__badge">
          {{ getBadgeCount(item.id) }}
        </span>
      </RouterLink>
    </template>
  </nav>
</template>

<script setup>
import { useRoute, useRouter } from "vue-router";
import { useFileStore } from "@/stores/useFileStore.js";
import { useMediaPhotoStore } from "@/stores/useMediaPhotoStore.js";
import { useSecretFolderStore } from "@/stores/useSecretFolderStore.js";

const props = defineProps({
  items: { type: Array, default: () => [] },
  position: { type: String, default: "after-search" },
  navStyle: { type: String, default: "icon-label" },
  align: { type: String, default: "right" },
});

const route = useRoute();
const router = useRouter();
const fileStore = useFileStore();
const mediaPhotoStore = useMediaPhotoStore();
const secretFolderStore = useSecretFolderStore();
let lastHeaderHomeTapAt = 0;

const getBadgeCount = (itemId) => {
  if (secretFolderStore.vaultMode || mediaPhotoStore.isVaultScope) return 0;
  if (itemId === "media") return mediaPhotoStore.mediaCatalog?.length || 0;
  if (itemId === "photos") return mediaPhotoStore.photoCatalog?.length || 0;
  return 0;
};

const handleRouteClick = async (item) => {
  if (item.id === "home") {
    const now = Date.now();
    if (now - lastHeaderHomeTapAt <= 450) {
      lastHeaderHomeTapAt = 0;
      if (route.name !== "home") {
        await router.push({ name: "home" }).catch(() => {});
      }
      const entered = await secretFolderStore.openVaultAccess();
      if (entered) {
        fileStore.invalidateFolderSnapshots();
        fileStore.navigateToFolder(null);
      }
      return;
    }
    lastHeaderHomeTapAt = now;
    if (secretFolderStore.vaultMode) {
      secretFolderStore.setVaultTrashView(false);
    }
    fileStore.navigateToFolder?.(null);
    if (!secretFolderStore.vaultMode) {
      fileStore.fetchFiles?.(null).catch?.(() => {});
    }
  }
};

const handleAction = (item) => {
  if (item.eventName) {
    window.dispatchEvent(new CustomEvent(item.eventName, { detail: item.eventDetail || {} }));
  }
};
</script>

<style scoped>
.header-custom-nav {
  display: flex;
  align-items: center;
  gap: 0.42rem;
  flex-wrap: nowrap;
  min-width: 0;
}

.header-custom-nav.is-pos-after-search {
  flex: 1 1 auto;
  overflow-x: auto;
  scrollbar-width: none;
}

.header-custom-nav.is-align-right {
  justify-content: flex-end;
}

.header-custom-nav.is-align-center {
  justify-content: center;
}

.header-custom-nav.is-align-left {
  justify-content: flex-start;
}

.header-custom-nav.is-pos-right-actions {
  flex: 0 0 auto;
  flex-wrap: nowrap;
  gap: 0.32rem;
}

.header-custom-nav__btn {
  display: inline-flex;
  align-items: center;
  min-height: 2.35rem;
  gap: 0.42rem;
  padding: 0.5rem 0.88rem;
  border-radius: 0.9rem;
  border: 1px solid var(--border-color);
  background: var(--bg-elevated);
  color: var(--text-secondary);
  font-size: 0.82rem;
  font-weight: 700;
  line-height: 1;
  text-decoration: none;
  white-space: nowrap;
  cursor: pointer;
  transition: all 0.16s ease;
}

.header-custom-nav__btn:hover {
  border-color: color-mix(in srgb, var(--accent) 45%, var(--border-color));
  background: var(--bg-input);
  color: var(--text-main);
  transform: translateY(-1px);
}

.header-custom-nav__btn.is-active {
  background: var(--accent-soft);
  border-color: color-mix(in srgb, var(--accent) 45%, transparent);
  color: var(--accent);
}

.header-custom-nav.is-style-compact .header-custom-nav__btn {
  padding: 0.34rem 0.62rem;
  border-radius: 999px;
  font-size: 0.76rem;
}

.header-custom-nav.is-style-icon-only .header-custom-nav__btn {
  padding: 0.48rem 0.56rem;
  border-radius: 0.8rem;
}

.header-custom-nav__badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.15rem;
  height: 1.15rem;
  padding: 0 0.32rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent) 16%, var(--bg-main) 84%);
  color: var(--accent);
  font-size: 0.68rem;
  font-weight: 800;
}

@media (max-width: 900px) {
  .header-custom-nav.is-pos-after-search {
    order: 3;
    flex-basis: 100%;
    padding-top: 0.1rem;
  }

  .header-custom-nav__label {
    font-size: 0.76rem;
  }
}

@media (max-width: 720px) {
  .header-custom-nav.is-pos-after-search,
  .header-custom-nav.is-pos-right-actions {
    flex-wrap: nowrap;
    overflow-x: auto;
    scrollbar-width: none;
    max-width: 100%;
  }

  .header-custom-nav__btn {
    padding: 0.36rem 0.58rem;
    font-size: 0.75rem;
  }
}
</style>
