import { computed } from 'vue'

const defaultDocumentStats = () => ({
  blockCount: 0,
  textBlockCount: 0,
  characterCount: 0,
  wordCount: 0,
  imageCount: 0,
  checklistBlockCount: 0,
})

const resolveSource = (source) => (typeof source === 'function' ? source() : source?.value)
const readEditorRef = (editorApi, refName, fallback) =>
  resolveSource(editorApi)?.[refName]?.value || fallback

export const useWorkspaceEditorRefs = ({ editorApi, workspaceId } = {}) => {
  const isEditorDirty = computed(() => Boolean(readEditorRef(editorApi, 'isDirtyRef', false)))
  const remoteCursors = computed(() => readEditorRef(editorApi, 'remoteCursorsRef', {}))
  const activeUsers = computed(() => readEditorRef(editorApi, 'activeUsersRef', []))
  const selectedBlockAnchor = computed(() => readEditorRef(editorApi, 'selectedBlockAnchorRef', null))
  const documentOutline = computed(() => readEditorRef(editorApi, 'documentOutlineRef', []))
  const documentTasks = computed(() => readEditorRef(editorApi, 'documentTasksRef', []))
  const documentSearchText = computed(() => readEditorRef(editorApi, 'documentSearchTextRef', ''))
  const documentWorkspaceLinks = computed(() => readEditorRef(editorApi, 'documentWorkspaceLinksRef', []))
  const documentStats = computed(() => readEditorRef(editorApi, 'documentStatsRef', defaultDocumentStats()))
  const connectionStatus = computed(() =>
    readEditorRef(editorApi, 'connectionStatusRef', resolveSource(workspaceId) ? 'connecting' : 'private'),
  )

  return {
    isEditorDirty,
    remoteCursors,
    activeUsers,
    selectedBlockAnchor,
    documentOutline,
    documentTasks,
    documentSearchText,
    documentWorkspaceLinks,
    documentStats,
    connectionStatus,
  }
}
