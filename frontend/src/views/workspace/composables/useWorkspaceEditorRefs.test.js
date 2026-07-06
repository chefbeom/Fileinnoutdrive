import { describe, expect, it } from 'vitest'
import { markRaw, ref } from 'vue'

import { useWorkspaceEditorRefs } from './useWorkspaceEditorRefs.js'

describe('useWorkspaceEditorRefs', () => {
  it('returns safe defaults before the editor API is ready', () => {
    const workspaceId = ref('')
    const subject = useWorkspaceEditorRefs({ editorApi: ref(null), workspaceId })

    expect(subject.isEditorDirty.value).toBe(false)
    expect(subject.remoteCursors.value).toEqual({})
    expect(subject.activeUsers.value).toEqual([])
    expect(subject.selectedBlockAnchor.value).toBeNull()
    expect(subject.documentOutline.value).toEqual([])
    expect(subject.documentTasks.value).toEqual([])
    expect(subject.documentSearchText.value).toBe('')
    expect(subject.documentWorkspaceLinks.value).toEqual([])
    expect(subject.documentStats.value).toEqual({
      blockCount: 0,
      textBlockCount: 0,
      characterCount: 0,
      wordCount: 0,
      imageCount: 0,
      checklistBlockCount: 0,
    })
    expect(subject.connectionStatus.value).toBe('private')

    workspaceId.value = 7
    expect(subject.connectionStatus.value).toBe('connecting')
  })

  it('tracks nested refs exposed by the editor API', () => {
    const activeUsersRef = ref([{ clientId: 'u1' }])
    const documentTasksRef = ref([{ id: 'task-1' }])
    const connectionStatusRef = ref('connected')
    const editorApi = ref(markRaw({
      isDirtyRef: ref(true),
      remoteCursorsRef: ref({ u1: { style: { top: '1px' } } }),
      activeUsersRef,
      selectedBlockAnchorRef: ref({ blockId: 'block-1' }),
      documentOutlineRef: ref([{ id: 'heading-1' }]),
      documentTasksRef,
      documentSearchTextRef: ref('keyword'),
      documentWorkspaceLinksRef: ref([{ id: 'page-1' }]),
      documentStatsRef: ref({ blockCount: 2, textBlockCount: 1 }),
      connectionStatusRef,
    }))

    const subject = useWorkspaceEditorRefs({ editorApi, workspaceId: ref(10) })

    expect(subject.isEditorDirty.value).toBe(true)
    expect(subject.activeUsers.value).toEqual([{ clientId: 'u1' }])
    expect(subject.documentTasks.value).toEqual([{ id: 'task-1' }])
    expect(subject.documentSearchText.value).toBe('keyword')
    expect(subject.connectionStatus.value).toBe('connected')

    activeUsersRef.value = [{ clientId: 'u2' }]
    documentTasksRef.value = [{ id: 'task-2' }]
    connectionStatusRef.value = 'reconnecting'

    expect(subject.activeUsers.value).toEqual([{ clientId: 'u2' }])
    expect(subject.documentTasks.value).toEqual([{ id: 'task-2' }])
    expect(subject.connectionStatus.value).toBe('reconnecting')
  })
})
