import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'

import WorkspaceOverlays from './WorkspaceOverlays.vue'

vi.mock('@/views/workspace/ShareModal.vue', () => ({
  name: 'ShareModal',
  __isTeleport: false,
  __isKeepAlive: false,
  __isSuspense: false,
  default: {
    name: 'ShareModal',
    props: ['isOpen', 'postIdx', 'uuid', 'initialStatus'],
    emits: ['close', 'refresh'],
    template: `<button class="share-modal-stub" @click="$emit('close')" @dblclick="$emit('refresh')"></button>`,
  },
}))
const commandItems = [
  {
    id: 'new',
    icon: 'fa-regular fa-file',
    title: 'New page',
    detail: 'Create a page',
    kindLabel: 'Action',
  },
]

const mountOverlays = (props = {}) => mount(WorkspaceOverlays, {
  props: {
    workspaceNotice: null,
    workspaceConfirm: null,
    isCommandPaletteOpen: false,
    commandQuery: '',
    commandActiveIndex: 0,
    commandItems,
    commandEmptyLabel: 'No results',
    showShareModal: false,
    workspaceId: 10,
    workspaceUuid: 'uuid-1',
    workspaceShareStatus: 'Private',
    ...props,
  },
})

describe('WorkspaceOverlays', () => {
  it('forwards notice and confirm events', async () => {
    const wrapper = mountOverlays({
      workspaceNotice: {
        type: 'success',
        message: 'Saved',
        actionLabel: 'Open',
      },
      workspaceConfirm: {
        title: 'Delete',
        message: 'Delete page?',
        tone: 'danger',
        loading: false,
        cancelLabel: 'Cancel',
        confirmLabel: 'Delete',
      },
    })

    await wrapper.find('.workspace-notice__action').trigger('click')
    await wrapper.find('.workspace-notice__close').trigger('click')
    await wrapper.find('.workspace-confirm-card__cancel').trigger('click')
    await wrapper.find('.workspace-confirm-card__confirm').trigger('click')

    expect(wrapper.emitted('run-notice-action')).toHaveLength(1)
    expect(wrapper.emitted('close-notice')).toHaveLength(1)
    expect(wrapper.emitted('close-confirm')).toHaveLength(1)
    expect(wrapper.emitted('confirm-action')).toHaveLength(1)
  })

  it('forwards command palette model and action events', async () => {
    const wrapper = mountOverlays({ isCommandPaletteOpen: true })
    const input = wrapper.find('.workspace-command-search input')

    await input.setValue('new')
    await input.trigger('keydown.down')
    await wrapper.find('.workspace-command-item').trigger('mouseenter')
    await wrapper.find('.workspace-command-item').trigger('click')
    await input.trigger('keydown.esc')

    expect(wrapper.emitted('update:commandQuery')?.at(-1)).toEqual(['new'])
    expect(wrapper.emitted('move-command-selection')).toEqual([[1]])
    expect(wrapper.emitted('update:commandActiveIndex')).toEqual([[0]])
    expect(wrapper.emitted('execute-command')?.[0]).toEqual([commandItems[0]])
    expect(wrapper.emitted('close-command-palette')).toHaveLength(1)
    expect(wrapper.emitted('register-command-input')?.[0]?.[0]).toBeInstanceOf(HTMLInputElement)
  })

  it('forwards share modal close and refresh events', async () => {
    const wrapper = mountOverlays({ showShareModal: true })
    await flushPromises()
    const shareModal = wrapper.findComponent({ name: 'ShareModal' })

    expect(shareModal.props()).toMatchObject({
      isOpen: true,
      postIdx: 10,
      uuid: 'uuid-1',
      initialStatus: 'Private',
    })

    await wrapper.find('.share-modal-stub').trigger('click')
    await wrapper.find('.share-modal-stub').trigger('dblclick')

    expect(wrapper.emitted('close-share')).toHaveLength(1)
    expect(wrapper.emitted('refresh-share')).toHaveLength(1)
  })
})
