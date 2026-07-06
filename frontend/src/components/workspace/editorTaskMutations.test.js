import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  appendChecklistTaskToSnapshot,
  normalizeTaskPath,
  readChecklistTaskChecked,
  resolveChecklistTaskTarget,
  toggleChecklistTaskInSnapshot,
} from './editorTaskMutations.js'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('editorTaskMutations', () => {
  it('normalizes task paths from explicit arrays, ids, and labels', () => {
    expect(normalizeTaskPath({ path: ['0', 2, -1, 'x'] })).toEqual([0, 2])
    expect(normalizeTaskPath({ id: 'task:list-1:1.0' })).toEqual([1, 0])
    expect(normalizeTaskPath({ pathLabel: '2.3' })).toEqual([2, 3])
    expect(normalizeTaskPath({})).toEqual([])
  })

  it('resolves and toggles nested checklist tasks in a snapshot', () => {
    const snapshot = {
      blocks: [{
        id: 'list-1',
        type: 'list',
        data: {
          style: 'checklist',
          items: [{
            content: 'Parent',
            meta: { checked: false, priority: 'high' },
            items: [{ content: 'Child', checked: true, items: [] }],
          }],
        },
      }],
    }

    const target = resolveChecklistTaskTarget(snapshot.blocks, {
      anchorBlockId: 'list-1',
      blockIndex: 0,
      path: [0, 0],
    })

    expect(target?.item?.content).toBe('Child')
    expect(readChecklistTaskChecked(target.item)).toBe(true)

    expect(toggleChecklistTaskInSnapshot(snapshot, {
      anchorBlockId: 'list-1',
      blockIndex: 0,
      path: [0, 0],
    })).toEqual({ changed: true, anchorBlockId: 'list-1', checked: false })

    expect(snapshot.blocks[0].data.items[0].items[0].meta).toEqual({ checked: false })
  })

  it('appends checklist tasks by creating or reusing checklist blocks', () => {
    vi.spyOn(Date, 'now').mockReturnValue(2000)
    vi.spyOn(Math, 'random').mockReturnValue(0.25)

    const emptySnapshot = { blocks: [] }
    const created = appendChecklistTaskToSnapshot(emptySnapshot, { text: '<b>Ship</b> release' })

    expect(created.anchorBlockId).toMatch(/^task-2000-/)
    expect(emptySnapshot.blocks).toHaveLength(1)
    expect(emptySnapshot.blocks[0]).toMatchObject({
      type: 'list',
      data: {
        style: 'checklist',
        items: [{ content: 'Ship release', meta: { checked: false }, items: [] }],
      },
    })

    const existingSnapshot = {
      blocks: [{ id: 'tasks', type: 'list', data: { style: 'checklist', items: [] } }],
    }
    expect(appendChecklistTaskToSnapshot(existingSnapshot, 'Follow up')).toEqual({
      changed: true,
      anchorBlockId: 'tasks',
    })
    expect(existingSnapshot.blocks[0].data.items[0].content).toBe('Follow up')
    expect(appendChecklistTaskToSnapshot(existingSnapshot, '   ')).toEqual({ changed: false, anchorBlockId: '' })
  })
})