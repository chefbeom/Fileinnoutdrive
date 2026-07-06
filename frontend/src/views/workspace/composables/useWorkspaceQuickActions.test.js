import { describe, expect, it } from 'vitest'
import { ref } from 'vue'

import { useWorkspaceQuickActions } from './useWorkspaceQuickActions.js'

describe('useWorkspaceQuickActions', () => {
  it('filters inline quick block options', () => {
    const subject = useWorkspaceQuickActions({
      quickBlockOptions: ref([
        { id: 'paragraph' },
        { id: 'header' },
        { id: 'image' },
        { id: 'checklist' },
        { id: 'file' },
        { id: 'quote' },
        { id: 'warning' },
        { id: 'table' },
      ]),
    })

    expect(subject.workspaceInlineQuickBlockOptions.value.map((block) => block.id)).toEqual([
      'paragraph',
      'header',
      'checklist',
      'quote',
      'warning',
      'table',
    ])
  })

  it('tracks quick block and subpage availability', () => {
    const editorApi = ref({
      appendWorkspaceBlock: () => true,
      appendWorkspacePageLink: () => true,
    })
    const canModifyWorkspacePage = ref(true)
    const isEditorLoading = ref(false)
    const workspaceSubpageCreating = ref(false)
    const workspaceSubpageTitle = ref('새 페이지')

    const subject = useWorkspaceQuickActions({
      editorApi,
      quickBlockOptions: ref([]),
      canModifyWorkspacePage,
      isEditorLoading,
      workspaceSubpageCreating,
      workspaceSubpageTitle,
    })

    expect(subject.canInsertWorkspaceQuickBlock.value).toBe(true)
    expect(subject.canStartWorkspaceSubpage.value).toBe(true)
    expect(subject.canCreateWorkspaceSubpage.value).toBe(true)

    workspaceSubpageTitle.value = '   '
    expect(subject.canCreateWorkspaceSubpage.value).toBe(false)

    workspaceSubpageTitle.value = '다시 작성'
    workspaceSubpageCreating.value = true
    expect(subject.canCreateWorkspaceSubpage.value).toBe(false)

    workspaceSubpageCreating.value = false
    isEditorLoading.value = true
    expect(subject.canInsertWorkspaceQuickBlock.value).toBe(false)
    expect(subject.canStartWorkspaceSubpage.value).toBe(false)

    isEditorLoading.value = false
    canModifyWorkspacePage.value = false
    expect(subject.canInsertWorkspaceQuickBlock.value).toBe(false)
    expect(subject.canStartWorkspaceSubpage.value).toBe(false)

    canModifyWorkspacePage.value = true
    editorApi.value = {}
    expect(subject.canInsertWorkspaceQuickBlock.value).toBe(false)
    expect(subject.canStartWorkspaceSubpage.value).toBe(false)
  })
})
