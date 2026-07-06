import { computed, ref } from 'vue'

import { createWorkspaceBacklinkResult } from '../services/workspaceDocuments.js'
import { normalizeWorkspaceLinkText } from '../services/workspacePageTree.js'

const resolveSource = (source) => (typeof source === 'function' ? source() : source?.value)
const readRows = (source) => {
  const value = resolveSource(source)
  return Array.isArray(value) ? value : []
}
const readString = (source) => String(resolveSource(source) || '')

export const createWorkspaceBacklinkEmptyLabel = ({ workspaceId = '', documentCount = 0 } = {}) => {
  if (!workspaceId) return '문서를 저장하면 백링크를 찾을 수 있습니다.'
  if (Number(documentCount) <= 1) return '다른 페이지가 생기면 백링크를 추적할 수 있습니다.'
  return '아직 이 페이지를 참조하는 다른 페이지가 없습니다.'
}

export const useWorkspaceBacklinks = ({
  workspaceId,
  workspaceDocuments,
  title,
  fetchWorkspaceDocument,
  now = () => new Date().toISOString(),
  limit = 12,
} = {}) => {
  const workspaceBacklinks = ref([])
  const workspaceBacklinkLoading = ref(false)
  const workspaceBacklinkError = ref('')
  const workspaceBacklinkRefreshedAt = ref(null)
  let currentScanId = 0

  const workspaceBacklinkEmptyLabel = computed(() =>
    createWorkspaceBacklinkEmptyLabel({
      workspaceId: readString(workspaceId),
      documentCount: readRows(workspaceDocuments).length,
    }),
  )

  const refreshWorkspaceBacklinks = async () => {
    const targetId = readString(workspaceId)
    if (!targetId) {
      workspaceBacklinks.value = []
      workspaceBacklinkError.value = ''
      workspaceBacklinkLoading.value = false
      return []
    }

    const candidates = readRows(workspaceDocuments).filter((document) => String(document.id) !== targetId)
    if (candidates.length === 0) {
      workspaceBacklinks.value = []
      workspaceBacklinkError.value = ''
      workspaceBacklinkRefreshedAt.value = now()
      return []
    }

    const scanId = ++currentScanId
    workspaceBacklinkLoading.value = true
    workspaceBacklinkError.value = ''

    try {
      const targetTitle = normalizeWorkspaceLinkText(readString(title))
      const results = await Promise.allSettled(
        candidates.map(async (document) => {
          const data = await fetchWorkspaceDocument(document.id)
          return createWorkspaceBacklinkResult(document, data, targetId, targetTitle)
        }),
      )

      if (scanId !== currentScanId) return workspaceBacklinks.value

      workspaceBacklinks.value = results
        .filter((result) => result.status === 'fulfilled' && result.value)
        .map((result) => result.value)
        .sort((left, right) =>
          Number(right.backlinkSource === 'explicit') - Number(left.backlinkSource === 'explicit'),
        )
        .slice(0, limit)
      workspaceBacklinkRefreshedAt.value = now()

      const failedCount = results.filter((result) => result.status === 'rejected').length
      workspaceBacklinkError.value = failedCount
        ? `${failedCount}개 문서의 백링크를 확인하지 못했습니다.`
        : ''
      return workspaceBacklinks.value
    } catch (error) {
      if (scanId !== currentScanId) return workspaceBacklinks.value
      workspaceBacklinkError.value = error?.message || '백링크를 불러오지 못했습니다.'
      return workspaceBacklinks.value
    } finally {
      if (scanId === currentScanId) {
        workspaceBacklinkLoading.value = false
      }
    }
  }

  return {
    workspaceBacklinks,
    workspaceBacklinkLoading,
    workspaceBacklinkError,
    workspaceBacklinkRefreshedAt,
    workspaceBacklinkEmptyLabel,
    refreshWorkspaceBacklinks,
  }
}
