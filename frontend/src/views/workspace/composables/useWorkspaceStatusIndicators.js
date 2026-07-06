import { computed } from 'vue'

const resolveSource = (source) => (typeof source === 'function' ? source() : source?.value)
const readString = (source) => String(resolveSource(source) || '')
const readBoolean = (source) => Boolean(resolveSource(source))
const readValue = (source, fallback = null) => resolveSource(source) ?? fallback

export const useWorkspaceStatusIndicators = ({
  saveState,
  saveError,
  hasUnsavedChanges,
  lastSavedAt,
  workspaceId,
  connectionStatus,
  formatDateTimeFor,
} = {}) => {
  const saveStatusLabel = computed(() => {
    const state = readString(saveState)
    if (state === 'saving') return '저장 중'
    if (state === 'error') return readString(saveError) || '저장 실패'
    if (readBoolean(hasUnsavedChanges)) return '변경사항 있음'

    const savedAt = readValue(lastSavedAt)
    if (savedAt) {
      const formatted = typeof formatDateTimeFor === 'function'
        ? formatDateTimeFor(savedAt)
        : savedAt
      return `${formatted} 저장됨`
    }

    return readValue(workspaceId) ? '저장됨' : '새 페이지'
  })

  const saveStatusClass = computed(() => {
    const state = readString(saveState)
    const dirty = readBoolean(hasUnsavedChanges)
    return {
      'status-pill--saving': state === 'saving',
      'status-pill--error': state === 'error',
      'status-pill--dirty': dirty && state !== 'saving',
      'status-pill--saved': !dirty && state !== 'error',
    }
  })

  const realtimeStatusLabel = computed(() => {
    const status = readString(connectionStatus).toLowerCase()
    if (status === 'synced' || status === 'connected') return '실시간 연결됨'
    if (status === 'connecting') return '실시간 연결 중'
    if (status === 'private') return '개인 페이지'
    return '오프라인 편집'
  })

  const realtimeStatusClass = computed(() => {
    const status = readString(connectionStatus).toLowerCase()
    return {
      'status-pill--live': ['synced', 'connected'].includes(status),
      'status-pill--saving': status === 'connecting',
      'status-pill--muted': status === 'private',
    }
  })

  return {
    saveStatusLabel,
    saveStatusClass,
    realtimeStatusLabel,
    realtimeStatusClass,
  }
}
