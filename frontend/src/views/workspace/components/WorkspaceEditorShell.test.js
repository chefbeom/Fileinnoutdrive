import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'

import WorkspaceEditorShell from './WorkspaceEditorShell.vue'

const baseProps = {
  icon: '📄',
  coverColor: 'blue',
  status: 'TODO',
  priority: 'HIGH',
  ownerEmail: 'owner@example.com',
  dueDate: '2026-07-05',
  tagsInput: 'tag',
  title: '문서',
  breadcrumbs: [],
  coverColorOption: { id: 'blue' },
  statusOption: { value: 'TODO', label: '할 일', tone: 'warn' },
  priorityOption: { value: 'HIGH', label: '높음', tone: 'danger' },
  ownerCandidates: [],
  tags: ['tag'],
  canModifyPage: true,
  canManageShare: true,
  canEditWorkspace: true,
  isValid: true,
  canFavoriteDocument: true,
  canCopyLink: true,
  canExportMarkdown: true,
  canManageAssets: true,
  isDeletingAsset: vi.fn(() => false),
  canShowTemplates: true,
  templates: [{ id: 'template-1', title: '템플릿' }],
  inlineQuickBlockOptions: [{ id: 'text', label: '텍스트' }],
  canInsertQuickBlock: true,
  remoteCursors: [],
}

const shellStubs = {
  WorkspacePageHeader: {
    template: `
      <section class="page-header-stub">
        <button class="normalize" @click="$emit('normalize-icon')">normalize</button>
        <button class="title" @click="$emit('title-input', '새 제목')">title</button>
        <button class="breadcrumb" @click="$emit('open-breadcrumb', { id: 7 })">breadcrumb</button>
        <slot />
      </section>
    `,
  },
  WorkspaceEditorToolbar: {
    template: `
      <section class="toolbar-stub">
        <button class="save" @click="$emit('save')">save</button>
        <button class="role" @click="$emit('change-role', { id: 'member' }, 'ADMIN')">role</button>
        <button class="copy" @click="$emit('copy-link')">copy</button>
        <button class="share" @click="$emit('open-share')">share</button>
      </section>
    `,
  },
  WorkspacePropertyPanel: true,
  WorkspaceInlineAssetsSection: {
    template: `
      <section class="assets-stub">
        <button class="image" @click="$emit('trigger-image-select')">image</button>
        <button class="delete" @click="$emit('delete-asset', { id: 'asset-1' })">delete</button>
      </section>
    `,
  },
  WorkspaceTemplatePanel: {
    template: '<button class="template" @click="$emit(\'apply\', { id: \'template-1\' })">template</button>',
  },
  WorkspaceEditorLockOverlay: true,
  WorkspaceInlineBlockBar: {
    template: '<button class="insert" @click="$emit(\'insert-block\', { id: \'text\' })">insert</button>',
  },
  WorkspaceRemoteCursorsOverlay: true,
}

const mountShell = (props = {}) => mount(WorkspaceEditorShell, {
  props: {
    ...baseProps,
    ...props,
  },
  global: {
    stubs: shellStubs,
  },
})

describe('WorkspaceEditorShell', () => {
  it('registers DOM refs required by workspace editor setup and asset actions', () => {
    const wrapper = mountShell()

    expect(wrapper.emitted('register-image-input')?.[0]?.[0]).toBeInstanceOf(HTMLInputElement)
    expect(wrapper.emitted('register-file-input')?.[0]?.[0]).toBeInstanceOf(HTMLInputElement)
    expect(wrapper.emitted('register-editor-holder')?.[0]?.[0]).toBeInstanceOf(HTMLDivElement)
  })

  it('forwards header, toolbar, asset, template, and inline block actions', async () => {
    const wrapper = mountShell()

    await wrapper.find('.normalize').trigger('click')
    await wrapper.find('.title').trigger('click')
    await wrapper.find('.breadcrumb').trigger('click')
    await wrapper.find('.save').trigger('click')
    await wrapper.find('.role').trigger('click')
    await wrapper.find('.copy').trigger('click')
    await wrapper.find('.share').trigger('click')
    await wrapper.find('.image').trigger('click')
    await wrapper.find('.delete').trigger('click')
    await wrapper.find('.template').trigger('click')
    await wrapper.find('.insert').trigger('click')

    expect(wrapper.emitted('normalize-icon')).toHaveLength(1)
    expect(wrapper.emitted('title-input')).toEqual([['새 제목']])
    expect(wrapper.emitted('open-breadcrumb')).toEqual([[{ id: 7 }]])
    expect(wrapper.emitted('save')).toHaveLength(1)
    expect(wrapper.emitted('change-role')).toEqual([[{ id: 'member' }, 'ADMIN']])
    expect(wrapper.emitted('copy-link')).toHaveLength(1)
    expect(wrapper.emitted('open-share')).toHaveLength(1)
    expect(wrapper.emitted('trigger-image-select')).toHaveLength(1)
    expect(wrapper.emitted('delete-asset')).toEqual([[{ id: 'asset-1' }]])
    expect(wrapper.emitted('apply-template')).toEqual([[{ id: 'template-1' }]])
    expect(wrapper.emitted('insert-inline-block')).toEqual([[{ id: 'text' }]])
  })
})