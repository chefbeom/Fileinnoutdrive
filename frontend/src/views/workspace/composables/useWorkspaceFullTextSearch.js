import { computed, ref } from 'vue'

import { createWorkspaceFullTextSearchResult } from '../services/workspaceDocuments.js'

const resolveSource = (source) => (typeof source === 'function' ? source() : source?.value)
const readRows = (source) => {
  const value = resolveSource(source)
  return Array.isArray(value) ? value : []
}

export const useWorkspaceFullTextSearch = ({
  workspaceDocuments,
  fetchWorkspaceDocument,
  now = () => new Date().toISOString(),
  limit = 20,
} = {}) => {
  const workspaceFullTextQuery = ref('')
  const workspaceFullTextResults = ref([])
  const workspaceFullTextLoading = ref(false)
  const workspaceFullTextError = ref('')
  const workspaceFullTextRefreshedAt = ref(null)
  let currentSearchId = 0

  const canSearchWorkspaceFullText = computed(() =>
    workspaceFullTextQuery.value.trim().length >= 2 &&
    readRows(workspaceDocuments).length > 0 &&
    !workspaceFullTextLoading.value,
  )

  const searchWorkspaceContents = async () => {
    const query = workspaceFullTextQuery.value.trim()
    if (query.length < 2) {
      currentSearchId += 1
      workspaceFullTextResults.value = []
      workspaceFullTextLoading.value = false
      workspaceFullTextError.value = '검색어를 2글자 이상 입력하세요.'
      return []
    }

    const candidates = readRows(workspaceDocuments)
    if (candidates.length === 0) {
      currentSearchId += 1
      workspaceFullTextResults.value = []
      workspaceFullTextLoading.value = false
      workspaceFullTextError.value = '검색할 문서가 없습니다.'
      return []
    }

    const searchId = ++currentSearchId
    workspaceFullTextLoading.value = true
    workspaceFullTextError.value = ''

    try {
      const results = await Promise.allSettled(
        candidates.map(async (document) => {
          const data = await fetchWorkspaceDocument(document.id)
          return createWorkspaceFullTextSearchResult(document, data, query)
        }),
      )

      if (searchId !== currentSearchId) return workspaceFullTextResults.value

      workspaceFullTextResults.value = results
        .filter((result) => result.status === 'fulfilled' && result.value)
        .map((result) => result.value)
        .sort((left, right) => Number(right.matchType === 'title') - Number(left.matchType === 'title'))
        .slice(0, limit)
      workspaceFullTextRefreshedAt.value = now()

      const failedCount = results.filter((result) => result.status === 'rejected').length
      workspaceFullTextError.value = failedCount
        ? `${failedCount}개 문서를 검색하지 못했습니다.`
        : ''
      return workspaceFullTextResults.value
    } catch (error) {
      if (searchId !== currentSearchId) return workspaceFullTextResults.value
      workspaceFullTextError.value = error?.message || '워크스페이스 검색에 실패했습니다.'
      return workspaceFullTextResults.value
    } finally {
      if (searchId === currentSearchId) {
        workspaceFullTextLoading.value = false
      }
    }
  }

  return {
    workspaceFullTextQuery,
    workspaceFullTextResults,
    workspaceFullTextLoading,
    workspaceFullTextError,
    workspaceFullTextRefreshedAt,
    canSearchWorkspaceFullText,
    searchWorkspaceContents,
  }
}
