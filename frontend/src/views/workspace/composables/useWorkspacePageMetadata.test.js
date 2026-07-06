import { computed, nextTick, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'

import { useWorkspacePageMetadata } from './useWorkspacePageMetadata.js'

describe('useWorkspacePageMetadata', () => {
  it('applies normalized page properties while suppressing property watchers', async () => {
    const refs = {
      workspacePropertyIcon: ref(''),
      workspacePropertyCoverColor: ref(''),
      workspacePropertyStatus: ref(''),
      workspacePropertyPriority: ref(''),
      workspacePropertyOwnerEmail: ref(''),
      workspacePropertyOwnerName: ref(''),
      workspacePropertyDueDate: ref(''),
      workspacePropertyTagsInput: ref(''),
      workspacePageLocked: ref(false),
    }
    const metadata = useWorkspacePageMetadata({
      ...refs,
      normalizeWorkspaceProperties: () => ({
        icon: 'DOC',
        coverColor: 'blue',
        status: 'active',
        priority: 'high',
        ownerEmail: 'admin@fileinnout.local',
        ownerName: 'Admin',
        dueDate: '2026-07-04',
        tags: ['ops', 'release'],
        locked: true,
      }),
    })

    const normalized = metadata.applyWorkspaceProperties({ status: 'raw' })

    expect(normalized.status).toBe('active')
    expect(metadata.suppressWorkspacePropertyWatch.value).toBe(true)
    expect(refs.workspacePropertyIcon.value).toBe('DOC')
    expect(refs.workspacePropertyCoverColor.value).toBe('blue')
    expect(refs.workspacePropertyStatus.value).toBe('active')
    expect(refs.workspacePropertyPriority.value).toBe('high')
    expect(refs.workspacePropertyOwnerEmail.value).toBe('admin@fileinnout.local')
    expect(refs.workspacePropertyOwnerName.value).toBe('Admin')
    expect(refs.workspacePropertyDueDate.value).toBe('2026-07-04')
    expect(refs.workspacePropertyTagsInput.value).toBe('ops, release')
    expect(refs.workspacePageLocked.value).toBe(true)

    await nextTick()

    expect(metadata.suppressWorkspacePropertyWatch.value).toBe(false)
  })

  it('applies and clears parent page metadata', () => {
    const workspaceParentPageId = ref('')
    const workspaceParentPageTitle = ref('')
    const metadata = useWorkspacePageMetadata({
      workspaceParentPageId,
      workspaceParentPageTitle,
    })

    expect(metadata.applyWorkspaceParentPage({ id: ' 42 ', title: ' Parent ' })).toEqual({
      id: '42',
      title: 'Parent',
    })
    expect(workspaceParentPageId.value).toBe('42')
    expect(workspaceParentPageTitle.value).toBe('Parent')

    expect(metadata.applyWorkspaceParentPage({ id: '', title: 'Ignored' })).toEqual({
      id: '',
      title: '',
    })
    expect(workspaceParentPageId.value).toBe('')
    expect(workspaceParentPageTitle.value).toBe('')
  })

  it('opens the current parent page only when one exists', async () => {
    const workspaceParentPageId = ref('')
    const workspaceParentPageTitle = ref('')
    const currentWorkspaceParentPage = computed(() => ({
      id: workspaceParentPageId.value,
      title: workspaceParentPageTitle.value,
    }))
    const openWorkspaceDocument = vi.fn()
    const metadata = useWorkspacePageMetadata({
      workspaceParentPageId,
      workspaceParentPageTitle,
      currentWorkspaceParentPage,
      openWorkspaceDocument,
    })

    expect(await metadata.openWorkspaceParentPage()).toBe(false)
    expect(openWorkspaceDocument).not.toHaveBeenCalled()

    metadata.applyWorkspaceParentPage({ id: '7', title: 'Parent' })

    expect(await metadata.openWorkspaceParentPage()).toBe(true)
    expect(openWorkspaceDocument).toHaveBeenCalledWith({ id: '7', title: 'Parent' })
  })
})
