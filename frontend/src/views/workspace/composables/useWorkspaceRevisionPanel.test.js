import { describe, expect, it } from 'vitest'
import { computed, ref } from 'vue'

import { useWorkspaceRevisionPanel } from './useWorkspaceRevisionPanel.js'

const blockTypeLabel = (type) => ({
  header: 'Header',
  paragraph: 'Paragraph',
}[type] || 'Block')

describe('useWorkspaceRevisionPanel', () => {
  it('summarizes revision state and restore eligibility', () => {
    const workspaceRevisions = ref([{ id: 1 }, { id: 2 }])
    const workspaceRevisionDiff = ref({
      added: [{ key: 'a' }],
      changed: [{ key: 'c' }],
      removed: [],
    })
    const canModifyWorkspacePage = ref(true)
    const activeWorkspaceRevision = ref({ id: 2 })
    const subject = useWorkspaceRevisionPanel({
      workspaceRevisions,
      workspaceId: ref('workspace-1'),
      canModifyWorkspacePage: computed(() => canModifyWorkspacePage.value),
      activeWorkspaceRevision,
      workspaceRevisionDiff,
      title: ref('Current'),
      blockTypeLabel,
    })

    expect(subject.workspaceRevisionCount.value).toBe(2)
    expect(subject.canRestoreWorkspaceRevision.value).toBe(true)
    expect(subject.workspaceRevisionDiffSummary.value.map(({ id, count }) => [id, count])).toEqual([
      ['added', 1],
      ['changed', 1],
      ['removed', 0],
    ])
    expect(subject.workspaceRevisionDiffItems.value.map(({ key, kind }) => [key, kind])).toEqual([
      ['c', 'changed'],
      ['a', 'added'],
    ])

    activeWorkspaceRevision.value = null
    expect(subject.canRestoreWorkspaceRevision.value).toBe(false)

    activeWorkspaceRevision.value = { id: 2 }
    canModifyWorkspacePage.value = false
    expect(subject.canRestoreWorkspaceRevision.value).toBe(false)
  })

  it('builds a diff between the active editor snapshot and target revision contents', async () => {
    const editorApi = ref({
      getCurrentSnapshot: async () => ({
        blocks: [
          { id: 'same', type: 'paragraph', data: { text: '현재 내용' } },
          { id: 'gone', type: 'paragraph', data: { text: '삭제될 내용' } },
        ],
      }),
    })
    const subject = useWorkspaceRevisionPanel({
      workspaceRevisions: ref([]),
      workspaceId: ref('workspace-1'),
      canModifyWorkspacePage: ref(true),
      activeWorkspaceRevision: ref({ id: 1 }),
      workspaceRevisionDiff: ref(null),
      editorApi,
      title: ref('현재 제목'),
      blockTypeLabel,
    })

    const diff = await subject.buildWorkspaceRevisionDiff({
      id: 1,
      title: '복구 제목',
      contents: JSON.stringify({
        blocks: [
          { id: 'same', type: 'paragraph', data: { text: '복구 내용' } },
          { id: 'new', type: 'header', data: { text: '새 블록' } },
        ],
      }),
    })

    expect(diff.titleChanged).toBe(true)
    expect(diff.currentTitle).toBe('현재 제목')
    expect(diff.targetTitle).toBe('복구 제목')
    expect(diff.changed).toMatchObject([{ key: 'id:same', preview: '복구 내용', previousPreview: '현재 내용' }])
    expect(diff.added).toMatchObject([{ key: 'id:new', typeLabel: 'Header', preview: '새 블록' }])
    expect(diff.removed).toMatchObject([{ key: 'id:gone', preview: '삭제될 내용' }])
  })
})
