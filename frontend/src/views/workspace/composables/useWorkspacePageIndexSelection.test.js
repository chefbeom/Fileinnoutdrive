import { describe, expect, it } from 'vitest'
import { ref } from 'vue'

import { useWorkspacePageIndexSelection } from './useWorkspacePageIndexSelection.js'

const checkedEvent = (checked) => ({ target: { checked } })

describe('useWorkspacePageIndexSelection', () => {
  it('derives editable, selected, all-selected, and bulk-apply state', () => {
    const workspacePageIndexRows = ref([
      { id: 1, canEditProperties: true },
      { id: 2, canEditProperties: false },
      { id: 3, canEditProperties: true },
    ])
    const visibleWorkspacePageIndexRows = ref([
      { id: 1, canEditProperties: true },
      { id: 2, canEditProperties: false },
      { id: 3, canEditProperties: true },
    ])
    const workspacePageIndexSelectedIds = ref(['1', '2', '3'])
    const workspacePageIndexBulkStatus = ref('')

    const subject = useWorkspacePageIndexSelection({
      workspacePageIndexRows,
      visibleWorkspacePageIndexRows,
      workspacePageIndexSelectedIds,
      workspacePageIndexBulkUpdating: ref(false),
      workspacePageIndexBulkStatus,
      workspacePageIndexBulkPriority: ref(''),
      workspacePageIndexBulkOwnerEmail: ref(''),
      workspacePageIndexBulkDueDate: ref(''),
      workspacePageIndexBulkClearDueDate: ref(false),
    })

    expect(subject.visibleEditableWorkspacePageIndexRows.value.map((row) => row.id)).toEqual([1, 3])
    expect(subject.selectedWorkspacePageIndexRows.value.map((row) => row.id)).toEqual([1, 3])
    expect(subject.areAllVisibleWorkspacePageIndexRowsSelected.value).toBe(true)
    expect(subject.canApplyWorkspacePageIndexBulkUpdate.value).toBe(false)

    workspacePageIndexBulkStatus.value = 'active'
    expect(subject.canApplyWorkspacePageIndexBulkUpdate.value).toBe(true)

    workspacePageIndexSelectedIds.value = ['1']
    expect(subject.areAllVisibleWorkspacePageIndexRowsSelected.value).toBe(false)
  })

  it('toggles row and visible selections and clears bulk form state', () => {
    const workspacePageIndexRows = ref([
      { id: 'a', canEditProperties: true },
      { id: 'b', canEditProperties: true },
      { id: 'locked', canEditProperties: false },
    ])
    const visibleWorkspacePageIndexRows = ref(workspacePageIndexRows.value)
    const workspacePageIndexSelectedIds = ref([])
    const workspacePageIndexBulkStatus = ref('active')
    const workspacePageIndexBulkPriority = ref('high')
    const workspacePageIndexBulkOwnerEmail = ref('owner@example.com')
    const workspacePageIndexBulkDueDate = ref('2026-01-01')
    const workspacePageIndexBulkClearDueDate = ref(true)

    const subject = useWorkspacePageIndexSelection({
      workspacePageIndexRows,
      visibleWorkspacePageIndexRows,
      workspacePageIndexSelectedIds,
      workspacePageIndexBulkUpdating: ref(false),
      workspacePageIndexBulkStatus,
      workspacePageIndexBulkPriority,
      workspacePageIndexBulkOwnerEmail,
      workspacePageIndexBulkDueDate,
      workspacePageIndexBulkClearDueDate,
    })

    subject.toggleWorkspacePageIndexRowSelection(workspacePageIndexRows.value[0], checkedEvent(true))
    expect(workspacePageIndexSelectedIds.value).toEqual(['a'])
    expect(subject.isWorkspacePageIndexRowSelected(workspacePageIndexRows.value[0])).toBe(true)

    subject.toggleWorkspacePageIndexRowSelection(workspacePageIndexRows.value[2], checkedEvent(true))
    expect(workspacePageIndexSelectedIds.value).toEqual(['a'])

    subject.toggleVisibleWorkspacePageIndexSelection(checkedEvent(true))
    expect(workspacePageIndexSelectedIds.value).toEqual(['a', 'b'])

    subject.toggleVisibleWorkspacePageIndexSelection(checkedEvent(false))
    expect(workspacePageIndexSelectedIds.value).toEqual([])

    subject.toggleVisibleWorkspacePageIndexSelection(checkedEvent(true))
    subject.clearWorkspacePageIndexSelection()

    expect(workspacePageIndexSelectedIds.value).toEqual([])
    expect(workspacePageIndexBulkStatus.value).toBe('')
    expect(workspacePageIndexBulkPriority.value).toBe('')
    expect(workspacePageIndexBulkOwnerEmail.value).toBe('')
    expect(workspacePageIndexBulkDueDate.value).toBe('')
    expect(workspacePageIndexBulkClearDueDate.value).toBe(false)
  })
})
