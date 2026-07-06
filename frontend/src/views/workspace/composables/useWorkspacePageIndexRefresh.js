import { createWorkspacePageIndexRow } from '../services/workspacePageIndex.js'

const resolveSource = (source) => (typeof source === 'function' ? source() : source?.value)
const setSourceValue = (source, value) => {
  if (source && typeof source === 'object' && 'value' in source) source.value = value
}
const readRows = (source) => {
  const value = resolveSource(source)
  return Array.isArray(value) ? value : []
}

const updatedTime = (row = {}) => {
  const time = new Date(row.updatedAt || 0).getTime()
  return Number.isFinite(time) ? time : 0
}

export const useWorkspacePageIndexRefresh = ({
  workspaceDocuments,
  workspacePageIndexRows,
  workspacePageIndexLoading,
  workspacePageIndexError,
  workspacePageIndexRefreshedAt,
  fetchWorkspaceDocument,
  propertyOptions,
  statusOptions,
  priorityOptions,
  now = () => new Date().toISOString(),
} = {}) => {
  let currentScanId = 0

  const buildWorkspacePageIndexRow = (document, data) => createWorkspacePageIndexRow(document, data, {
    propertyOptions: resolveSource(propertyOptions) || {},
    statusOptions: readRows(statusOptions),
    priorityOptions: readRows(priorityOptions),
  })

  const refreshWorkspacePageIndex = async () => {
    const candidates = readRows(workspaceDocuments)
    if (candidates.length === 0) {
      setSourceValue(workspacePageIndexRows, [])
      setSourceValue(workspacePageIndexError, '')
      setSourceValue(workspacePageIndexLoading, false)
      return []
    }

    const scanId = ++currentScanId
    setSourceValue(workspacePageIndexLoading, true)
    setSourceValue(workspacePageIndexError, '')

    try {
      const results = await Promise.allSettled(
        candidates.map(async (document) => {
          const data = await fetchWorkspaceDocument?.(document.id)
          return buildWorkspacePageIndexRow(document, data)
        }),
      )

      if (scanId !== currentScanId) return readRows(workspacePageIndexRows)

      const rows = results
        .filter((result) => result.status === 'fulfilled' && result.value)
        .map((result) => result.value)
        .sort((left, right) => updatedTime(right) - updatedTime(left))

      setSourceValue(workspacePageIndexRows, rows)
      setSourceValue(workspacePageIndexRefreshedAt, now())

      const failedCount = results.filter((result) => result.status === 'rejected').length
      setSourceValue(
        workspacePageIndexError,
        failedCount ? `${failedCount}개 페이지 속성을 불러오지 못했습니다.` : '',
      )
      return rows
    } catch (error) {
      if (scanId !== currentScanId) return readRows(workspacePageIndexRows)
      setSourceValue(workspacePageIndexError, error?.message || '페이지 데이터베이스를 불러오지 못했습니다.')
      return readRows(workspacePageIndexRows)
    } finally {
      if (scanId === currentScanId) {
        setSourceValue(workspacePageIndexLoading, false)
      }
    }
  }

  return {
    buildWorkspacePageIndexRow,
    refreshWorkspacePageIndex,
  }
}
