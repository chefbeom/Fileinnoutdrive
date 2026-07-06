import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

import { useWorkspacePageTreeEditing } from './useWorkspacePageTreeEditing.js'

const rows = [
  { id: 'root', title: 'Root', treeDepth: 0 },
  { id: 'child', title: 'Child', parentWorkspaceId: 'root', treeDepth: 1 },
  { id: 'other', title: 'Other', treeDepth: 0 },
]

describe('useWorkspacePageTreeEditing', () => {
  it('opens rename and subpage editors exclusively and focuses inputs', async () => {
    const subject = useWorkspacePageTreeEditing({ workspacePageTreeAllRows: ref(rows) })
    const renameFocus = vi.fn()
    const renameSelect = vi.fn()
    const subpageFocus = vi.fn()
    subject.workspaceTreeRenameInput.value = { focus: renameFocus, select: renameSelect }
    subject.workspaceTreeSubpageInput.value = [{ focus: subpageFocus }]

    await subject.openWorkspaceTreeRename({ id: 'child', title: 'Child', canEditProperties: true })
    expect(subject.isWorkspaceTreeRenameOpen({ id: 'child' })).toBe(true)
    expect(subject.workspaceTreeRenameDraft.value).toBe('Child')
    expect(renameFocus).toHaveBeenCalledOnce()
    expect(renameSelect).toHaveBeenCalledOnce()

    await subject.openWorkspaceTreeSubpageComposer({ id: 'root', canEditProperties: true })
    expect(subject.isWorkspaceTreeRenameOpen({ id: 'child' })).toBe(false)
    expect(subject.isWorkspaceTreeSubpageComposerOpen({ id: 'root' })).toBe(true)
    expect(subject.workspaceTreeSubpageTitle.value).toBe('')
    expect(subpageFocus).toHaveBeenCalledOnce()
  })

  it('creates move target options and validates move state', () => {
    const subject = useWorkspacePageTreeEditing({ workspacePageTreeAllRows: ref(rows) })
    const node = { id: 'child', title: 'Child', parentWorkspaceId: 'root', canEditProperties: true }

    subject.openWorkspaceTreeMove(node)
    expect(subject.isWorkspaceTreeMoveOpen(node)).toBe(true)
    expect(subject.workspaceTreeMoveTargetId.value).toBe('root')
    expect(subject.canApplyWorkspaceTreeMove(node)).toBe(false)

    subject.workspaceTreeMoveTargetId.value = 'other'
    expect(subject.canApplyWorkspaceTreeMove(node)).toBe(true)
    expect(subject.workspaceTreeMoveTargetOptions(node).map((option) => option.id)).toEqual([
      '',
      'root',
      'other',
    ])

    subject.workspaceTreeMoveSavingId.value = 'child'
    expect(subject.canApplyWorkspaceTreeMove(node)).toBe(false)
  })

  it('prunes editing state when edited pages disappear', () => {
    const subject = useWorkspacePageTreeEditing({ workspacePageTreeAllRows: ref(rows) })
    subject.workspaceTreeSubpageComposerParentId.value = 'root'
    subject.workspaceTreeSubpageTitle.value = 'New child'
    subject.workspaceTreeRenamingId.value = 'child'
    subject.workspaceTreeRenameDraft.value = 'Child draft'
    subject.workspaceTreeMovingId.value = 'other'
    subject.workspaceTreeMoveTargetId.value = 'root'

    subject.pruneWorkspaceTreeEditingState(new Set(['root']))

    expect(subject.isWorkspaceTreeSubpageComposerOpen({ id: 'root' })).toBe(true)
    expect(subject.workspaceTreeRenamingId.value).toBe('')
    expect(subject.workspaceTreeMovingId.value).toBe('')
  })
})
