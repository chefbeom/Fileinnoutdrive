import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

import { useWorkspaceDocumentSections } from './useWorkspaceDocumentSections.js'

const createSubject = () => {
  const workspaceDocumentSections = ref([
    { id: 'alpha', name: 'Alpha', collapsed: false, documentIds: ['10'] },
    { id: 'beta', name: 'Beta', collapsed: true, documentIds: [] },
  ])
  const workspaceSectionNameDraft = ref('')
  const workspaceSectionEditingId = ref('')
  const workspaceSectionEditDraft = ref('')
  const workspaceSectionEditInput = ref({
    focus: vi.fn(),
    select: vi.fn(),
  })
  const persistWorkspaceDocumentSections = vi.fn()
  const requestWorkspaceConfirm = vi.fn()
  const showWorkspaceNotice = vi.fn()

  const subject = useWorkspaceDocumentSections({
    workspaceDocumentSections,
    workspaceSectionNameDraft,
    workspaceSectionEditingId,
    workspaceSectionEditDraft,
    workspaceSectionEditInput,
    persistWorkspaceDocumentSections,
    requestWorkspaceConfirm,
    showWorkspaceNotice,
    nextTickFn: vi.fn(async () => {}),
    messages: {
      renamed: 'renamed',
      removed: 'removed',
      removeTitle: 'remove title',
      removeConfirmLabel: 'remove',
      removeMessageFor: (section) => `remove ${section.name}`,
    },
  })

  return {
    subject,
    workspaceDocumentSections,
    workspaceSectionNameDraft,
    workspaceSectionEditingId,
    workspaceSectionEditDraft,
    workspaceSectionEditInput,
    persistWorkspaceDocumentSections,
    requestWorkspaceConfirm,
    showWorkspaceNotice,
  }
}

describe('useWorkspaceDocumentSections', () => {
  it('creates normalized document sections', () => {
    const { subject, workspaceDocumentSections, workspaceSectionNameDraft, persistWorkspaceDocumentSections } =
      createSubject()
    workspaceSectionNameDraft.value = ' New section '

    subject.createWorkspaceDocumentSection()

    expect(workspaceSectionNameDraft.value).toBe('')
    expect(workspaceDocumentSections.value).toHaveLength(3)
    expect(workspaceDocumentSections.value[2]).toMatchObject({
      name: 'New section',
      collapsed: false,
      documentIds: [],
    })
    expect(persistWorkspaceDocumentSections).toHaveBeenCalledTimes(1)
  })

  it('toggles collapsed state and persists', () => {
    const { subject, workspaceDocumentSections, persistWorkspaceDocumentSections } = createSubject()

    subject.toggleWorkspaceDocumentSection('alpha')

    expect(workspaceDocumentSections.value[0].collapsed).toBe(true)
    expect(persistWorkspaceDocumentSections).toHaveBeenCalledTimes(1)
  })

  it('starts and cancels rename state', async () => {
    const {
      subject,
      workspaceSectionEditingId,
      workspaceSectionEditDraft,
      workspaceSectionEditInput,
    } = createSubject()

    await subject.startWorkspaceDocumentSectionRename({ id: 'alpha', name: 'Alpha' })

    expect(workspaceSectionEditingId.value).toBe('alpha')
    expect(workspaceSectionEditDraft.value).toBe('Alpha')
    expect(workspaceSectionEditInput.value.focus).toHaveBeenCalledTimes(1)
    expect(workspaceSectionEditInput.value.select).toHaveBeenCalledTimes(1)

    subject.cancelWorkspaceDocumentSectionRename()

    expect(workspaceSectionEditingId.value).toBe('')
    expect(workspaceSectionEditDraft.value).toBe('')
  })

  it('renames sections and notifies', () => {
    const {
      subject,
      workspaceDocumentSections,
      workspaceSectionEditingId,
      workspaceSectionEditDraft,
      persistWorkspaceDocumentSections,
      showWorkspaceNotice,
    } = createSubject()
    workspaceSectionEditingId.value = 'alpha'
    workspaceSectionEditDraft.value = ' Renamed '

    subject.saveWorkspaceDocumentSectionRename()

    expect(workspaceDocumentSections.value[0].name).toBe('Renamed')
    expect(workspaceSectionEditingId.value).toBe('')
    expect(workspaceSectionEditDraft.value).toBe('')
    expect(persistWorkspaceDocumentSections).toHaveBeenCalledTimes(1)
    expect(showWorkspaceNotice).toHaveBeenCalledWith('renamed', 'success')
  })

  it('requests confirmation before removing sections', async () => {
    const {
      subject,
      workspaceDocumentSections,
      requestWorkspaceConfirm,
      persistWorkspaceDocumentSections,
      showWorkspaceNotice,
    } = createSubject()

    subject.removeWorkspaceDocumentSection({ id: 'alpha', name: 'Alpha' })

    expect(requestWorkspaceConfirm).toHaveBeenCalledWith(expect.objectContaining({
      title: 'remove title',
      message: 'remove Alpha',
      confirmLabel: 'remove',
      tone: 'danger',
    }))

    await requestWorkspaceConfirm.mock.calls[0][0].onConfirm()

    expect(workspaceDocumentSections.value.map((section) => section.id)).toEqual(['beta'])
    expect(persistWorkspaceDocumentSections).toHaveBeenCalledTimes(1)
    expect(showWorkspaceNotice).toHaveBeenCalledWith('removed', 'success')
  })

  it('finds and moves documents between sections', () => {
    const { subject, workspaceDocumentSections, persistWorkspaceDocumentSections } = createSubject()

    expect(subject.workspaceDocumentSectionId({ id: 10 })).toBe('alpha')

    subject.moveWorkspaceDocumentToSection({ id: 10 }, 'beta')

    expect(workspaceDocumentSections.value).toEqual([
      { id: 'alpha', name: 'Alpha', collapsed: false, documentIds: [] },
      { id: 'beta', name: 'Beta', collapsed: true, documentIds: ['10'] },
    ])
    expect(persistWorkspaceDocumentSections).toHaveBeenCalledTimes(1)
  })
})
