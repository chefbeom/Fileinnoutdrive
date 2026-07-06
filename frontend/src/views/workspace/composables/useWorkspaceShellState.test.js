import { describe, expect, it } from 'vitest'
import { ref } from 'vue'

import { useWorkspaceShellState } from './useWorkspaceShellState.js'

const createSubject = (overrides = {}) => useWorkspaceShellState({
  workspacePropertyIcon: ref('ABCD'),
  workspacePropertyCoverColor: ref('blue'),
  workspacePropertyStatus: ref('active'),
  workspacePropertyPriority: ref('urgent'),
  workspacePropertyOwnerEmail: ref('owner@example.com'),
  selectedWorkspacePropertyOwner: ref({ name: 'Owner' }),
  workspacePropertyOwnerName: ref('Fallback Owner'),
  workspacePropertyDueDate: ref('2026-07-01'),
  workspacePropertyTags: ref(['alpha', 'beta', 'alpha']),
  workspacePageLocked: ref(true),
  workspaceTaskTodayKeyFor: () => '2026-07-05',
  canEditWorkspace: ref(true),
  hasUnsavedChanges: ref(true),
  isWorkspacePageLocked: ref(false),
  canFavoriteCurrentWorkspaceDocument: ref(true),
  isCurrentWorkspaceDocumentFavorite: ref(false),
  canManageWorkspaceShare: ref(true),
  isValid: ref(true),
  canExportWorkspaceMarkdown: ref(true),
  canStartWorkspaceSubpage: ref(true),
  currentWorkspaceParentPage: ref({ id: 1, title: 'Parent' }),
  currentUserEmail: ref('user@example.com'),
  mentionedWorkspaceComments: ref([{ id: 1 }]),
  workspaceDocuments: ref([{ id: 10, title: 'Plan', role: 'WRITE', status: 'Private', scope: 'personal' }]),
  favoriteWorkspaceDocumentIds: ref([10]),
  canShowWorkspaceTemplates: ref(true),
  workspaceTemplates: [{ id: 'retro', icon: 'R', title: 'Retro', description: 'Review' }],
  canInsertWorkspaceQuickBlock: ref(true),
  quickBlocks: [{ id: 'todo', label: 'Todo', icon: 'T', description: 'Task' }],
  workspacePanelTabs: ref([{ id: 'all' }, { id: 'home', label: 'Home' }, { id: 'tasks', label: 'Tasks' }]),
  activeWorkspacePanelTab: ref('all'),
  pageFocusedPanelIds: ['home', 'tasks'],
  ...overrides,
})

describe('useWorkspaceShellState', () => {
  it('normalizes current workspace properties and due-date state', () => {
    const subject = createSubject()

    expect(subject.currentWorkspaceProperties.value).toMatchObject({
      icon: 'AB',
      coverColor: '',
      status: 'planning',
      priority: 'normal',
      ownerEmail: 'owner@example.com',
      ownerName: 'Owner',
      dueDate: '2026-07-01',
      tags: ['alpha', 'beta'],
      locked: true,
    })
    expect(subject.isWorkspacePropertyDueOverdue.value).toBe(true)
  })

  it('builds command items from current shell state', () => {
    const subject = createSubject()

    expect(subject.workspaceCommandBaseItems.value.map((item) => item.id)).toEqual(expect.arrayContaining([
      'action:save',
      'action:lock',
      'action:favorite-current',
      'action:share',
      'action:export-markdown',
      'action:subpage',
      'action:parent',
      'action:mentions',
      'document:10',
      'template:retro',
      'block:todo',
      'panel:home',
      'panel:tasks',
    ]))
  })

  it('tracks visible workspace panel by active tab', () => {
    const activeWorkspacePanelTab = ref('all')
    const subject = createSubject({ activeWorkspacePanelTab })

    expect(subject.isWorkspacePanelVisible('home')).toBe(true)
    expect(subject.isWorkspacePanelVisible('assets')).toBe(false)

    activeWorkspacePanelTab.value = 'assets'
    expect(subject.isWorkspacePanelVisible('home')).toBe(false)
    expect(subject.isWorkspacePanelVisible('assets')).toBe(true)
  })
})