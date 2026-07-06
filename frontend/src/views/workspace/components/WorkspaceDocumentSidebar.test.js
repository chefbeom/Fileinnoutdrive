import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'

import WorkspaceDocumentSidebar from './WorkspaceDocumentSidebar.vue'

const documents = {
  favorite: { id: 1, title: '즐겨찾기 문서', role: 'ADMIN', scope: 'personal', updatedAt: '2026-01-01T00:00:00Z' },
  recent: { id: 2, title: '최근 문서', role: 'WRITE', scope: 'shared', updatedAt: '2026-01-02T00:00:00Z' },
  personal: { id: 3, title: '내 문서', role: 'ADMIN', scope: 'personal', updatedAt: '2026-01-03T00:00:00Z' },
  shared: { id: 4, title: '공유 문서', role: 'READ', scope: 'shared', updatedAt: '2026-01-04T00:00:00Z' },
}

const mountSidebar = (props = {}) => mount(WorkspaceDocumentSidebar, {
  props: {
    documentQuery: '',
    sectionNameDraft: '기획',
    sectionEditingId: '',
    sectionEditDraft: '',
    documentsLoading: false,
    currentWorkspaceKey: '3',
    favoriteDocuments: [documents.favorite],
    recentDocuments: [documents.recent],
    documentSections: [{ id: 'alpha', name: 'Alpha' }],
    visibleSectionViews: [{ id: 'alpha', name: 'Alpha', collapsed: false, documents: [documents.personal] }],
    sectionedDocumentCount: 1,
    personalDocuments: [documents.personal],
    sharedDocuments: [documents.shared],
    canModifyPage: true,
    hasEditor: true,
    isDocumentFavorite: (document) => document.id === 1 || document.id === 3,
    documentSectionId: (document) => document.id === 3 ? 'alpha' : '',
    isDocumentActionLoading: vi.fn(() => false),
    ...props,
  },
})

describe('WorkspaceDocumentSidebar', () => {
  it('renders document groups, counts, and active document', () => {
    const wrapper = mountSidebar()

    expect(wrapper.text()).toContain('협업 문서')
    expect(wrapper.text()).toContain('즐겨찾기 문서')
    expect(wrapper.text()).toContain('최근 문서')
    expect(wrapper.text()).toContain('내 문서')
    expect(wrapper.text()).toContain('공유 문서')
    expect(wrapper.find('.workspace-doc-item--active').text()).toContain('내 문서')
  })

  it('emits query, create, and sidebar command events', async () => {
    const wrapper = mountSidebar()

    await wrapper.find('.workspace-command-open-btn').trigger('click')
    await wrapper.find('.workspace-new-page-btn').trigger('click')
    await wrapper.find('.workspace-doc-search input').setValue('문서')
    await wrapper.find('.workspace-section-composer').trigger('submit')

    expect(wrapper.emitted('open-command-palette')).toHaveLength(1)
    expect(wrapper.emitted('create-document')).toHaveLength(1)
    expect(wrapper.emitted('update:documentQuery')?.at(-1)).toEqual(['문서'])
    expect(wrapper.emitted('create-section')).toHaveLength(1)
  })

  it('emits document row actions', async () => {
    const wrapper = mountSidebar()
    const favoriteSection = wrapper.find('.workspace-doc-section--favorites')

    await favoriteSection.find('.workspace-doc-item__main').trigger('click')
    await favoriteSection.find('.workspace-doc-action-btn--favorite').trigger('click')
    await favoriteSection.find('.workspace-doc-section-select').setValue('alpha')
    await favoriteSection.find('.workspace-doc-action-btn--link').trigger('click')
    await favoriteSection.find('[title="페이지 링크 복사"]').trigger('click')
    await favoriteSection.find('[title="복제"]').trigger('click')
    await favoriteSection.find('.workspace-doc-action-btn--danger').trigger('click')

    expect(wrapper.emitted('open-document')?.[0]).toEqual([documents.favorite])
    expect(wrapper.emitted('toggle-favorite')?.[0]).toEqual([documents.favorite])
    expect(wrapper.emitted('move-section')?.[0]).toEqual([documents.favorite, 'alpha'])
    expect(wrapper.emitted('insert-link')?.[0]).toEqual([documents.favorite])
    expect(wrapper.emitted('copy-link')?.[0]).toEqual([documents.favorite])
    expect(wrapper.emitted('duplicate-document')?.[0]).toEqual([documents.favorite])
    expect(wrapper.emitted('remove-document')?.[0]).toEqual([documents.favorite])
  })

  it('emits section editing events and registers the edit input', async () => {
    const wrapper = mountSidebar({ sectionEditingId: 'alpha', sectionEditDraft: 'Alpha' })

    expect(wrapper.emitted('register-section-edit-input')?.[0]?.[0]).toBeInstanceOf(HTMLInputElement)

    await wrapper.find('.workspace-doc-group__rename input').setValue('Beta')
    await wrapper.find('.workspace-doc-group__rename input').trigger('keydown.esc')
    await wrapper.find('.workspace-doc-group__rename').trigger('submit')

    expect(wrapper.emitted('update:sectionEditDraft')?.at(-1)).toEqual(['Beta'])
    expect(wrapper.emitted('cancel-section-rename')).toHaveLength(1)
    expect(wrapper.emitted('save-section-rename')).toHaveLength(1)
  })

  it('shows loading and empty states', () => {
    const loading = mountSidebar({ documentsLoading: true })
    expect(loading.text()).toContain('문서 목록을 불러오는 중입니다.')

    const empty = mountSidebar({
      favoriteDocuments: [],
      recentDocuments: [],
      documentSections: [],
      visibleSectionViews: [],
      personalDocuments: [],
      sharedDocuments: [],
    })

    expect(empty.text()).toContain('내 페이지가 없습니다.')
    expect(empty.text()).toContain('공유 페이지가 없습니다.')
  })
})