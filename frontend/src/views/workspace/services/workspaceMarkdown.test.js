import { describe, expect, it } from 'vitest'

import {
  buildWorkspaceMarkdownExport,
  collectWorkspaceSnapshotText,
  workspaceExportFileName,
  workspaceMarkdownInline,
  workspaceMarkdownListItems,
  workspaceSnapshotBlockToMarkdown,
} from './workspaceMarkdown.js'

describe('workspaceMarkdown', () => {
  it('extracts readable text from nested snapshot values', () => {
    expect(collectWorkspaceSnapshotText({ blocks: ['<b>Hello</b>', { text: 'world&nbsp;now' }] })).toBe('Hello world now')
  })

  it('converts inline editor html to markdown-safe text', () => {
    expect(workspaceMarkdownInline('Hello&nbsp;<b>*team*</b><br><a href="/w/1">Roadmap</a>')).toBe(
      'Hello *team*\n[Roadmap](/w/1)',
    )
  })

  it('renders nested checklist items', () => {
    const items = [
      {
        content: 'Release',
        meta: { checked: true },
        items: [{ content: 'Notify users', checked: false }],
      },
    ]

    expect(workspaceMarkdownListItems(items)).toBe('- [x] Release\n  - [ ] Notify users')
  })

  it('renders common EditorJS blocks', () => {
    expect(workspaceSnapshotBlockToMarkdown({ type: 'header', data: { level: 1, text: 'Plan' } })).toBe('# Plan')
    expect(workspaceSnapshotBlockToMarkdown({ type: 'table', data: { content: [['A|B'], ['1']] } })).toBe(
      '| A\\|B |\n| --- |\n| 1 |',
    )
    expect(workspaceSnapshotBlockToMarkdown({ type: 'image', data: { file: { url: '/img.png' }, caption: 'Logo' } })).toBe(
      '![Logo](/img.png)',
    )
  })

  it('builds full markdown export with page metadata', () => {
    const markdown = buildWorkspaceMarkdownExport(
      { blocks: [{ type: 'paragraph', data: { text: 'Ship it' } }] },
      {
        pageTitle: 'Launch',
        statusLabel: '진행 중',
        priorityLabel: '높음',
        ownerLabel: 'dev@example.com',
        dueDate: '2026-07-03',
        tags: ['release', 'ops'],
      },
    )

    expect(markdown).toContain('# Launch')
    expect(markdown).toContain('- 상태: 진행 중')
    expect(markdown).toContain('- 우선순위: 높음')
    expect(markdown).toContain('- 담당자: dev@example.com')
    expect(markdown).toContain('- 기한: 2026-07-03')
    expect(markdown).toContain('- 태그: #release #ops')
    expect(markdown).toContain('Ship it')
  })

  it('sanitizes markdown file names', () => {
    expect(workspaceExportFileName('Team: Launch / Q3?')).toBe('Team- Launch - Q3-.md')
    expect(workspaceExportFileName('')).toBe('workspace-page.md')
  })
})
