import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import WorkspaceHistoryPanel from './WorkspaceHistoryPanel.vue'

const revisions = [
  {
    id: 1,
    reason: 'manual',
    title: 'Draft',
    actorName: 'Owner',
    createdAtLabel: 'today',
  },
  {
    id: 2,
    reason: 'autosave',
    title: 'Autosave',
    actorName: 'Editor',
    createdAtLabel: 'yesterday',
  },
]

const diffSummary = [
  { id: 'added', label: 'Added', count: 1 },
  { id: 'changed', label: 'Changed', count: 2 },
]

const diffItems = [
  {
    kind: 'changed',
    key: 'block-1',
    label: 'Changed',
    typeLabel: 'Paragraph',
    preview: 'new text',
    previousPreview: 'old text',
  },
]

const mountPanel = (props = {}) => mount(WorkspaceHistoryPanel, {
  props: {
    workspaceId: 42,
    revisions,
    loading: false,
    error: '',
    activeRevision: revisions[0],
    revisionDiff: {
      titleChanged: true,
      currentTitle: 'Current title',
      targetTitle: 'Draft',
    },
    diffSummary,
    diffItems,
    previewLoading: '',
    restoring: '',
    canRestore: true,
    revisionReasonLabel: (reason) => reason === 'manual' ? 'Manual' : 'Autosave',
    ...props,
  },
})

describe('WorkspaceHistoryPanel', () => {
  it('renders revisions, active preview, and diff details', () => {
    const wrapper = mountPanel()

    expect(wrapper.findAll('.workspace-history-item')).toHaveLength(2)
    expect(wrapper.find('.workspace-history-item--active').exists()).toBe(true)
    expect(wrapper.text()).toContain('Draft')
    expect(wrapper.text()).toContain('Manual')
    expect(wrapper.text()).toContain('Current title')
    expect(wrapper.findAll('.workspace-history-diff-summary__item')).toHaveLength(2)
    expect(wrapper.findAll('.workspace-history-diff-item')).toHaveLength(1)
  })

  it('emits refresh, preview, and restore actions', async () => {
    const wrapper = mountPanel()

    await wrapper.find('.workspace-history-refresh-btn').trigger('click')
    await wrapper.find('.workspace-history-item__main').trigger('click')
    await wrapper.find('.workspace-history-preview > button').trigger('click')

    expect(wrapper.emitted('refresh')).toEqual([[]])
    expect(wrapper.emitted('preview')).toEqual([[revisions[0]]])
    expect(wrapper.emitted('restore')).toEqual([[revisions[0]]])
  })

  it('disables row preview and restore actions while busy', () => {
    const wrapper = mountPanel({
      previewLoading: '1',
      restoring: '1',
    })

    expect(wrapper.find('.workspace-history-item__main').attributes('disabled')).toBeDefined()
    expect(wrapper.find('.workspace-history-preview > button').attributes('disabled')).toBeDefined()
  })

  it('shows saved-state prompts for unsaved, loading, empty, and error states', () => {
    const unsaved = mountPanel({ workspaceId: null, revisions: [], activeRevision: null, revisionDiff: null })
    const loading = mountPanel({ loading: true, revisions: [], activeRevision: null, revisionDiff: null })
    const empty = mountPanel({ revisions: [], activeRevision: null, revisionDiff: null })
    const error = mountPanel({ error: 'Failed to load' })

    expect(unsaved.find('.workspace-history-refresh-btn').exists()).toBe(false)
    expect(unsaved.find('.workspace-floating-panel__empty').exists()).toBe(true)
    expect(loading.find('.workspace-floating-panel__empty').exists()).toBe(true)
    expect(empty.find('.workspace-floating-panel__empty').exists()).toBe(true)
    expect(error.find('.workspace-assets__error').text()).toBe('Failed to load')
  })
})