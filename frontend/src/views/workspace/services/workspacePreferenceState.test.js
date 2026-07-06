import { describe, expect, it } from 'vitest'

import {
  createWorkspaceDocumentValidIdSet,
  createWorkspacePreferencePayload,
  findWorkspaceDocumentSectionId,
  hasWorkspacePreferenceContent,
  isWorkspaceDocumentFavorite,
  moveWorkspaceDocumentToSection,
  pruneRecentWorkspaceDocumentIds,
  toggleFavoriteWorkspaceDocumentIds,
  trackRecentWorkspaceDocumentIds,
  workspaceDocumentId,
} from './workspacePreferenceState.js'

describe('workspacePreferenceState', () => {
  it('builds normalized preference payloads', () => {
    expect(
      createWorkspacePreferencePayload({
        favoriteWorkspaceDocumentIds: [1, '1', 2],
        recentWorkspaceDocumentIds: [3, 4, 5],
        workspaceDocumentSections: [
          { id: 'team', name: ' Team ', documentIds: [1, 1, 2] },
        ],
        workspacePageIndexViews: [
          { id: 'active', name: ' Active ', filter: 'bad-filter', sort: 'bad-sort' },
        ],
      }),
    ).toEqual({
      favoriteWorkspaceIds: ['1', '2'],
      recentWorkspaceIds: ['3', '4', '5'],
      documentSections: [
        { id: 'team', name: 'Team', collapsed: false, documentIds: ['1', '2'] },
      ],
      pageIndexViews: [
        {
          id: 'active',
          name: 'Active',
          filter: 'all',
          query: '',
          tag: '',
          owner: '',
          sort: 'updated-desc',
        },
      ],
    })
  })

  it('detects whether a preference payload has user content', () => {
    expect(hasWorkspacePreferenceContent({})).toBe(false)
    expect(hasWorkspacePreferenceContent({ recentWorkspaceIds: [] })).toBe(false)
    expect(hasWorkspacePreferenceContent({ recentWorkspaceIds: ['10'] })).toBe(true)
  })

  it('creates valid document id sets only from persisted workspace ids', () => {
    const ids = createWorkspaceDocumentValidIdSet([
      { id: 10 },
      { id: '11' },
      { post_idx: 12 },
      { id: null },
    ])

    expect([...ids]).toEqual(['10', '11'])
    expect(createWorkspaceDocumentValidIdSet([{ post_idx: 12 }])).toBeNull()
  })

  it('prunes recent document ids against the visible workspace document set', () => {
    expect(
      pruneRecentWorkspaceDocumentIds(['10', '11', '12'], [{ id: 10 }, { id: 12 }]),
    ).toEqual(['10', '12'])

    expect(pruneRecentWorkspaceDocumentIds(['10'], [])).toEqual([])
  })

  it('tracks recent documents with the newest id first', () => {
    expect(workspaceDocumentId({ post_idx: 20 })).toBe(20)
    expect(trackRecentWorkspaceDocumentIds(['10', '20'], { id: 30 })).toEqual(['30', '10', '20'])
    expect(trackRecentWorkspaceDocumentIds(['10', '20'], { post_idx: 20 })).toEqual(['20', '10'])

    const currentIds = ['10']
    expect(trackRecentWorkspaceDocumentIds(currentIds, { id: 'new' })).toBe(currentIds)
  })

  it('finds and moves documents across preference sections', () => {
    const sections = [
      { id: 'a', name: 'A', documentIds: ['10', '11'] },
      { id: 'b', name: 'B', documentIds: ['12'] },
    ]

    expect(findWorkspaceDocumentSectionId(sections, { id: 11 })).toBe('a')
    expect(moveWorkspaceDocumentToSection(sections, { id: 11 }, 'b')).toEqual([
      { id: 'a', name: 'A', documentIds: ['10'] },
      { id: 'b', name: 'B', documentIds: ['12', '11'] },
    ])
    expect(moveWorkspaceDocumentToSection(sections, { id: null }, 'b')).toBe(sections)
  })

  it('toggles favorite document ids without mutating invalid documents', () => {
    expect(isWorkspaceDocumentFavorite(['10'], { id: 10 })).toBe(true)
    expect(toggleFavoriteWorkspaceDocumentIds(['10'], { id: 10 })).toEqual([])
    expect(toggleFavoriteWorkspaceDocumentIds(['10'], { id: 11 })).toEqual(['10', '11'])

    const currentIds = ['10']
    expect(toggleFavoriteWorkspaceDocumentIds(currentIds, { id: null })).toBe(currentIds)
  })
})
