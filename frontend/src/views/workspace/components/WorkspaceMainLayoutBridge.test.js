import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'

import WorkspaceMainLayoutBridge from './WorkspaceMainLayoutBridge.vue'

const pageDocument = { id: 8, title: 'Page' }
const holder = globalThis.document.createElement('div')

const createModel = () => ({
  documentQuery: '',
  currentWorkspaceKey: '8',
  hasEditor: true,
  icon: 'page',
  title: 'Workspace',
  accessRoleLabel: 'Owner',
  linkCopied: false,
  isLinkCopied: false,
  favoriteDocuments: [pageDocument],
  remoteCursors: [],
})

const createActions = () => ({
  setValue: vi.fn(),
  registerSectionEditInput: vi.fn(),
  openWorkspaceCommandPalette: vi.fn(),
  createWorkspaceDocument: vi.fn(),
  createWorkspaceDocumentSection: vi.fn(),
  saveWorkspaceDocumentSectionRename: vi.fn(),
  cancelWorkspaceDocumentSectionRename: vi.fn(),
  toggleWorkspaceDocumentSection: vi.fn(),
  startWorkspaceDocumentSectionRename: vi.fn(),
  removeWorkspaceDocumentSection: vi.fn(),
  openWorkspaceDocument: vi.fn(),
  toggleFavoriteWorkspaceDocument: vi.fn(),
  moveWorkspaceDocumentToSection: vi.fn(),
  insertWorkspacePageLink: vi.fn(),
  copyWorkspaceDocumentLink: vi.fn(),
  duplicateWorkspaceDocument: vi.fn(),
  removeWorkspaceDocument: vi.fn(),
  normalizeWorkspacePageIcon: vi.fn(),
  handleTitleInput: vi.fn(),
  handleRoleAction: vi.fn(),
  handleSave: vi.fn(),
  toggleCurrentWorkspaceDocumentFavorite: vi.fn(),
  toggleWorkspacePageLock: vi.fn(),
  copyCurrentWorkspaceDocumentLink: vi.fn(),
  exportWorkspaceMarkdown: vi.fn(),
  openWorkspaceShare: vi.fn(),
  handleAssetSelection: vi.fn(),
  triggerImageSelect: vi.fn(),
  triggerFileSelect: vi.fn(),
  handleAssetDelete: vi.fn(),
  downloadWorkspaceAsset: vi.fn(),
  applyWorkspaceTemplate: vi.fn(),
  insertWorkspaceInlineQuickBlock: vi.fn(),
  registerImageInput: vi.fn(),
  registerFileInput: vi.fn(),
  registerEditorHolder: vi.fn(),
})

const stubs = {
  WorkspaceMainLayout: {
    name: 'WorkspaceMainLayout',
    props: ['documentQuery', 'currentWorkspaceKey', 'hasEditor', 'icon', 'title', 'accessRoleLabel'],
    emits: [
      'update:documentQuery',
      'update:icon',
      'open-document',
      'toggle-document-favorite',
      'move-section',
      'copy-link',
      'normalize-icon',
      'title-input',
      'change-role',
      'copy-current-link',
      'register-editor-holder',
    ],
    template: `
      <section class="main-layout-stub">
        <button class="query" @click="$emit('update:documentQuery', 'draft')"></button>
        <button class="icon" @click="$emit('update:icon', 'doc')"></button>
        <button class="open" @click="$emit('open-document', document)"></button>
        <button class="favorite" @click="$emit('toggle-document-favorite', document)"></button>
        <button class="move" @click="$emit('move-section', document, 'section-1')"></button>
        <button class="copy" @click="$emit('copy-link', document)"></button>
        <button class="normalize" @click="$emit('normalize-icon')"></button>
        <button class="title" @click="$emit('title-input', 'New title')"></button>
        <button class="role" @click="$emit('change-role', member, 'EDITOR')"></button>
        <button class="copy-current" @click="$emit('copy-current-link')"></button>
        <button class="register-holder" @click="$emit('register-editor-holder', holder)"></button>
      </section>
    `,
    data: () => ({
      document: pageDocument,
      member: { email: 'member@example.com' },
      holder,
    }),
  },
}

describe('WorkspaceMainLayoutBridge', () => {
  it('passes model fields to WorkspaceMainLayout', () => {
    const wrapper = mount(WorkspaceMainLayoutBridge, {
      props: { model: createModel(), actions: createActions() },
      global: { stubs },
    })

    expect(wrapper.findComponent({ name: 'WorkspaceMainLayout' }).props()).toMatchObject({
      documentQuery: '',
      currentWorkspaceKey: '8',
      hasEditor: true,
      icon: 'page',
      title: 'Workspace',
      accessRoleLabel: 'Owner',
    })
  })

  it('routes model updates and actions through the bridge action object', async () => {
    const actions = createActions()
    const wrapper = mount(WorkspaceMainLayoutBridge, {
      props: { model: createModel(), actions },
      global: { stubs },
    })

    await wrapper.find('.query').trigger('click')
    await wrapper.find('.icon').trigger('click')
    await wrapper.find('.open').trigger('click')
    await wrapper.find('.favorite').trigger('click')
    await wrapper.find('.move').trigger('click')
    await wrapper.find('.copy').trigger('click')
    await wrapper.find('.normalize').trigger('click')
    await wrapper.find('.title').trigger('click')
    await wrapper.find('.role').trigger('click')
    await wrapper.find('.copy-current').trigger('click')
    await wrapper.find('.register-holder').trigger('click')

    expect(actions.setValue).toHaveBeenCalledWith('workspaceDocumentQuery', 'draft')
    expect(actions.setValue).toHaveBeenCalledWith('workspacePropertyIcon', 'doc')
    expect(actions.openWorkspaceDocument).toHaveBeenCalledWith(pageDocument)
    expect(actions.toggleFavoriteWorkspaceDocument).toHaveBeenCalledWith(pageDocument)
    expect(actions.moveWorkspaceDocumentToSection).toHaveBeenCalledWith(pageDocument, 'section-1')
    expect(actions.copyWorkspaceDocumentLink).toHaveBeenCalledWith(pageDocument)
    expect(actions.normalizeWorkspacePageIcon).toHaveBeenCalled()
    expect(actions.handleTitleInput).toHaveBeenCalledWith('New title')
    expect(actions.handleRoleAction).toHaveBeenCalledWith({ email: 'member@example.com' }, 'EDITOR')
    expect(actions.copyCurrentWorkspaceDocumentLink).toHaveBeenCalled()
    expect(actions.registerEditorHolder).toHaveBeenCalledWith(holder)
  })
})
