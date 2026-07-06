import { describe, expect, it } from 'vitest'
import { ref } from 'vue'

import { useWorkspaceDocumentCollections } from './useWorkspaceDocumentCollections.js'

describe('useWorkspaceDocumentCollections', () => {
  it('derives document lists, sections, favorites, recents, links, and hierarchy', () => {
    const personalItems = ref([
      { idx: 1, title: 'Project Plan', updatedAt: '2026-01-03T00:00:00Z', level: 'ADMIN' },
      { idx: null, title: 'Draft without id' },
      { idx: 2, title: 'Roadmap', updatedAt: '2026-01-02T00:00:00Z', level: 'READ' },
    ])
    const sharedItems = ref([
      { idx: 3, title: 'Team Notes', updatedAt: '2026-01-01T00:00:00Z', level: 'WRITE' },
    ])
    const workspacePageIndexRows = ref([
      { id: 1, title: 'Project Plan', parentWorkspaceId: '', updatedAt: '2026-01-03T00:00:00Z' },
      { id: 2, title: 'Roadmap', parentWorkspaceId: '1', parentWorkspaceTitle: 'Project Plan', updatedAt: '2026-01-02T00:00:00Z' },
      { id: 4, title: 'Child Page', parentWorkspaceId: '1', parentWorkspaceTitle: 'Project Plan', updatedAt: '2026-01-04T00:00:00Z' },
    ])

    const subject = useWorkspaceDocumentCollections({
      personalItems,
      sharedItems,
      workspaceDocumentQuery: ref(''),
      workspaceDocumentSections: ref([
        { id: 'planning', name: 'Planning', documentIds: ['2'], collapsed: false },
      ]),
      workspacePageIndexRows,
      currentWorkspaceKey: ref('1'),
      workspaceParentPageId: ref(''),
      workspaceParentPageTitle: ref(''),
      favoriteWorkspaceDocumentIds: ref(['3']),
      recentWorkspaceDocumentIds: ref(['2', '3']),
      documentSearchText: ref('This page mentions Team Notes'),
      documentWorkspaceLinks: ref([{ documentId: '2', anchorText: 'Roadmap' }]),
    })

    expect(subject.workspaceDocuments.value.map((document) => document.id)).toEqual([1, 2, 3])
    expect(subject.workspaceDocumentById.value.get('3').scope).toBe('shared')
    expect(subject.workspaceDocumentSectionViews.value[0].documents.map((document) => document.id)).toEqual([2])
    expect(subject.workspaceSectionedDocumentCount.value).toBe(1)
    expect(subject.favoriteWorkspaceDocuments.value.map((document) => document.id)).toEqual([3])
    expect(subject.recentWorkspaceDocuments.value.map((document) => document.id)).toEqual([2, 3])
    expect(subject.unsectionedPersonalWorkspaceDocuments.value.map((document) => document.id)).toEqual([1])
    expect(subject.unsectionedSharedWorkspaceDocuments.value.map((document) => document.id)).toEqual([3])
    expect(subject.linkedWorkspaceDocuments.value.map((document) => document.id)).toEqual([2, 3])
    expect(subject.currentWorkspaceChildPages.value.map((document) => document.id)).toEqual([4, 2])
  })

  it('filters documents and keeps empty sections visible only without a query', () => {
    const workspaceDocumentQuery = ref('team')
    const subject = useWorkspaceDocumentCollections({
      personalItems: ref([{ idx: 1, title: 'Project Plan', level: 'ADMIN' }]),
      sharedItems: ref([{ idx: 2, title: 'Team Notes', level: 'READ' }]),
      workspaceDocumentQuery,
      workspaceDocumentSections: ref([
        { id: 'empty', name: 'Empty', documentIds: ['1'], collapsed: false },
      ]),
      workspacePageIndexRows: ref([]),
      currentWorkspaceKey: ref('2'),
      workspaceParentPageId: ref('1'),
      workspaceParentPageTitle: ref('Project Plan'),
      favoriteWorkspaceDocumentIds: ref([]),
      recentWorkspaceDocumentIds: ref([]),
      documentSearchText: ref(''),
      documentWorkspaceLinks: ref([]),
    })

    expect(subject.filteredWorkspaceDocuments.value.map((document) => document.id)).toEqual([2])
    expect(subject.visibleWorkspaceDocumentSectionViews.value).toEqual([])
    expect(subject.currentWorkspaceParentPage.value.title).toBe('Project Plan')

    workspaceDocumentQuery.value = ''
    expect(subject.visibleWorkspaceDocumentSectionViews.value.map((section) => section.id)).toEqual(['empty'])
    expect(subject.linkedWorkspaceDocumentEmptyLabel.value).toContain('다른 페이지')
  })
})