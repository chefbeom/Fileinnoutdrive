import { describe, expect, it } from 'vitest'

import {
  buildWorkspaceBreadcrumbTrail,
  createWorkspaceBacklinkResult,
  collectWorkspaceDocumentSectionIds,
  countWorkspaceSectionedDocuments,
  createWorkspaceFullTextSearchResult,
  createLinkedWorkspaceDocuments,
  createWorkspaceDocumentSectionViews,
  createWorkspaceDocumentAbsoluteUrl,
  createWorkspaceDocumentPath,
  createWorkspaceLookupMap,
  escapeWorkspaceInlineHtml,
  extractSavedWorkspaceId,
  filterFavoriteWorkspaceDocuments,
  filterUnsectionedWorkspaceDocuments,
  filterVisibleWorkspaceDocumentSectionViews,
  filterWorkspaceDocuments,
  linkedWorkspaceDocumentEmptyLabel,
  listCurrentWorkspaceChildPages,
  listRecentWorkspaceDocuments,
} from './workspaceDocuments.js'

describe('workspaceDocuments', () => {
  it('builds document paths, absolute URLs, saved ids, and safe inline HTML', () => {
    expect(createWorkspaceDocumentPath({ id: 'page 1' })).toBe('/workspace/read/page%201')
    expect(createWorkspaceDocumentPath({ post_idx: 42 })).toBe('/workspace/read/42')
    expect(createWorkspaceDocumentPath({})).toBe('')
    expect(createWorkspaceDocumentAbsoluteUrl({ id: 'page 1' }, { origin: 'https://app.fileinnout.local' }))
      .toBe('https://app.fileinnout.local/workspace/read/page%201')
    expect(createWorkspaceDocumentAbsoluteUrl({ id: 'page 1' })).toBe('/workspace/read/page%201')
    expect(createWorkspaceDocumentAbsoluteUrl({ id: 'page 1' }, { origin: 'not a url' })).toBe('/workspace/read/page%201')

    expect(extractSavedWorkspaceId({ result: { body: { idx: 9 } } })).toBe(9)
    expect(extractSavedWorkspaceId({ data: { idx: 10 } })).toBe(10)
    expect(extractSavedWorkspaceId({ idx: 11 })).toBe(11)
    expect(extractSavedWorkspaceId({})).toBeNull()

    expect(escapeWorkspaceInlineHtml(`A&B <tag attr="value">'`))
      .toBe('A&amp;B &lt;tag attr=&quot;value&quot;&gt;&#39;')
  })
  it('builds breadcrumb trails from page index and listed documents with loop guards', () => {
    const pageIndexRowById = createWorkspaceLookupMap([
      { id: 'parent', title: 'Parent', parentWorkspaceId: 'root', parentWorkspaceTitle: 'Root', accessRole: 'WRITE', updatedAt: '2026-07-03T00:00:00Z' },
      { id: 'root', title: 'Root', accessRole: 'ADMIN' },
    ])
    const documentById = createWorkspaceLookupMap([{ id: 'fallback', title: 'Fallback', role: 'READ' }])
    const trail = buildWorkspaceBreadcrumbTrail({
      currentId: 'child',
      parentId: 'parent',
      pageIndexRowById,
      documentById,
      roleLabelFor: (role) => `role:${role}`,
      formatDocumentTimeFor: () => 'formatted',
    })

    expect(trail.map((page) => page.id)).toEqual(['root', 'parent'])
    expect(trail[1]).toMatchObject({ title: 'Parent', roleLabel: 'role:WRITE', updatedLabel: 'formatted' })

    expect(buildWorkspaceBreadcrumbTrail({ currentId: 'same', parentId: 'same', pageIndexRowById })).toEqual([])
  })
  it('builds full-text search results from title or body matches', () => {
    const document = { id: 7, title: 'Fallback', role: 'READ', scope: 'shared', updatedAt: '2026-07-01T00:00:00.000Z' }
    const titleMatch = createWorkspaceFullTextSearchResult(
      document,
      { title: 'Launch Plan', accessRole: 'WRITE', updatedAt: '2026-07-03T00:00:00.000Z', contents: JSON.stringify({ blocks: [] }) },
      'launch',
      { roleLabelFor: (role) => `role:${role}`, formatDocumentTimeFor: () => 'formatted' },
    )
    const bodyMatch = createWorkspaceFullTextSearchResult(
      document,
      { title: 'Other', contents: JSON.stringify({ blocks: [{ type: 'paragraph', data: { text: 'Alpha body content' } }] }) },
      'body',
      { roleLabelFor: (role) => `role:${role}`, formatDocumentTimeFor: () => 'formatted' },
    )

    expect(titleMatch).toMatchObject({
      id: 7,
      title: 'Launch Plan',
      scopeLabel: '공유 페이지',
      roleLabel: 'role:WRITE',
      updatedLabel: 'formatted',
      matchType: 'title',
      matchTypeLabel: '제목',
      snippet: '제목에서 검색어가 발견되었습니다.',
    })
    expect(bodyMatch).toMatchObject({ matchType: 'body', matchTypeLabel: '본문' })
    expect(bodyMatch.snippet).toContain('Alpha body content')
    expect(createWorkspaceFullTextSearchResult(document, { title: 'Other', contents: JSON.stringify({ blocks: [] }) }, 'missing')).toBeNull()
  })

  it('builds backlink results from explicit links or title mentions', () => {
    const document = { id: 'source', title: 'Fallback', role: 'READ', scope: 'personal', updatedAt: '2026-07-01T00:00:00.000Z' }
    const options = { roleLabelFor: (role) => 'role:' + role, formatDocumentTimeFor: () => 'formatted' }
    const explicit = createWorkspaceBacklinkResult(
      document,
      {
        title: 'Linked Source',
        accessRole: 'ADMIN',
        updatedAt: '2026-07-03T00:00:00.000Z',
        contents: JSON.stringify({ blocks: [{ type: 'paragraph', data: { text: '<a data-workspace-page-id="target">Target</a>' } }] }),
      },
      'target',
      'Other Page',
      options,
    )
    const mention = createWorkspaceBacklinkResult(
      document,
      {
        title: 'Mention Source',
        contents: JSON.stringify({ blocks: [{ type: 'paragraph', data: { text: 'Alpha Project is referenced here.' } }] }),
      },
      'target',
      'Alpha Project',
      options,
    )

    expect(explicit).toMatchObject({
      id: 'source',
      title: 'Linked Source',
      scopeLabel: '내 페이지',
      roleLabel: 'role:ADMIN',
      updatedLabel: 'formatted',
      backlinkSource: 'explicit',
      backlinkSourceLabel: '삽입된 링크',
    })
    expect(mention).toMatchObject({ backlinkSource: 'mention', backlinkSourceLabel: '제목 언급' })
    expect(mention.backlinkPreview).toContain('Alpha Project')
    expect(createWorkspaceBacklinkResult(document, { title: 'No Match', contents: JSON.stringify({ blocks: [] }) }, 'target', 'No')).toBeNull()
  })

  it('filters documents and section views', () => {
    const documents = [
      { id: 1, title: 'Alpha', status: 'Private', role: 'ADMIN', scope: 'personal' },
      { id: 2, title: 'Beta', status: 'Shared', role: 'READ', scope: 'shared' },
      { id: 3, title: 'Gamma', status: 'Private', role: 'WRITE', scope: 'personal' },
    ]
    const filtered = filterWorkspaceDocuments(documents, 'read')
    const documentsById = createWorkspaceLookupMap(documents)
    const sections = [
      { id: 's1', name: '첫 섹션', documentIds: [1, 2, 2, null] },
      { id: 's2', name: '둘째', documentIds: [3] },
    ]
    const sectionViews = createWorkspaceDocumentSectionViews({ sections, documentsById, filteredDocuments: documents })

    expect(filtered.map((document) => document.id)).toEqual([2])
    expect([...collectWorkspaceDocumentSectionIds(sections)]).toEqual(['1', '2', '3'])
    expect(sectionViews[0].documents.map((document) => document.id)).toEqual([1, 2])
    expect(countWorkspaceSectionedDocuments(sectionViews)).toBe(3)
    expect(filterVisibleWorkspaceDocumentSectionViews([{ documents: [] }], '')).toHaveLength(1)
    expect(filterVisibleWorkspaceDocumentSectionViews([{ documents: [] }], 'alpha')).toHaveLength(0)
  })

  it('lists favorite, recent, unsectioned, linked, and child documents', () => {
    const documents = [
      { id: 'current', title: 'Current', role: 'ADMIN', scope: 'personal' },
      { id: 'alpha', title: 'Alpha Page', role: 'READ', scope: 'shared', updatedAt: '2026-07-03T00:00:00Z' },
      { id: 'beta', title: 'Beta', role: 'WRITE', scope: 'personal' },
      { id: 'untitled', title: '제목 없음', role: 'READ', scope: 'personal' },
    ]

    expect(filterFavoriteWorkspaceDocuments(documents, ['beta', 'missing']).map((document) => document.id)).toEqual(['beta'])
    expect(listRecentWorkspaceDocuments(documents, ['beta', 'alpha']).map((document) => document.id)).toEqual(['beta', 'alpha'])
    expect(filterUnsectionedWorkspaceDocuments(documents, new Set(['current', 'untitled'])).map((document) => document.id)).toEqual(['alpha', 'beta'])

    const linked = createLinkedWorkspaceDocuments({
      documents,
      currentId: 'current',
      searchText: '문서 본문 Alpha Page 언급',
      links: [{ documentId: 'beta', anchorBlockId: 'b1', anchorText: '직접 링크' }],
      roleLabelFor: (role) => `role:${role}`,
      formatDocumentTimeFor: () => 'formatted',
    })
    expect(linked.map((document) => [document.id, document.linkSource])).toEqual([
      ['beta', 'explicit'],
      ['alpha', 'mention'],
    ])
    expect(linked[0]).toMatchObject({ linkAnchorBlockId: 'b1', roleLabel: 'role:WRITE' })
    expect(linkedWorkspaceDocumentEmptyLabel(1)).toBe('다른 페이지가 생기면 관계를 추적할 수 있습니다.')
    expect(linkedWorkspaceDocumentEmptyLabel(2)).toBe('본문에 다른 페이지 제목을 적으면 자동으로 연결됩니다.')

    expect(listCurrentWorkspaceChildPages([
      { id: 'old', parentWorkspaceId: 'current', updatedAt: '2026-07-01T00:00:00Z' },
      { id: 'new', parentWorkspaceId: 'current', updatedAt: '2026-07-02T00:00:00Z' },
      { id: 'self', parentWorkspaceId: 'self', updatedAt: '2026-07-03T00:00:00Z' },
    ], 'current').map((row) => row.id)).toEqual(['new', 'old'])
  })
})
