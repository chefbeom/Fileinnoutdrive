import { describe, expect, it } from 'vitest'
import { ref } from 'vue'

import { useWorkspaceStatusIndicators } from './useWorkspaceStatusIndicators.js'

const createSubject = () => {
  const saveState = ref('idle')
  const saveError = ref('')
  const hasUnsavedChanges = ref(false)
  const lastSavedAt = ref(null)
  const workspaceId = ref(null)
  const connectionStatus = ref('private')

  const subject = useWorkspaceStatusIndicators({
    saveState,
    saveError,
    hasUnsavedChanges,
    lastSavedAt,
    workspaceId,
    connectionStatus,
    formatDateTimeFor: (value) => `formatted:${value}`,
  })

  return {
    subject,
    saveState,
    saveError,
    hasUnsavedChanges,
    lastSavedAt,
    workspaceId,
    connectionStatus,
  }
}

describe('useWorkspaceStatusIndicators', () => {
  it('creates save labels and classes from save state', () => {
    const { subject, saveState, saveError, hasUnsavedChanges, lastSavedAt, workspaceId } = createSubject()

    expect(subject.saveStatusLabel.value).toBe('새 페이지')
    expect(subject.saveStatusClass.value['status-pill--saved']).toBe(true)

    workspaceId.value = 10
    expect(subject.saveStatusLabel.value).toBe('저장됨')

    hasUnsavedChanges.value = true
    expect(subject.saveStatusLabel.value).toBe('변경사항 있음')
    expect(subject.saveStatusClass.value['status-pill--dirty']).toBe(true)

    saveState.value = 'saving'
    expect(subject.saveStatusLabel.value).toBe('저장 중')
    expect(subject.saveStatusClass.value['status-pill--saving']).toBe(true)

    saveState.value = 'error'
    saveError.value = '권한이 없습니다'
    expect(subject.saveStatusLabel.value).toBe('권한이 없습니다')
    expect(subject.saveStatusClass.value['status-pill--error']).toBe(true)

    saveState.value = 'idle'
    hasUnsavedChanges.value = false
    lastSavedAt.value = '2026-07-03T12:00:00Z'
    expect(subject.saveStatusLabel.value).toBe('formatted:2026-07-03T12:00:00Z 저장됨')
  })

  it('creates realtime labels and classes from connection status', () => {
    const { subject, connectionStatus } = createSubject()

    expect(subject.realtimeStatusLabel.value).toBe('개인 페이지')
    expect(subject.realtimeStatusClass.value['status-pill--muted']).toBe(true)

    connectionStatus.value = 'connecting'
    expect(subject.realtimeStatusLabel.value).toBe('실시간 연결 중')
    expect(subject.realtimeStatusClass.value['status-pill--saving']).toBe(true)

    connectionStatus.value = 'connected'
    expect(subject.realtimeStatusLabel.value).toBe('실시간 연결됨')
    expect(subject.realtimeStatusClass.value['status-pill--live']).toBe(true)

    connectionStatus.value = 'offline'
    expect(subject.realtimeStatusLabel.value).toBe('오프라인 편집')
    expect(subject.realtimeStatusClass.value['status-pill--live']).toBe(false)
  })
})
