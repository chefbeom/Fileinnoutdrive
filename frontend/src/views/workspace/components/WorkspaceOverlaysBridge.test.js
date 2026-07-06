import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'

import WorkspaceOverlaysBridge from './WorkspaceOverlaysBridge.vue'

const createModel = () => ({
  workspaceNotice: { message: 'Saved' },
  workspaceConfirm: { title: 'Confirm' },
  isCommandPaletteOpen: true,
  commandQuery: 'roadmap',
  commandActiveIndex: 1,
  commandItems: [{ id: 'open' }],
  commandEmptyLabel: 'No commands',
  showShareModal: true,
  workspaceId: 7,
  workspaceUuid: 'uuid-7',
  workspaceShareStatus: 'Private',
})

const createActions = () => ({
  setValue: vi.fn(),
  runWorkspaceNoticeAction: vi.fn(),
  closeWorkspaceNotice: vi.fn(),
  closeWorkspaceConfirm: vi.fn(),
  confirmWorkspaceAction: vi.fn(),
  moveWorkspaceCommandSelection: vi.fn(),
  executeWorkspaceCommand: vi.fn(),
  closeWorkspaceCommandPalette: vi.fn(),
  registerCommandInput: vi.fn(),
  closeWorkspaceShare: vi.fn(),
  refreshWorkspaceShare: vi.fn(),
})

const WorkspaceOverlaysStub = {
  props: [
    'workspaceNotice',
    'workspaceConfirm',
    'isCommandPaletteOpen',
    'commandQuery',
    'commandActiveIndex',
    'commandItems',
    'commandEmptyLabel',
    'showShareModal',
    'workspaceId',
    'workspaceUuid',
    'workspaceShareStatus',
  ],
  emits: [
    'run-notice-action',
    'close-notice',
    'close-confirm',
    'confirm-action',
    'update:command-query',
    'update:command-active-index',
    'move-command-selection',
    'execute-command',
    'close-command-palette',
    'register-command-input',
    'close-share',
    'refresh-share',
  ],
  template: `
    <div class="workspace-overlays-stub">
      <button class="notice-action" @click="$emit('run-notice-action')"></button>
      <button class="notice-close" @click="$emit('close-notice')"></button>
      <button class="confirm-close" @click="$emit('close-confirm')"></button>
      <button class="confirm-action" @click="$emit('confirm-action')"></button>
      <button class="query-update" @click="$emit('update:command-query', 'next')"></button>
      <button class="index-update" @click="$emit('update:command-active-index', 4)"></button>
      <button class="move-selection" @click="$emit('move-command-selection', 1)"></button>
      <button class="execute-command" @click="$emit('execute-command', { id: 'open' })"></button>
      <button class="close-command" @click="$emit('close-command-palette')"></button>
      <button class="register-input" @click="$emit('register-command-input', 'input-ref')"></button>
      <button class="close-share" @click="$emit('close-share')"></button>
      <button class="refresh-share" @click="$emit('refresh-share')"></button>
    </div>
  `,
}

describe('WorkspaceOverlaysBridge', () => {
  it('maps model props and forwards actions', async () => {
    const actions = createActions()
    const wrapper = mount(WorkspaceOverlaysBridge, {
      props: {
        model: createModel(),
        actions,
      },
      global: {
        stubs: {
          WorkspaceOverlays: WorkspaceOverlaysStub,
        },
      },
    })

    const overlays = wrapper.findComponent(WorkspaceOverlaysStub)
    expect(overlays.props()).toMatchObject({
      commandQuery: 'roadmap',
      commandActiveIndex: 1,
      workspaceId: 7,
      workspaceUuid: 'uuid-7',
      workspaceShareStatus: 'Private',
    })

    await wrapper.find('.notice-action').trigger('click')
    await wrapper.find('.notice-close').trigger('click')
    await wrapper.find('.confirm-close').trigger('click')
    await wrapper.find('.confirm-action').trigger('click')
    await wrapper.find('.query-update').trigger('click')
    await wrapper.find('.index-update').trigger('click')
    await wrapper.find('.move-selection').trigger('click')
    await wrapper.find('.execute-command').trigger('click')
    await wrapper.find('.close-command').trigger('click')
    await wrapper.find('.register-input').trigger('click')
    await wrapper.find('.close-share').trigger('click')
    await wrapper.find('.refresh-share').trigger('click')

    expect(actions.runWorkspaceNoticeAction).toHaveBeenCalledTimes(1)
    expect(actions.closeWorkspaceNotice).toHaveBeenCalledTimes(1)
    expect(actions.closeWorkspaceConfirm).toHaveBeenCalledTimes(1)
    expect(actions.confirmWorkspaceAction).toHaveBeenCalledTimes(1)
    expect(actions.setValue).toHaveBeenCalledWith('workspaceCommandQuery', 'next')
    expect(actions.setValue).toHaveBeenCalledWith('workspaceCommandActiveIndex', 4)
    expect(actions.moveWorkspaceCommandSelection).toHaveBeenCalledWith(1)
    expect(actions.executeWorkspaceCommand).toHaveBeenCalledWith({ id: 'open' })
    expect(actions.closeWorkspaceCommandPalette).toHaveBeenCalledTimes(1)
    expect(actions.registerCommandInput).toHaveBeenCalledWith('input-ref')
    expect(actions.closeWorkspaceShare).toHaveBeenCalledTimes(1)
    expect(actions.refreshWorkspaceShare).toHaveBeenCalledTimes(1)
  })
})