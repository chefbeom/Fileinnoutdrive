import { nextTick } from 'vue'

import {
  createWorkspaceSectionId,
  normalizeWorkspaceDocumentSections,
  normalizeWorkspaceSectionName,
} from '../services/workspacePreferences.js'
import {
  findWorkspaceDocumentSectionId,
  moveWorkspaceDocumentToSection as moveWorkspaceDocumentToSectionModel,
} from '../services/workspacePreferenceState.js'

const noop = () => {}

const defaultMessages = {
  renamed: 'Section renamed.',
  removed: 'Section removed.',
  removeTitle: 'Remove section',
  removeConfirmLabel: 'Remove',
  removeMessageFor: (section) => `"${section?.name || ''}" section will be removed. Documents are kept.`,
}

export const useWorkspaceDocumentSections = ({
  workspaceDocumentSections,
  workspaceSectionNameDraft,
  workspaceSectionEditingId,
  workspaceSectionEditDraft,
  workspaceSectionEditInput,
  persistWorkspaceDocumentSections = noop,
  requestWorkspaceConfirm = noop,
  showWorkspaceNotice = noop,
  nextTickFn = nextTick,
  messages = {},
} = {}) => {
  const sectionMessages = { ...defaultMessages, ...messages }

  const createWorkspaceDocumentSection = () => {
    const name = normalizeWorkspaceSectionName(workspaceSectionNameDraft?.value)
    if (!name) return
    workspaceDocumentSections.value = normalizeWorkspaceDocumentSections([
      ...(workspaceDocumentSections.value || []),
      {
        id: createWorkspaceSectionId(),
        name,
        collapsed: false,
        documentIds: [],
      },
    ])
    workspaceSectionNameDraft.value = ''
    persistWorkspaceDocumentSections()
  }

  const toggleWorkspaceDocumentSection = (sectionId) => {
    workspaceDocumentSections.value = (workspaceDocumentSections.value || []).map((section) =>
      section.id === sectionId ? { ...section, collapsed: !section.collapsed } : section,
    )
    persistWorkspaceDocumentSections()
  }

  const sectionRenameInput = () => {
    const input = workspaceSectionEditInput?.value
    return Array.isArray(input) ? input[0] : input
  }

  const startWorkspaceDocumentSectionRename = async (section) => {
    if (!section?.id) return
    workspaceSectionEditingId.value = section.id
    workspaceSectionEditDraft.value = section.name || ''
    await nextTickFn()
    const input = sectionRenameInput()
    input?.focus?.()
    input?.select?.()
  }

  const cancelWorkspaceDocumentSectionRename = () => {
    workspaceSectionEditingId.value = ''
    workspaceSectionEditDraft.value = ''
  }

  const saveWorkspaceDocumentSectionRename = () => {
    const sectionId = workspaceSectionEditingId?.value
    if (!sectionId) return
    const nextName = normalizeWorkspaceSectionName(workspaceSectionEditDraft?.value)
    if (!nextName) {
      cancelWorkspaceDocumentSectionRename()
      return
    }
    workspaceDocumentSections.value = (workspaceDocumentSections.value || []).map((item) =>
      item.id === sectionId ? { ...item, name: nextName } : item,
    )
    cancelWorkspaceDocumentSectionRename()
    persistWorkspaceDocumentSections()
    showWorkspaceNotice(sectionMessages.renamed, 'success')
  }

  const removeWorkspaceDocumentSection = (section) => {
    if (!section?.id) return
    requestWorkspaceConfirm({
      title: sectionMessages.removeTitle,
      message: sectionMessages.removeMessageFor(section),
      confirmLabel: sectionMessages.removeConfirmLabel,
      tone: 'danger',
      onConfirm: async () => {
        workspaceDocumentSections.value = (workspaceDocumentSections.value || [])
          .filter((item) => item.id !== section.id)
        persistWorkspaceDocumentSections()
        showWorkspaceNotice(sectionMessages.removed, 'success')
      },
    })
  }

  const workspaceDocumentSectionId = (document) =>
    findWorkspaceDocumentSectionId(workspaceDocumentSections?.value, document)

  const moveWorkspaceDocumentToSection = (document, sectionId) => {
    const nextSections = moveWorkspaceDocumentToSectionModel(
      workspaceDocumentSections?.value,
      document,
      sectionId,
    )
    if (nextSections === workspaceDocumentSections?.value) return
    workspaceDocumentSections.value = nextSections
    persistWorkspaceDocumentSections()
  }

  return {
    createWorkspaceDocumentSection,
    toggleWorkspaceDocumentSection,
    startWorkspaceDocumentSectionRename,
    cancelWorkspaceDocumentSectionRename,
    saveWorkspaceDocumentSectionRename,
    removeWorkspaceDocumentSection,
    workspaceDocumentSectionId,
    moveWorkspaceDocumentToSection,
  }
}
