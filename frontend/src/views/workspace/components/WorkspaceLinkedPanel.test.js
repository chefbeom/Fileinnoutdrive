import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'

import WorkspaceLinkedPanel from './WorkspaceLinkedPanel.vue'

const parentPage = {
  id: 'parent-1',
  title: 'Parent',
  scopeLabel: 'personal',
  roleLabel: 'owner',
  updatedLabel: 'today',
}

const childPages = [
  {
    id: 'child-1',
    title: 'Child',
    icon: 'C',
    scope: 'personal',
    scopeLabel: 'personal',
    roleLabel: 'editor',
    updatedLabel: 'today',
  },
]

const linkedDocuments = [
  {
    id: 'linked-1',
    title: 'Linked',
    scope: 'shared',
    linkSourceLabel: 'body',
    scopeLabel: 'shared',
    roleLabel: 'viewer',
    updatedLabel: 'yesterday',
    linkAnchorBlockId: 'block-1',
  },
]

const backlinks = [
  {
    id: 'backlink-1',
    title: 'Backlink',
    scope: 'personal',
    backlinkSourceLabel: 'mention',
    scopeLabel: 'personal',
    roleLabel: 'owner',
    updatedLabel: 'now',
    backlinkPreview: 'Preview text',
  },
]

const mountPanel = (props = {}) => mount(WorkspaceLinkedPanel, {
  props: {
    workspaceId: 42,
    relationCount: 4,
    parentPage,
    childPages,
    linkedDocuments,
    linkedEmptyLabel: 'No outgoing links',
    backlinks,
    backlinkLoading: false,
    backlinkError: '',
    backlinkEmptyLabel: 'No backlinks',
    canModifyPage: true,
    hasEditor: true,
    subpageTitle: 'Next child',
    subpageCreating: false,
    subpageError: '',
    canStartSubpage: true,
    canCreateSubpage: true,
    ...props,
  },
})

describe('WorkspaceLinkedPanel', () => {
  it('renders parent, child, outgoing, and backlink sections', () => {
    const wrapper = mountPanel()

    expect(wrapper.find('.workspace-floating-panel__count').text()).toBe('4')
    expect(wrapper.find('.workspace-linked-item--parent').exists()).toBe(true)
    expect(wrapper.find('.workspace-linked-item--child').exists()).toBe(true)
    expect(wrapper.findAll('.workspace-linked-item')).toHaveLength(4)
    expect(wrapper.text()).toContain('Parent')
    expect(wrapper.text()).toContain('Linked')
    expect(wrapper.text()).toContain('Backlink')
    expect(wrapper.text()).toContain('Preview text')
  })

  it('emits refresh, navigation, link, copy, focus, and composer events', async () => {
    const wrapper = mountPanel()

    await wrapper.find('.workspace-history-refresh-btn').trigger('click')
    await wrapper.find('.workspace-linked-item--parent .workspace-linked-item__main').trigger('click')
    await wrapper.find('.workspace-linked-item--child .workspace-linked-item__main').trigger('click')
    await wrapper.find('.workspace-linked-item--parent .workspace-linked-item__actions button').trigger('click')
    await wrapper.findAll('.workspace-linked-item--parent .workspace-linked-item__actions button')[1].trigger('click')
    await wrapper.findAll('.workspace-linked-list:not(.workspace-linked-list--children):not(.workspace-linked-list--backlinks) .workspace-linked-item__actions button')[1].trigger('click')
    await wrapper.find('input').setValue('Updated child')
    await wrapper.find('form').trigger('submit')

    expect(wrapper.emitted('refresh-backlinks')).toEqual([[]])
    expect(wrapper.emitted('open-parent')).toEqual([[]])
    expect(wrapper.emitted('open-document')).toEqual([[childPages[0]]])
    expect(wrapper.emitted('insert-link')).toEqual([[parentPage]])
    expect(wrapper.emitted('copy-link')).toEqual([[parentPage]])
    expect(wrapper.emitted('focus-linked-source')).toEqual([[linkedDocuments[0]]])
    expect(wrapper.emitted('update:subpage-title')).toEqual([['Updated child']])
    expect(wrapper.emitted('create-subpage')).toEqual([[]])
  })

  it('disables actions when the page cannot be modified or backlinks are loading', () => {
    const wrapper = mountPanel({
      backlinkLoading: true,
      canModifyPage: false,
      hasEditor: false,
      canStartSubpage: false,
      canCreateSubpage: false,
    })

    expect(wrapper.find('.workspace-history-refresh-btn').attributes('disabled')).toBeDefined()
    expect(wrapper.find('.workspace-linked-item--parent .workspace-linked-item__actions button').attributes('disabled')).toBeDefined()
    expect(wrapper.find('input').attributes('disabled')).toBeDefined()
    expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeDefined()
  })

  it('shows empty, loading, and error states', () => {
    const empty = mountPanel({ linkedDocuments: [], backlinks: [], parentPage: null, childPages: [] })
    const loading = mountPanel({ backlinkLoading: true, backlinks: [] })
    const error = mountPanel({ backlinkError: 'Failed backlinks', backlinks: [] })

    expect(empty.text()).toContain('No outgoing links')
    expect(empty.text()).toContain('No backlinks')
    expect(loading.find('.workspace-floating-panel__empty').exists()).toBe(true)
    expect(error.find('.workspace-assets__error').text()).toBe('Failed backlinks')
  })

  it('exposes focus for the subpage input ref contract', () => {
    const wrapper = mountPanel()
    const input = wrapper.find('input').element
    input.focus = vi.fn()

    wrapper.vm.focus()

    expect(input.focus).toHaveBeenCalled()
  })
})