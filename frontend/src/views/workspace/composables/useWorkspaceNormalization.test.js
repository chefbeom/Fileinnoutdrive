import { describe, expect, it } from 'vitest'
import { ref } from 'vue'

import { useWorkspaceNormalization } from './useWorkspaceNormalization.js'

describe('useWorkspaceNormalization', () => {
  const propertyOptions = {
    coverColorOptions: [{ id: 'green' }, { id: 'blue' }],
    statusOptions: [{ id: 'planning' }, { id: 'active' }],
    priorityOptions: [{ id: 'normal' }, { id: 'high' }],
  }

  it('binds workspace-scoped normalizers to the current workspace id', () => {
    const workspaceId = ref(42)
    const subject = useWorkspaceNormalization({ workspaceId, propertyOptions })

    expect(subject.normalizeWorkspaceAsset({ id: 1, originalName: 'notes.txt' }).workspaceId).toBe(42)
    expect(subject.normalizeWorkspaceComment({ id: 2, contents: 'hello' }).workspaceId).toBe(42)
    expect(subject.normalizeWorkspaceRevision({ id: 3, title: 'Draft' }).workspaceId).toBe(42)

    workspaceId.value = 77
    expect(subject.normalizeWorkspaceAsset({ id: 4, originalName: 'next.txt' }).workspaceId).toBe(77)
  })

  it('normalizes workspace properties and snapshot metadata through shared options', () => {
    const subject = useWorkspaceNormalization({ workspaceId: ref(5), propertyOptions })
    const snapshot = JSON.stringify({ blocks: [], meta: { workspaceProperties: { status: 'active', priority: 'high', coverColor: 'blue', tags: 'ops, release' } } })

    expect(subject.extractWorkspacePropertiesFromContents(snapshot)).toMatchObject({
      status: 'active',
      priority: 'high',
      coverColor: 'blue',
      tags: ['ops', 'release'],
    })

    const serialized = JSON.parse(subject.serializeWorkspaceSnapshotWithProperties(snapshot, {
      status: 'missing',
      priority: 'high',
      coverColor: 'green',
      tags: ['one', 'two'],
    }))

    expect(serialized.meta.workspaceProperties).toMatchObject({
      status: 'planning',
      priority: 'high',
      coverColor: 'green',
      tags: ['one', 'two'],
    })
  })

  it('passes parent metadata helpers through unchanged', () => {
    const subject = useWorkspaceNormalization({ workspaceId: ref(1), propertyOptions })
    const withParent = subject.serializeWorkspaceSnapshotWithParent('{"blocks":[]}', { id: 9, title: 'Parent' })

    expect(subject.extractWorkspaceParentFromContents(withParent)).toEqual({
      id: '9',
      title: 'Parent',
    })
  })
})
