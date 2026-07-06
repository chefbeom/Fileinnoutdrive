import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

import {
  createWorkspaceCommandActionHandlers,
  openWorkspaceCommandPanel,
  useWorkspaceCommandCenter,
} from './useWorkspaceCommandCenter.js'

describe('useWorkspaceCommandCenter', () => {
  it('opens workspace panels from command palette items', () => {
    const isWorkspacePanelCollapsed = ref(true)
    const activeWorkspacePanelTab = ref('overview')

    openWorkspaceCommandPanel({
      isWorkspacePanelCollapsed,
      activeWorkspacePanelTab,
    }, 'tasks')

    expect(isWorkspacePanelCollapsed.value).toBe(false)
    expect(activeWorkspacePanelTab.value).toBe('tasks')
  })

  it('builds action handlers for page-level commands', () => {
    const handlers = {
      createWorkspaceDocument: vi.fn(),
      handleSave: vi.fn(),
      toggleWorkspacePageLock: vi.fn(),
      toggleCurrentWorkspaceDocumentFavorite: vi.fn(),
      openWorkspaceShare: vi.fn(),
      exportWorkspaceMarkdown: vi.fn(),
      focusWorkspaceSubpageComposer: vi.fn(),
      openWorkspaceParentPage: vi.fn(),
      focusWorkspaceMentionComments: vi.fn(),
    }

    const actionHandlers = createWorkspaceCommandActionHandlers(handlers)
    actionHandlers.new()
    actionHandlers.save()
    actionHandlers.lock()
    actionHandlers['favorite-current']()
    actionHandlers.share()
    actionHandlers['export-markdown']()
    actionHandlers.subpage()
    actionHandlers.parent()
    actionHandlers.mentions()

    Object.values(handlers).forEach((handler) => {
      expect(handler).toHaveBeenCalledTimes(1)
    })
  })

  it('passes page command wiring to the command palette factory', () => {
    const commandPaletteFactory = vi.fn((options) => ({ options }))
    const isWorkspacePanelCollapsed = ref(true)
    const activeWorkspacePanelTab = ref('overview')
    const createWorkspaceDocument = vi.fn()

    const subject = useWorkspaceCommandCenter({
      workspaceCommandBaseItems: ref([]),
      openWorkspaceDocument: vi.fn(),
      applyWorkspaceTemplate: vi.fn(),
      insertWorkspaceQuickBlock: vi.fn(),
      isWorkspacePanelCollapsed,
      activeWorkspacePanelTab,
      createWorkspaceDocument,
      commandPaletteFactory,
    })

    expect(commandPaletteFactory).toHaveBeenCalledTimes(1)
    subject.options.onPanel('assets')
    subject.options.actionHandlers.new()

    expect(isWorkspacePanelCollapsed.value).toBe(false)
    expect(activeWorkspacePanelTab.value).toBe('assets')
    expect(createWorkspaceDocument).toHaveBeenCalledTimes(1)
  })
})
