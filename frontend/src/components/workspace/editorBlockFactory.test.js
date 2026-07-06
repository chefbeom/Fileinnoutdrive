import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  buildWorkspacePageLinkBlock,
  buildWorkspaceQuickBlock,
  createChecklistTaskItem,
  normalizeWorkspaceBlockInput,
  normalizeWorkspacePageLinkInput,
} from './editorBlockFactory.js'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('editorBlockFactory', () => {
  it('creates sanitized checklist task items with metadata', () => {
    expect(createChecklistTaskItem({
      text: '<b>Review</b> storage flow',
      assigneeEmail: ' owner@example.com ',
      assigneeName: 'Owner',
      dueDate: '2026-07-06',
    })).toEqual({
      content: 'Review storage flow',
      meta: {
        checked: false,
        assigneeEmail: 'owner@example.com',
        assigneeName: 'Owner',
        dueDate: '2026-07-06',
      },
      items: [],
    })

    expect(createChecklistTaskItem('   ')).toBeNull()
  })

  it('normalizes workspace page link input and builds escaped link blocks', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1000)
    vi.spyOn(Math, 'random').mockReturnValue(0.123456)

    expect(normalizeWorkspacePageLinkInput({ idx: 42, title: '<i>Roadmap</i>' })).toEqual({
      id: '42',
      title: 'Roadmap',
      path: '/workspace/read/42',
    })

    expect(buildWorkspacePageLinkBlock({
      id: 'page<1>',
      title: 'A&B',
      path: '/workspace/read/page%3C1%3E?x=<tag>',
    })).toEqual({
      id: expect.stringMatching(/^workspace-link-1000-/),
      type: 'paragraph',
      data: {
        text: '<a href="/workspace/read/page%3C1%3E?x=&lt;tag&gt;" data-workspace-page-id="page&lt;1&gt;">↗ A&amp;B</a>',
      },
    })
  })

  it('normalizes quick block inputs and creates EditorJS blocks', () => {
    expect(normalizeWorkspaceBlockInput({ type: 'HEADER', text: '<b>Title</b>', level: 9 })).toEqual({
      type: 'header',
      text: 'Title',
      level: 4,
    })

    expect(buildWorkspaceQuickBlock({ type: 'header', text: 'Title & details', level: 3 })).toEqual({
      id: expect.stringMatching(/^quick-header-/),
      type: 'header',
      data: { text: 'Title &amp; details', level: 3 },
    })

    expect(buildWorkspaceQuickBlock({ type: 'table' })).toMatchObject({
      type: 'table',
      data: {
        withHeadings: true,
        content: [
          ['항목', '내용'],
          ['', ''],
        ],
      },
    })
  })
})