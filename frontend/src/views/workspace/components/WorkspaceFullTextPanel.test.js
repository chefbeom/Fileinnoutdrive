import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import WorkspaceFullTextPanel from './WorkspaceFullTextPanel.vue'

const result = {
  id: 42,
  title: 'Project note',
  scope: 'shared',
  matchTypeLabel: 'Body',
  scopeLabel: 'Shared',
  roleLabel: 'Editor',
  updatedLabel: 'today',
  snippet: 'A matching snippet',
}

const mountPanel = (props = {}) => mount(WorkspaceFullTextPanel, {
  props: {
    query: 'project',
    results: [result],
    loading: false,
    error: '',
    canSearch: true,
    canModifyPage: true,
    hasEditor: true,
    ...props,
  },
})

describe('WorkspaceFullTextPanel', () => {
  it('renders search results and count', () => {
    const wrapper = mountPanel()

    expect(wrapper.find('.workspace-floating-panel__count').text()).toBe('1')
    expect(wrapper.find('.workspace-fulltext-result').exists()).toBe(true)
    expect(wrapper.find('.workspace-fulltext-result__icon--shared').exists()).toBe(true)
    expect(wrapper.text()).toContain('Project note')
    expect(wrapper.text()).toContain('A matching snippet')
  })

  it('emits query, search, and result actions', async () => {
    const wrapper = mountPanel()

    await wrapper.find('input[type="search"]').setValue('updated')
    await wrapper.find('form').trigger('submit.prevent')
    await wrapper.find('.workspace-fulltext-result__main').trigger('click')

    const actionButtons = wrapper.findAll('.workspace-fulltext-result__actions button')
    await actionButtons[0].trigger('click')
    await actionButtons[1].trigger('click')

    expect(wrapper.emitted('update:query')).toEqual([['updated']])
    expect(wrapper.emitted('search')).toHaveLength(1)
    expect(wrapper.emitted('open-document')).toEqual([[result]])
    expect(wrapper.emitted('copy-link')).toEqual([[result]])
    expect(wrapper.emitted('insert-link')).toEqual([[result]])
  })

  it('shows loading, error, empty state, and disabled controls', () => {
    const loading = mountPanel({ loading: true, results: [] })
    const empty = mountPanel({ results: [] })
    const disabled = mountPanel({ canSearch: false, canModifyPage: false })

    expect(loading.find('.workspace-floating-panel__empty').exists()).toBe(true)
    expect(empty.find('.workspace-floating-panel__empty').exists()).toBe(true)
    expect(mountPanel({ error: 'failed' }).text()).toContain('failed')
    expect(disabled.find('button[type="submit"]').attributes('disabled')).toBeDefined()
    expect(disabled.findAll('.workspace-fulltext-result__actions button')[1].attributes('disabled')).toBeDefined()
  })
})
