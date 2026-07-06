import { describe, expect, it } from 'vitest'

import {
  buildWorkspaceRevisionDiffSnapshot,
  createWorkspaceRevisionDiffItems,
  createWorkspaceRevisionDiffSummary,
  normalizeWorkspaceRevision,
  stableWorkspaceStringify,
  stripWorkspaceText,
  workspaceBlockPreviewText,
} from './workspaceRevisionDiff.js'

const blockTypeLabel = (type) => ({
  image: 'Image',
  list: 'List',
  paragraph: 'Paragraph',
}[type] || 'Block')

const labels = {
  emptyTitle: 'Untitled',
  blockSuffix: 'block',
  truncationSuffix: '...',
}

describe('workspaceRevisionDiff', () => {
  it('normalizes backend revision aliases into the workspace revision model', () => {
    const revision = normalizeWorkspaceRevision({
      idx: 9,
      workspaceIdx: 42,
      actorIdx: 7,
      actorEmail: 'writer@example.com',
      contents: 'snapshot contents',
      reason: 'restore',
      createdAt: '2026-07-03T00:00:00.000Z',
    })

    expect(revision).toMatchObject({
      id: 9,
      workspaceId: 42,
      actorIdx: 7,
      actorName: 'writer@example.com',
      actorEmail: 'writer@example.com',
      title: '제목 없음',
      contents: 'snapshot contents',
      reason: 'RESTORE',
      contentLength: 'snapshot contents'.length,
    })
    expect(revision.createdAtLabel).toContain('2026')
  })

  it('serializes object signatures with stable key ordering', () => {
    expect(stableWorkspaceStringify({ b: 2, a: { d: 4, c: 3 } })).toBe('{"a":{"c":3,"d":4},"b":2}')
  })

  it('strips html and collapses whitespace for preview text', () => {
    expect(stripWorkspaceText(' <b>Hello</b>\n\t world ')).toBe('Hello world')
  })

  it('builds preview text from nested list items and fallback block labels', () => {
    expect(
      workspaceBlockPreviewText(
        { type: 'list', data: { items: [{ content: '<b>Parent</b>', items: ['Child'] }] } },
        { blockTypeLabel, labels },
      ),
    ).toBe('Parent')
    expect(workspaceBlockPreviewText({ type: 'image', data: {} }, { blockTypeLabel, labels })).toBe('Image block')
  })

  it('compares target revision blocks against the current snapshot', () => {
    const diff = buildWorkspaceRevisionDiffSnapshot({
      revision: { title: 'Target title' },
      currentTitle: 'Current title',
      blockTypeLabel,
      labels,
      currentSnapshot: {
        blocks: [
          { id: 'same', type: 'paragraph', data: { text: 'Old body' } },
          { id: 'gone', type: 'image', data: { file: { name: 'old.png' } } },
          { id: 'stable', type: 'paragraph', data: { text: 'Stable' } },
        ],
      },
      targetSnapshot: {
        blocks: [
          { id: 'same', type: 'paragraph', data: { text: 'New body' } },
          { id: 'new', type: 'list', data: { items: ['Added item'] } },
          { id: 'stable', type: 'paragraph', data: { text: 'Stable' } },
        ],
      },
    })

    expect(diff.titleChanged).toBe(true)
    expect(diff.currentTitle).toBe('Current title')
    expect(diff.targetTitle).toBe('Target title')
    expect(diff.changed).toMatchObject([
      {
        key: 'id:same',
        type: 'paragraph',
        typeLabel: 'Paragraph',
        preview: 'New body',
        previousPreview: 'Old body',
      },
    ])
    expect(diff.added).toMatchObject([{ key: 'id:new', preview: 'Added item' }])
    expect(diff.removed).toMatchObject([{ key: 'id:gone', preview: 'old.png' }])
    expect(diff.unchangedCount).toBe(1)
  })
  it('creates revision diff summary and display items', () => {
    const diff = {
      added: [{ key: 'a' }],
      changed: [{ key: 'c1' }, { key: 'c2' }],
      removed: [{ key: 'r' }],
    }

    expect(createWorkspaceRevisionDiffSummary(diff)).toEqual([
      { id: 'added', label: '복구될 블록', count: 1 },
      { id: 'changed', label: '변경될 블록', count: 2 },
      { id: 'removed', label: '사라질 블록', count: 1 },
    ])
    expect(createWorkspaceRevisionDiffItems(diff).map((item) => [item.key, item.kind, item.label])).toEqual([
      ['c1', 'changed', '변경'],
      ['c2', 'changed', '변경'],
      ['a', 'added', '복구'],
      ['r', 'removed', '삭제'],
    ])
    expect(createWorkspaceRevisionDiffItems(diff, 2)).toHaveLength(2)
    expect(createWorkspaceRevisionDiffSummary(null)).toEqual([])
    expect(createWorkspaceRevisionDiffItems(null)).toEqual([])
  })
})
