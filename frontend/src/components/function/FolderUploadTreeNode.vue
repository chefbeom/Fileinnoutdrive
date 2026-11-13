<script setup>
import { computed, ref, watch } from "vue";

const props = defineProps({
  node: {
    type: Object,
    required: true,
  },
  depth: {
    type: Number,
    default: 0,
  },
  isLast: {
    type: Boolean,
    default: false,
  },
  searchQuery: {
    type: String,
    default: "",
  },
  expandAllSignal: {
    type: Number,
    default: 0,
  },
  collapseAllSignal: {
    type: Number,
    default: 0,
  },
});

const isOpen = ref(true);

watch(
  () => props.expandAllSignal,
  () => {
    isOpen.value = true;
  },
);

watch(
  () => props.collapseAllSignal,
  () => {
    isOpen.value = false;
  },
);

const hasChildren = computed(() => {
  return Array.isArray(props.node?.children) && props.node.children.length > 0;
});

const directFileCount = computed(() => {
  if (!Array.isArray(props.node?.children)) return 0;
  return props.node.children.filter((c) => c.type === "file").length;
});

const directFolderCount = computed(() => {
  if (!Array.isArray(props.node?.children)) return 0;
  return props.node.children.filter((c) => c.type === "folder").length;
});

const matchesSelf = computed(() => {
  if (!props.searchQuery) return true;
  const q = props.searchQuery.trim().toLowerCase();
  return String(props.node?.name || "").toLowerCase().includes(q);
});

function hasMatchingDescendant(node, query) {
  if (!query) return true;
  const q = query.trim().toLowerCase();
  if (String(node?.name || "").toLowerCase().includes(q)) {
    return true;
  }
  if (Array.isArray(node?.children)) {
    return node.children.some((child) => hasMatchingDescendant(child, query));
  }
  return false;
}

const isVisible = computed(() => {
  if (!props.searchQuery) return true;
  return matchesSelf.value || hasMatchingDescendant(props.node, props.searchQuery);
});

watch(
  () => props.searchQuery,
  (query) => {
    if (query && hasMatchingDescendant(props.node, query)) {
      isOpen.value = true;
    }
  },
);

const filteredChildren = computed(() => {
  if (!props.searchQuery || !hasChildren.value) {
    return props.node.children || [];
  }
  return (props.node.children || []).filter((child) =>
    hasMatchingDescendant(child, props.searchQuery),
  );
});

function toggleOpen() {
  if (props.node.type === "folder") {
    isOpen.value = !isOpen.value;
  }
}
</script>

