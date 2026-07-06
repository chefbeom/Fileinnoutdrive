import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import WorkspacePageTreePanel from './WorkspacePageTreePanel.vue'

const rootNode = {
  id: 'root',
  icon: 'R',
  title: 'Root page',
  scopeLabel: 'Shared',
  statusLabel: 'Active',
  locked: true,
  childCount: 2,
  treeDepth: 0,
  isCurrentDocument: true,
  isOverdue: false,
  treeMatchesQuery: true,
  canEditProperties: true,
  parentWorkspaceId: '',
}

const childNode = {
  id: 'child',
  icon: 'C',
  title: 'Child page',
  scopeLabel: 'Private',
  statusLabel: 'Draft',
  locked: false,
  childCount: 0,
  treeDepth: 1,
  isCurrentDocument: false,
  isOverdue: true,
  treeMatchesQuery: false,
  canEditProperties: true,
  parentWorkspaceId: 'root',
}

const mountPanel = (props = {}) => mount(WorkspacePageTreePanel, {
  props: {
    loading: false,
    query: 'page',
    rows: [rootNode, childNode],
    emptyLabel: 'No pages',
    collapsedIdSet: new Set(['root']),
    subpageError: '',
    renameError: '',
    moveError: '',
    subpageCreatingId: '',
    subpageComposerParentId: 'root',
    subpageTitle: 'New child',
    renamingId: 'root',
    renameDraft: 'Renamed root',
    renameSavingId: '',
    movingId: 'root',
    moveTargetId: '',
    moveSavingId: '',
    canModifyPage: true,
    hasEditor: true,
    isDocumentLinkCopied: (node) => node.id === 'root',
    moveTargetOptions: () => [
      { id: '', title: 'Root', treeDepth: 0 },
      { id: 'child', title: 'Child page', treeDepth: 1 },
    ],
    canApplyMove: () => true,
    ...props,
  },
})

describe('WorkspacePageTreePanel', () => {
  it('renders tree rows, collapsed state, actions, and composer forms', () => {
    const wrapper = mountPanel()

    expect(wrapper.findAll('.workspace-page-tree-item')).toHaveLength(2)
    expect(wrapper.find('.workspace-page-tree-item--active').text()).toContain('Root page')
    expect(wrapper.find('.workspace-page-tree-toggle').attributes('aria-expanded')).toBe('false')
    expect(wrapper.find('.fa-check').exists()).toBe(true)
    expect(wrapper.find('.workspace-page-tree-composer--rename').exists()).toBe(true)
    expect(wrapper.find('.workspace-page-tree-composer--move').exists()).toBe(true)
    expect(wrapper.findAll('.workspace-page-tree-composer')).toHaveLength(3)
  })

  it('emits query, document, link, and tree action events', async () => {
    const wrapper = mountPanel()

    await wrapper.find('input[type="search"]').setValue('root')
    await wrapper.find('.workspace-page-tree-search button').trigger('click')
    await wrapper.find('.workspace-page-tree-toggle').trigger('click')
    await wrapper.find('.workspace-page-tree-main').trigger('click')

    const actionButtons = wrapper.findAll('.workspace-page-tree-actions button')
    await actionButtons[0].trigger('click')
    await actionButtons[1].trigger('click')
    await actionButtons[2].trigger('click')
    await actionButtons[3].trigger('click')
    await actionButtons[4].trigger('click')

    expect(wrapper.emitted('update:query')).toEqual([['root'], ['']])
    expect(wrapper.emitted('toggle-node')[0][0]).toMatchObject(rootNode)
    expect(wrapper.emitted('open-document')[0][0]).toMatchObject(rootNode)
    expect(wrapper.emitted('open-rename')[0][0]).toMatchObject(rootNode)
    expect(wrapper.emitted('open-subpage')[0][0]).toMatchObject(rootNode)
    expect(wrapper.emitted('open-move')[0][0]).toMatchObject(rootNode)
    expect(wrapper.emitted('copy-link')[0][0]).toMatchObject(rootNode)
    expect(wrapper.emitted('insert-link')[0][0]).toMatchObject(rootNode)
  })

  it('emits rename, move, and subpage form events', async () => {
    const wrapper = mountPanel()
    const forms = wrapper.findAll('form')

    await forms[0].find('input').setValue('Updated name')
    await forms[0].trigger('submit.prevent')
    await forms[0].findAll('button')[1].trigger('click')

    await forms[1].find('select').setValue('child')
    await forms[1].trigger('submit.prevent')
    await forms[1].findAll('button')[1].trigger('click')

    await forms[2].find('input').setValue('Nested page')
    await forms[2].trigger('submit.prevent')
    await forms[2].findAll('button')[1].trigger('click')

    expect(wrapper.emitted('update:renameDraft')).toEqual([['Updated name']])
    expect(wrapper.emitted('rename-page')[0][0]).toMatchObject(rootNode)
    expect(wrapper.emitted('cancel-rename')).toHaveLength(1)
    expect(wrapper.emitted('update:moveTargetId')).toEqual([['child']])
    expect(wrapper.emitted('move-page')[0][0]).toMatchObject(rootNode)
    expect(wrapper.emitted('cancel-move')).toHaveLength(1)
    expect(wrapper.emitted('update:subpageTitle')).toEqual([['Nested page']])
    expect(wrapper.emitted('create-subpage')[0][0]).toMatchObject(rootNode)
    expect(wrapper.emitted('cancel-subpage')).toHaveLength(1)
  })

  it('shows loading, empty, error, and disabled states', () => {
    const loading = mountPanel({ loading: true, rows: [] })
    const empty = mountPanel({ query: '', rows: [], emptyLabel: 'No pages yet' })
    const errors = mountPanel({
      subpageError: 'subpage failed',
      renameError: 'rename failed',
      moveError: 'move failed',
    })
    const readonly = mountPanel({ canModifyPage: false, hasEditor: false })

    expect(loading.find('.workspace-floating-panel__empty').text()).toContain('불러오는 중')
    expect(empty.find('.workspace-floating-panel__empty').text()).toContain('No pages yet')
    expect(errors.text()).toContain('subpage failed')
    expect(errors.text()).toContain('rename failed')
    expect(errors.text()).toContain('move failed')
    expect(readonly.findAll('.workspace-page-tree-actions button')[4].attributes('disabled')).toBeDefined()
  })
})
