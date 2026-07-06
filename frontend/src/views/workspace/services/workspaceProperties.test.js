import { describe, expect, it } from 'vitest'

import {
  extractWorkspaceParentFromContents,
  extractWorkspacePropertiesFromContents,
  normalizeWorkspaceDocument,
  normalizeWorkspacePageIcon,
  normalizeWorkspaceProperties,
  normalizeWorkspacePropertyOption,
  normalizeWorkspacePropertyTags,
  normalizeWorkspaceShareStatus,
  serializeWorkspaceSnapshotWithParent,
  serializeWorkspaceSnapshotWithProperties,
} from './workspaceProperties.js'

const statusOptions = [{ id: 'planning' }, { id: 'active' }, { id: 'done' }]
const priorityOptions = [{ id: 'low' }, { id: 'normal' }, { id: 'urgent' }]
const coverColorOptions = [{ id: 'blue' }, { id: 'green' }]

describe('workspaceProperties', () => {
  it('normalizes listed workspace documents from different API shapes', () => {
    expect(normalizeWorkspaceDocument({ post_idx: 10, title: 'Plan', level: 'WRITE' }, 'shared')).toEqual({
      id: 10,
      title: 'Plan',
      updatedAt: null,
      status: 'Private',
      role: 'WRITE',
      scope: 'shared',
    })
    expect(normalizeWorkspaceDocument({ idx: 11 })).toMatchObject({
      id: 11,
      title: '\uC81C\uBAA9 \uC5C6\uC74C',
      role: 'ADMIN',
      scope: 'personal',
    })
  })

  it('normalizes share status and property option values', () => {
    expect(normalizeWorkspaceShareStatus(' public ')).toBe('Public')
    expect(normalizeWorkspaceShareStatus('unknown', true)).toBe('Shared')
    expect(normalizeWorkspaceShareStatus('unknown', false)).toBe('Private')
    expect(normalizeWorkspacePropertyOption(' ACTIVE ', statusOptions, 'planning')).toBe('active')
    expect(normalizeWorkspacePropertyOption('blocked', statusOptions, 'planning')).toBe('planning')
  })

  it('normalizes tags with trimming, de-duplication, limits, and max length', () => {
    const tags = normalizeWorkspacePropertyTags('alpha, beta, alpha, very-long-tag-name-1234567890, z, q, w, e, r')

    expect(tags).toEqual([
      'alpha',
      'beta',
      'very-long-tag-name-123456789',
      'z',
      'q',
      'w',
      'e',
      'r',
    ])
  })

  it('normalizes icons and workspace property payloads', () => {
    const rocket = String.fromCodePoint(0x1f680)
    const page = String.fromCodePoint(0x1f4c4)

    expect(normalizeWorkspacePageIcon(` ${rocket}go `)).toBe(`${rocket}g`)
    expect(normalizeWorkspacePageIcon('')).toBe(page)

    expect(normalizeWorkspaceProperties(
      {
        icon: 'ABCD',
        coverColor: 'GREEN',
        status: 'done',
        priority: 'URGENT',
        ownerEmail: ' owner@example.com ',
        dueDate: ' 2026-07-02 ',
        tags: ['one', 'two', 'one'],
        pageLocked: true,
      },
      { statusOptions, priorityOptions, coverColorOptions },
    )).toEqual({
      icon: 'AB',
      coverColor: 'green',
      status: 'done',
      priority: 'urgent',
      ownerEmail: 'owner@example.com',
      ownerName: 'owner@example.com',
      dueDate: '2026-07-02',
      tags: ['one', 'two'],
      locked: true,
    })
  })
  it('extracts and serializes workspace snapshot properties and parent metadata', () => {
    const contents = JSON.stringify({
      meta: {
        parentWorkspaceId: 7,
        parentWorkspaceTitle: 'Parent Page',
        workspaceProperties: {
          icon: 'XY',
          status: 'active',
          priority: 'urgent',
          ownerEmail: 'owner@example.com',
          dueDate: '2026-07-03',
          tags: ['one'],
          locked: true,
        },
      },
      blocks: [{ type: 'paragraph', data: { text: 'Body' } }],
    })

    expect(extractWorkspaceParentFromContents(contents)).toEqual({ id: '7', title: 'Parent Page' })
    expect(extractWorkspacePropertiesFromContents(contents, { statusOptions, priorityOptions, coverColorOptions }))
      .toMatchObject({ status: 'active', priority: 'urgent', ownerEmail: 'owner@example.com', locked: true })

    const withProperties = JSON.parse(serializeWorkspaceSnapshotWithProperties(
      contents,
      { status: 'done', priority: 'urgent', tags: 'alpha, beta', pageLocked: true },
      { statusOptions, priorityOptions, coverColorOptions },
    ))
    expect(withProperties.blocks).toHaveLength(1)
    expect(withProperties.meta.workspaceProperties).toMatchObject({
      status: 'done',
      priority: 'urgent',
      tags: ['alpha', 'beta'],
      locked: true,
    })

    const withParent = JSON.parse(serializeWorkspaceSnapshotWithParent(contents, { id: 11, title: 'New Parent' }))
    expect(withParent.meta.parentWorkspaceId).toBe('11')
    expect(withParent.meta.parentWorkspaceTitle).toBe('New Parent')

    const withoutParent = JSON.parse(serializeWorkspaceSnapshotWithParent(contents, { id: '', title: 'Ignored' }))
    expect(withoutParent.meta.parentWorkspaceId).toBe('')
    expect(withoutParent.meta.parentWorkspaceTitle).toBe('')
  })
})