<template>
  <div v-if="isVisible" class="folder-tree-node relative select-none text-slate-200">
    <!-- Folder Item Row -->
    <div
      v-if="node.type === 'folder'"
      class="folder-tree-row group relative flex items-center justify-between rounded-lg px-2.5 py-2 my-0.5 transition cursor-pointer border border-transparent hover:border-slate-700/80 hover:bg-slate-800/80"
      :class="[
        depth === 0 ? 'bg-slate-800/50 border-slate-700/50' : 'bg-slate-900/40',
        { 'ring-1 ring-blue-500/50 bg-blue-950/30': matchesSelf && searchQuery },
      ]"
      @click="toggleOpen"
    >
      <div class="flex items-center gap-2 min-w-0">
        <!-- Tree branch prefix for nested folders -->
        <span
          v-if="depth > 0"
          class="text-slate-600 font-mono text-xs shrink-0 -ml-1 mr-0.5 select-none"
          aria-hidden="true"
        >
          {{ isLast ? "└─" : "├─" }}
        </span>

        <!-- Chevron toggle -->
        <button
          type="button"
          class="flex h-5 w-5 items-center justify-center rounded bg-slate-800/80 text-slate-300 hover:text-white transition shrink-0"
          :class="{ 'opacity-30 pointer-events-none': !hasChildren }"
          :aria-expanded="isOpen"
          @click.stop="toggleOpen"
        >
          <i
            class="fa-solid fa-chevron-right text-[10px] transition-transform duration-200"
            :class="{ 'rotate-90': isOpen }"
          ></i>
        </button>

        <!-- Folder Icon -->
        <i
          class="text-base shrink-0 transition-colors"
          :class="isOpen ? 'fa-solid fa-folder-open text-amber-400' : 'fa-solid fa-folder text-amber-500'"
        ></i>

        <!-- Folder Name -->
        <span class="truncate text-sm font-semibold text-white group-hover:text-amber-200 transition">
          {{ node.name }}
        </span>

        <!-- Folder Badge -->
        <span class="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300 border border-amber-500/30 shrink-0">
          폴더
        </span>

        <!-- Direct children summary chip -->
        <span
          v-if="!hasChildren"
          class="rounded bg-slate-800 px-1.5 py-0.5 text-[11px] font-medium text-slate-400 border border-slate-700/70 shrink-0"
        >
          빈 폴더
        </span>
        <span
          v-else
          class="rounded bg-slate-800/90 px-2 py-0.5 text-[11px] font-medium text-slate-300 border border-slate-700/70 shrink-0"
        >
          <template v-if="directFolderCount > 0">하위 폴더 {{ directFolderCount }}개</template>
          <template v-if="directFolderCount > 0 && directFileCount > 0"> · </template>
          <template v-if="directFileCount > 0">파일 {{ directFileCount }}개</template>
        </span>
      </div>

      <div class="flex items-center gap-2.5 text-xs text-slate-400 shrink-0 pl-2">
        <span v-if="node.fileCount > directFileCount" class="text-[11px] text-slate-400 hidden sm:inline">
          총 {{ node.fileCount }}개 파일
        </span>
        <span class="font-mono text-xs text-amber-300/90 font-semibold">{{ node.totalBytesFormatted }}</span>
      </div>
    </div>

    <!-- File Item Row -->
    <div
      v-else-if="node.type === 'file'"
      class="folder-tree-row group relative flex items-center justify-between rounded-lg px-2.5 py-1.5 my-0.5 transition hover:bg-slate-800/60"
      :class="{ 'ring-1 ring-blue-500/50 bg-blue-950/30': matchesSelf && searchQuery }"
    >
      <div class="flex items-center gap-2 min-w-0">
        <!-- Tree branch prefix for nested files -->
        <span
          v-if="depth > 0"
          class="text-slate-600 font-mono text-xs shrink-0 -ml-1 mr-0.5 select-none"
          aria-hidden="true"
        >
          {{ isLast ? "└─" : "├─" }}
        </span>

        <!-- File format Icon -->
        <span class="flex h-5 w-5 items-center justify-center shrink-0">
          <i
            class="text-sm"
            :class="[node.iconMeta?.icon || 'fa-regular fa-file', node.iconMeta?.colorClass || 'text-slate-400']"
          ></i>
        </span>

        <!-- File Name -->
        <span class="truncate text-sm text-slate-200 group-hover:text-white transition">
          {{ node.name }}
        </span>

        <!-- Extension Tag -->
        <span
          v-if="node.format"
          class="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-bold text-slate-300 border border-slate-700/80 uppercase tracking-wider shrink-0"
        >
          {{ node.format }}
        </span>
      </div>

      <span class="font-mono text-xs text-slate-300 shrink-0 pl-2">
        {{ node.sizeFormatted }}
      </span>
    </div>

    <!-- Recursive Sub-tree (Nested Children inside Folder) -->
    <div
      v-if="node.type === 'folder' && isOpen && hasChildren"
      class="folder-tree-children ml-5 pl-3 border-l-2 border-slate-700/70 space-y-0.5 my-0.5"
    >
      <FolderUploadTreeNode
        v-for="(child, index) in filteredChildren"
        :key="child.id"
        :node="child"
        :depth="depth + 1"
        :is-last="index === filteredChildren.length - 1"
        :search-query="searchQuery"
        :expand-all-signal="expandAllSignal"
        :collapse-all-signal="collapseAllSignal"
      />
    </div>
  </div>
</template>
