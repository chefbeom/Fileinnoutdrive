<script setup>
import WorkspaceOverlaysBridge from './components/WorkspaceOverlaysBridge.vue'
import WorkspaceMainLayoutBridge from './components/WorkspaceMainLayoutBridge.vue'
import WorkspaceFloatingPanelStack from './components/WorkspaceFloatingPanelStack.vue'
import { useWorkspacePageSetup } from './useWorkspacePageSetup.js'

const {
  isWorkspacePanelCollapsed,
  workspaceOverlaysModel,
  workspaceOverlaysActions,
  workspaceMainLayoutModel,
  workspaceMainLayoutActions,
  workspaceFloatingPanelStackModel,
  workspaceFloatingPanelStackActions,
} = useWorkspacePageSetup()
</script>

<template>
  <div
    class="workspace-layout"
    :class="{ 'workspace-layout--panel-collapsed': isWorkspacePanelCollapsed }"
  >
    <WorkspaceOverlaysBridge
      :model="workspaceOverlaysModel"
      :actions="workspaceOverlaysActions"
    />

    <WorkspaceMainLayoutBridge
      :model="workspaceMainLayoutModel"
      :actions="workspaceMainLayoutActions"
    />

    <WorkspaceFloatingPanelStack
      :model="workspaceFloatingPanelStackModel"
      :actions="workspaceFloatingPanelStackActions"
    />
  </div>
</template>

<style scoped src="./styles/01-core.css"></style>
<style scoped src="./styles/03-editor-header.css"></style>
<style scoped src="./styles/04-properties-assets.css"></style>
<style scoped src="./styles/05-members.css"></style>
<style scoped src="./styles/06-workload.css"></style>
<style scoped src="./styles/07-search-tree.css"></style>
<style scoped src="./styles/08-page-index.css"></style>
<style scoped src="./styles/09-board.css"></style>
<style scoped src="./styles/10-timeline.css"></style>
<style scoped src="./styles/10-calendar-inbox.css"></style>
<style scoped src="./styles/10-activity-block-insert.css"></style>
<style scoped src="./styles/10-task-list.css"></style>
<style scoped src="./styles/10-outline.css"></style>
<style scoped src="./styles/11-linked-history.css"></style>
<style scoped src="./styles/11-comments.css"></style>
<style scoped src="./styles/11-floating-assets.css"></style>
<style scoped src="./styles/11-editor-body.css"></style>
<style scoped src="./styles/12-responsive.css"></style>
