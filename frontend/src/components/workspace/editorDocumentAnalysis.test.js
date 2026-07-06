import { describe, expect, it } from 'vitest'

import {
  blockAnchorFromSnapshot,
  collectBlockText,
  createDocumentOutline,
  createDocumentStats,
  createDocumentTasks,
  escapeHtml,
  stripBlockText,
} from './editorDocumentAnalysis.js'

describe('editorDocumentAnalysis', () => {
  it('normalizes rich block text and escapes html for inserted blocks', () => {
    expect(stripBlockText('<b>Hello</b>&nbsp; world')).toBe('Hello world')
    expect(collectBlockText({ text: '<i>Alpha</i>', items: [{ content: 'Beta' }] })).toBe('Alpha Beta')
    expect(escapeHtml('<a href="x">Tom & Jerry</a>')).toBe('&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&lt;/a&gt;')
  })

  it('builds document outline and checklist tasks from EditorJS blocks', () => {
    const blocks = [
      { id: 'h1', type: 'header', data: { text: 'Project Plan', level: 2 } },
      {
        id: 'tasks',
        type: 'list',
        data: {
          style: 'checklist',
          items: [
            {
              content: 'Review storage flow',
              meta: { checked: true, assigneeEmail: 'owner@example.com', dueDate: '2026-07-05' },
              items: [{ content: 'Check rollback cleanup', meta: { checked: false } }],
            },
          ],
        },
      },
    ]

    expect(createDocumentOutline(blocks)).toEqual([
      expect.objectContaining({
        id: 'h1',
        anchorBlockId: 'h1',
        anchorText: 'Project Plan',
        level: 2,
        index: 0,
      }),
    ])

    expect(createDocumentTasks(blocks)).toEqual([
      expect.objectContaining({
        id: 'tasks:0',
        text: 'Review storage flow',
        checked: true,
        assigneeEmail: 'owner@example.com',
        dueDate: '2026-07-05',
        pathLabel: '1',
      }),
      expect.objectContaining({
        id: 'tasks:0.0',
        text: 'Check rollback cleanup',
        checked: false,
        depth: 1,
        pathLabel: '1.1',
      }),
    ])
  })

  it('collects document stats and workspace links', () => {
    const blocks = [
      {
        id: 'intro',
        type: 'paragraph',
        data: {
          text: 'Open <a href="/workspace/read/42" data-workspace-page-id="42">↗ Linked page</a>',
        },
      },
      { id: 'image-1', type: 'image', data: { caption: 'Architecture diagram' } },
      { id: 'task-1', type: 'list', data: { style: 'checklist', items: [{ content: 'Ship it' }] } },
    ]

    const result = createDocumentStats(blocks)

    expect(result.stats).toMatchObject({
      blockCount: 3,
      textBlockCount: 3,
      imageCount: 1,
      checklistBlockCount: 1,
    })
    expect(result.searchText).toContain('Open ↗ Linked page')
    expect(result.searchText).toContain('Architecture diagram')
    expect(result.workspaceLinks).toEqual([
      expect.objectContaining({
        documentId: '42',
        title: 'Linked page',
        path: '/workspace/read/42',
        anchorBlockId: 'intro',
        anchorText: 'Open ↗ Linked page',
      }),
    ])
  })

  it('uses fallback anchors for blocks without explicit ids or text', () => {
    expect(blockAnchorFromSnapshot({ type: 'delimiter', data: {} }, 3)).toEqual({
      anchorBlockId: 'index-3',
      anchorBlockType: 'delimiter',
      anchorText: '구분선 블록',
    })
  })
})