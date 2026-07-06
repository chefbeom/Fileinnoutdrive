import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  createWorkspacePageIndexViewId,
  createWorkspacePageIndexViewSummary,
  createWorkspaceSectionId,
  normalizeFavoriteWorkspaceIds,
  normalizeRecentWorkspaceIds,
  normalizeWorkspaceDocumentSections,
  normalizeWorkspacePageIndexViews,
  workspacePageIndexViewSignature,
} from './workspacePreferences.js'

describe('workspacePreferences', () => {
  it('normalizes favorite and recent document ids', () => {
    expect(normalizeFavoriteWorkspaceIds([1, '1', 2, '', null, 3])).toEqual(['1', '2', '3'])
    expect(normalizeRecentWorkspaceIds([1, 2, 3, 4], 2)).toEqual(['1', '2'])
  })

  it('normalizes document sections with duplicate and invalid document ids removed', () => {
    expect(
      normalizeWorkspaceDocumentSections(
        [
          { id: ' alpha ', name: '  Team docs  ', collapsed: 1, documentIds: [10, 11, 10] },
          { id: 'beta', name: 'Archive', documentIds: [11, 12, 13] },
          { id: 'beta', name: 'Duplicate section', documentIds: [14] },
          { id: 'missing-name', name: '   ', documentIds: [15] },
        ],
        new Set(['10', '11', '12']),
      ),
    ).toEqual([
      { id: 'alpha', name: 'Team docs', collapsed: true, documentIds: ['10', '11'] },
      { id: 'beta', name: 'Archive', collapsed: false, documentIds: ['12'] },
    ])
  })

  it('normalizes page index views and falls back unsupported filters and sorts', () => {
    expect(
      normalizeWorkspacePageIndexViews([
        {
          id: 'view-1',
          name: '  My View  ',
          filter: 'unknown',
          query: ` ${'a'.repeat(90)} `,
          tag: ' Tag ',
          owner: 'OWNER@EXAMPLE.COM ',
          sort: 'bad-sort',
        },
        { id: 'view-2', name: 'my view', filter: 'active' },
      ]),
    ).toEqual([
      {
        id: 'view-1',
        name: 'My View',
        filter: 'all',
        query: 'a'.repeat(80),
        tag: 'tag',
        owner: 'owner@example.com',
        sort: 'updated-desc',
      },
    ])
  })

  it('builds stable page index view signatures', () => {
    expect(
      workspacePageIndexViewSignature({
        filter: 'active',
        query: ' Roadmap ',
        tag: ' Launch ',
        owner: 'OWNER@EXAMPLE.COM ',
        sort: 'title-asc',
      }),
    ).toBe('active|roadmap|launch|owner@example.com|title-asc')
  })


  it('summarizes saved page index view filters for compact UI labels', () => {
    expect(
      createWorkspacePageIndexViewSummary(
        {
          filter: 'active',
          sort: 'title-asc',
          query: 'Launch',
          tag: 'roadmap',
          owner: 'owner@example.com',
        },
        {
          filterOptions: [{ id: 'active', label: '진행 중' }],
          sortOptions: [{ id: 'title-asc', label: '제목순' }],
          ownerOptions: [{ id: 'owner@example.com', label: 'Owner Name' }],
        },
      ),
    ).toBe('진행 중 · 제목순 · #roadmap · Owner Name · "Launch"')
  })

  it('summarizes page index views with sensible defaults when optional filters are empty', () => {
    expect(createWorkspacePageIndexViewSummary({})).toBe('전체 · 최근 수정순 · 태그 전체 · 담당자 전체 · 검색어 없음')
  })
  it('creates prefixed workspace preference ids', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1234567890)
    vi.spyOn(Math, 'random').mockReturnValue(0.5)

    expect(createWorkspaceSectionId()).toMatch(/^section-/)
    expect(createWorkspacePageIndexViewId()).toMatch(/^page-index-view-/)
  })
})