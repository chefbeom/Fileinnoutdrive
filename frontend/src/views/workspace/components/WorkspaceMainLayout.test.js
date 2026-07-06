import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import WorkspaceMainLayout from './WorkspaceMainLayout.vue'

const pageDocument = { id: 7, title: 'Page' }
const member = { email: 'member@example.com' }

const stubs = {
  WorkspaceDocumentSidebar: {
    name: 'WorkspaceDocumentSidebar',
    props: ['documentQuery', 'currentWorkspaceKey', 'hasEditor'],
    emits: [
      'update:documentQuery',
      'open-command-palette',
      'open-document',
      'toggle-favorite',
      'move-section',
      'copy-link',
    ],
    template: `
      <section class="sidebar-stub">
        <button class="sidebar-query" @click="$emit('update:documentQuery', 'draft')"></button>
        <button class="sidebar-command" @click="$emit('open-command-palette')"></button>
        <button class="sidebar-open" @click="$emit('open-document', document)"></button>
        <button class="sidebar-favorite" @click="$emit('toggle-favorite', document)"></button>
        <button class="sidebar-move" @click="$emit('move-section', document, 'section-1')"></button>
        <button class="sidebar-copy" @click="$emit('copy-link', document)"></button>
      </section>
    `,
    data: () => ({ document: pageDocument }),
  },
  WorkspaceEditorShell: {
    name: 'WorkspaceEditorShell',
    props: ['icon', 'title', 'accessRoleLabel', 'hasEditor'],
    emits: [
      'update:icon',
      'change-role',
      'toggle-favorite',
      'copy-link',
      'register-editor-holder',
    ],
    template: `
      <section class="editor-stub">
        <button class="editor-icon" @click="$emit('update:icon', 'doc')"></button>
        <button class="editor-role" @click="$emit('change-role', member, 'ADMIN')"></button>
        <button class="editor-favorite" @click="$emit('toggle-favorite')"></button>
        <button class="editor-copy" @click="$emit('copy-link')"></button>
        <button class="editor-register" @click="$emit('register-editor-holder', holder)"></button>
      </section>
    `,
    data: () => ({ member, holder: globalThis.document.createElement('div') }),
  },
}

const mountLayout = (props = {}) => mount(WorkspaceMainLayout, {
  props: {
    documentQuery: '',
    currentWorkspaceKey: '7',
    hasEditor: true,
    icon: 'page',
    title: 'Workspace',
    accessRoleLabel: 'Owner',
    ...props,
  },
  global: { stubs },
})

describe('WorkspaceMainLayout', () => {
  it('passes core sidebar and editor props', () => {
    const wrapper = mountLayout()

    expect(wrapper.findComponent({ name: 'WorkspaceDocumentSidebar' }).props()).toMatchObject({
      documentQuery: '',
      currentWorkspaceKey: '7',
      hasEditor: true,
    })
    expect(wrapper.findComponent({ name: 'WorkspaceEditorShell' }).props()).toMatchObject({
      icon: 'page',
      title: 'Workspace',
      accessRoleLabel: 'Owner',
    })
  })

  it('forwards sidebar and editor model/action events without collisions', async () => {
    const wrapper = mountLayout()

    await wrapper.find('.sidebar-query').trigger('click')
    await wrapper.find('.sidebar-command').trigger('click')
    await wrapper.find('.sidebar-open').trigger('click')
    await wrapper.find('.sidebar-favorite').trigger('click')
    await wrapper.find('.sidebar-move').trigger('click')
    await wrapper.find('.sidebar-copy').trigger('click')
    await wrapper.find('.editor-icon').trigger('click')
    await wrapper.find('.editor-role').trigger('click')
    await wrapper.find('.editor-favorite').trigger('click')
    await wrapper.find('.editor-copy').trigger('click')
    await wrapper.find('.editor-register').trigger('click')

    expect(wrapper.emitted('update:documentQuery')).toEqual([['draft']])
    expect(wrapper.emitted('open-command-palette')).toHaveLength(1)
    expect(wrapper.emitted('open-document')).toEqual([[pageDocument]])
    expect(wrapper.emitted('toggle-document-favorite')).toEqual([[pageDocument]])
    expect(wrapper.emitted('move-section')).toEqual([[pageDocument, 'section-1']])
    expect(wrapper.emitted('copy-link')).toEqual([[pageDocument]])
    expect(wrapper.emitted('update:icon')).toEqual([['doc']])
    expect(wrapper.emitted('change-role')).toEqual([[member, 'ADMIN']])
    expect(wrapper.emitted('toggle-current-favorite')).toHaveLength(1)
    expect(wrapper.emitted('copy-current-link')).toHaveLength(1)
    expect(wrapper.emitted('register-editor-holder')?.[0]?.[0]).toBeInstanceOf(HTMLDivElement)
  })
})
