import { ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'

import { useWorkspaceFocusNavigation } from './useWorkspaceFocusNavigation.js'

const createSubject = (overrides = {}) => {
  const state = {
    editorApi: ref({ focusBlockAnchor: vi.fn(async () => {}) }),
    currentWorkspaceKey: ref('42'),
    isWorkspacePanelCollapsed: ref(true),
    activeWorkspacePanelTab: ref('home'),
  }
  const api = {
    openWorkspaceDocument: vi.fn(async () => {}),
    focusWorkspaceMentionComments: vi.fn(async () => {}),
  }
  const subject = useWorkspaceFocusNavigation({ ...state, ...api, ...overrides })
  return { subject, state, api }
}

describe('useWorkspaceFocusNavigation', () => {
  it('focuses outline, task, and linked document block anchors', async () => {
    const { subject, state } = createSubject()

    await subject.focusWorkspaceOutlineItem({ anchorBlockId: 'outline-1' })
    await subject.focusWorkspaceTaskItem({ anchorBlockId: 'task-1' })
    await subject.focusWorkspaceLinkedDocumentSource({ linkAnchorBlockId: 'source-1' })

    expect(state.editorApi.value.focusBlockAnchor).toHaveBeenNthCalledWith(1, 'outline-1')
    expect(state.editorApi.value.focusBlockAnchor).toHaveBeenNthCalledWith(2, 'task-1')
    expect(state.editorApi.value.focusBlockAnchor).toHaveBeenNthCalledWith(3, 'source-1')
  })

  it('focuses inbox tasks in the current workspace and opens tasks from other documents', async () => {
    const { subject, state, api } = createSubject()

    await subject.focusWorkspaceInboxTask({ documentId: 42, anchorBlockId: 'task-1' })
    await subject.focusWorkspaceInboxTask({ documentId: 77, documentTitle: 'Other' })

    expect(state.editorApi.value.focusBlockAnchor).toHaveBeenCalledWith('task-1')
    expect(api.openWorkspaceDocument).toHaveBeenCalledWith({ id: 77, title: 'Other' })
  })

  it('routes calendar and home queue items to tasks or pages', async () => {
    const { subject, api } = createSubject()

    await subject.openWorkspaceCalendarItem({ type: 'page', document: { id: 11 } })
    await subject.openWorkspaceHomeQueueItem({ type: 'page', page: { id: 12 } })

    expect(api.openWorkspaceDocument).toHaveBeenNthCalledWith(1, { id: 11 })
    expect(api.openWorkspaceDocument).toHaveBeenNthCalledWith(2, { id: 12 })
  })

  it('opens home metric panels', () => {
    const { subject, state } = createSubject()

    subject.openWorkspaceHomeMetric({ panel: 'assets' })

    expect(state.isWorkspacePanelCollapsed.value).toBe(false)
    expect(state.activeWorkspacePanelTab.value).toBe('assets')
  })

  it('routes attention items by priority', async () => {
    const { subject, api } = createSubject()

    await subject.openWorkspaceHomeAttentionItem({ comment: { id: 1 } })
    await subject.openWorkspaceHomeAttentionItem({ page: { id: 2 } })

    expect(api.focusWorkspaceMentionComments).toHaveBeenCalledWith({ id: 1 })
    expect(api.openWorkspaceDocument).toHaveBeenCalledWith({ id: 2 })
  })
})
