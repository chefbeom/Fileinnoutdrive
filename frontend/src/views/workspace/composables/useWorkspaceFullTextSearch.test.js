import { describe, expect, it } from 'vitest'
import { ref } from 'vue'

import { useWorkspaceFullTextSearch } from './useWorkspaceFullTextSearch.js'

const snapshot = (blocks) => JSON.stringify({ blocks })

describe('useWorkspaceFullTextSearch', () => {
  it('blocks searches until the query and document list are usable', async () => {
    const subject = useWorkspaceFullTextSearch({
      workspaceDocuments: ref([]),
      fetchWorkspaceDocument: async () => ({}),
    })

    expect(subject.canSearchWorkspaceFullText.value).toBe(false)
    expect(await subject.searchWorkspaceContents()).toEqual([])
    expect(subject.workspaceFullTextError.value).toBe('검색어를 2글자 이상 입력하세요.')

    subject.workspaceFullTextQuery.value = '검색'
    expect(await subject.searchWorkspaceContents()).toEqual([])
    expect(subject.workspaceFullTextError.value).toBe('검색할 문서가 없습니다.')
  })

  it('finds title and body matches and reports partial failures', async () => {
    const workspaceDocuments = ref([
      { id: 'body', title: 'Body source', role: 'READ' },
      { id: 'title', title: 'Old title', role: 'EDIT' },
      { id: 'nomatch', title: 'No match', role: 'READ' },
      { id: 'failed', title: 'Failed source', role: 'READ' },
    ])
    const fetchWorkspaceDocument = async (id) => {
      if (id === 'failed') throw new Error('network')
      if (id === 'title') {
        return {
          title: '검색 제목',
          contents: snapshot([{ type: 'paragraph', data: { text: '본문은 다른 내용' } }]),
        }
      }
      if (id === 'body') {
        return {
          title: '본문 페이지',
          contents: snapshot([{ type: 'paragraph', data: { text: '본문에 검색 단어가 있습니다.' } }]),
        }
      }
      return {
        title: 'No match',
        contents: snapshot([{ type: 'paragraph', data: { text: 'nothing useful' } }]),
      }
    }
    const subject = useWorkspaceFullTextSearch({
      workspaceDocuments,
      fetchWorkspaceDocument,
      now: () => '2026-07-04T02:00:00.000Z',
    })
    subject.workspaceFullTextQuery.value = '검색'

    expect(subject.canSearchWorkspaceFullText.value).toBe(true)
    const result = await subject.searchWorkspaceContents()

    expect(result.map((document) => [document.id, document.matchType])).toEqual([
      ['title', 'title'],
      ['body', 'body'],
    ])
    expect(subject.workspaceFullTextResults.value).toHaveLength(2)
    expect(subject.workspaceFullTextError.value).toBe('1개 문서를 검색하지 못했습니다.')
    expect(subject.workspaceFullTextRefreshedAt.value).toBe('2026-07-04T02:00:00.000Z')
    expect(subject.workspaceFullTextLoading.value).toBe(false)
  })
})
