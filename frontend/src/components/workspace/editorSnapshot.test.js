import { describe, expect, it, vi } from 'vitest'

import {
  createEmptyEditorSnapshot,
  createInitialEditorSnapshotState,
  parseEditorSnapshot,
  parseInitialEditorSnapshot,
  withWorkspaceProperties,
} from './editorSnapshot.js'

describe('editorSnapshot', () => {
  it('parses editor snapshots from strings, objects, and empty values', () => {
    expect(createEmptyEditorSnapshot()).toEqual({ blocks: [] })
    expect(parseEditorSnapshot('')).toEqual({ blocks: [] })
    expect(parseEditorSnapshot('""')).toEqual({ blocks: [] })
    expect(parseEditorSnapshot('{"blocks":[{"id":"a"}]}')).toEqual({ blocks: [{ id: 'a' }] })

    const objectSnapshot = { blocks: [{ id: 'b' }], meta: { owner: 'me' } }
    expect(parseEditorSnapshot(objectSnapshot)).toBe(objectSnapshot)
  })

  it('reports parse errors and keeps empty fallback snapshots', () => {
    const onError = vi.fn()

    expect(parseEditorSnapshot('{broken', { onError })).toEqual({ blocks: [] })
    expect(onError).toHaveBeenCalledTimes(1)
  })

  it('normalizes initial snapshot state and seed contents', () => {
    expect(createInitialEditorSnapshotState(null)).toEqual({
      snapshot: { blocks: [] },
      hasInitialBlocks: false,
      contentsString: '',
    })

    expect(createInitialEditorSnapshotState({ meta: { ignored: true } })).toEqual({
      snapshot: { blocks: [] },
      hasInitialBlocks: false,
      contentsString: '',
    })

    const state = createInitialEditorSnapshotState({ blocks: [{ id: 'first' }] })
    expect(state.snapshot).toEqual({ blocks: [{ id: 'first' }] })
    expect(state.hasInitialBlocks).toBe(true)
    expect(state.contentsString).toBe('{"blocks":[{"id":"first"}]}')

    expect(parseInitialEditorSnapshot('{"blocks":[{"id":"from-string"}]}')).toEqual({
      blocks: [{ id: 'from-string' }],
    })
  })

  it('adds workspace properties and parent metadata without mutating the source snapshot', () => {
    const snapshot = { blocks: [], meta: { existing: true } }
    const result = withWorkspaceProperties(snapshot, {
      workspaceProperties: { status: 'draft' },
      workspaceParent: { id: ' 42 ', title: ' Parent page ' },
    })

    expect(result).toEqual({
      blocks: [],
      meta: {
        existing: true,
        workspaceProperties: { status: 'draft' },
        parentWorkspaceId: '42',
        parentWorkspaceTitle: 'Parent page',
      },
    })
    expect(snapshot).toEqual({ blocks: [], meta: { existing: true } })

    expect(withWorkspaceProperties({ blocks: [] }, { workspaceParent: { id: '', title: 'Hidden' } })).toEqual({
      blocks: [],
      meta: { parentWorkspaceId: '', parentWorkspaceTitle: '' },
    })
  })
})