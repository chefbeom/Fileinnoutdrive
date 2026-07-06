import { describe, expect, it } from 'vitest'

import { buildWorkspaceSubpageSnapshot, buildWorkspaceTemplateData } from './workspaceTemplates.js'

const propertyOptions = {
  coverColorOptions: [{ id: 'blue' }, { id: 'green' }],
  statusOptions: [{ id: 'planning' }, { id: 'done' }],
  priorityOptions: [{ id: 'normal' }, { id: 'high' }],
}

describe('workspaceTemplates', () => {
  it('builds an EditorJS snapshot with stable template block ids', () => {
    const template = {
      id: 'meeting',
      blocks: [
        { type: 'header', data: { text: '회의록', level: 1 } },
        {
          type: 'list',
          data: {
            style: 'checklist',
            items: [
              { content: '담당자 / 할 일 / 기한', meta: { checked: false }, items: [] },
            ],
          },
        },
      ],
    }

    expect(buildWorkspaceTemplateData(template, 1234)).toEqual({
      time: 1234,
      blocks: [
        { id: 'template-meeting-1234-0', type: 'header', data: { text: '회의록', level: 1 } },
        {
          id: 'template-meeting-1234-1',
          type: 'list',
          data: {
            style: 'checklist',
            items: [
              { content: '담당자 / 할 일 / 기한', meta: { checked: false }, items: [] },
            ],
          },
        },
      ],
    })
  })

  it('deep clones template blocks before assigning ids', () => {
    const template = {
      id: 'project',
      blocks: [{ id: 'source-id', type: 'paragraph', data: { nested: { value: 'source' } } }],
    }

    const snapshot = buildWorkspaceTemplateData(template, 99)

    snapshot.blocks[0].data.nested.value = 'changed'
    expect(template.blocks[0]).toEqual({
      id: 'source-id',
      type: 'paragraph',
      data: { nested: { value: 'source' } },
    })
  })

  it('returns an empty snapshot for a missing template', () => {
    expect(buildWorkspaceTemplateData(null, 7)).toEqual({ time: 7, blocks: [] })
  })

  it('builds a subpage snapshot with parent link and inherited workspace properties', () => {
    const snapshot = JSON.parse(buildWorkspaceSubpageSnapshot({
      parentId: 'parent-1',
      parentTitle: 'Parent Page',
      pageTitle: 'Child Page',
      currentProperties: {
        coverColor: 'green',
        priority: 'high',
        ownerEmail: 'owner@example.com',
        ownerName: 'Owner',
        tags: ['alpha', 'alpha', 'beta'],
      },
      propertyOptions,
      timestamp: 42,
    }))

    expect(snapshot).toEqual({
      time: 42,
      blocks: [
        { id: 'subpage-title-42', type: 'header', data: { text: 'Child Page', level: 1 } },
        {
          id: 'subpage-parent-42',
          type: 'paragraph',
          data: {
            text: '<a href="/workspace/read/parent-1" data-workspace-page-id="parent-1">← Parent Page</a>',
          },
        },
        { id: 'subpage-body-42', type: 'paragraph', data: { text: '' } },
      ],
      meta: {
        parentWorkspaceId: 'parent-1',
        parentWorkspaceTitle: 'Parent Page',
        workspaceProperties: {
          icon: '📄',
          coverColor: 'green',
          status: 'planning',
          priority: 'high',
          ownerEmail: 'owner@example.com',
          ownerName: 'Owner',
          dueDate: '',
          tags: ['alpha', 'beta'],
          locked: false,
        },
      },
    })
  })

  it('escapes subpage title and parent link text before embedding inline HTML', () => {
    const snapshot = JSON.parse(buildWorkspaceSubpageSnapshot({
      parentId: 'p"1',
      parentTitle: 'Parent <One>',
      pageTitle: '<script>"x"</script>',
      propertyOptions,
      timestamp: 5,
    }))

    expect(snapshot.blocks[0].data.text).toBe('&lt;script&gt;&quot;x&quot;&lt;/script&gt;')
    expect(snapshot.blocks[1].data.text).toBe(
      '<a href="/workspace/read/p%221" data-workspace-page-id="p&quot;1">← Parent &lt;One&gt;</a>',
    )
  })
})