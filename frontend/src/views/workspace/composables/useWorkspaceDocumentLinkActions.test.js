import { ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'

import { useWorkspaceDocumentLinkActions } from './useWorkspaceDocumentLinkActions.js'

const createSubject = (overrides = {}) => {
  const editorApi = ref({
    appendWorkspacePageLink: vi.fn().mockResolvedValue(true),
    getCurrentSnapshot: vi.fn().mockResolvedValue({ blocks: [{ type: 'paragraph', data: { text: 'Hello' } }] }),
  })
  const showWorkspaceNotice = vi.fn()
  const clipboardWriter = vi.fn().mockResolvedValue(true)
  const markWorkspaceDocumentLinkCopied = vi.fn()
  const markdownBuilder = vi.fn(() => '# Page')
  const markdownDownloader = vi.fn()

  const subject = useWorkspaceDocumentLinkActions({
    editorApi,
    isEditorLoading: ref(false),
    workspaceMarkdownExporting: ref(false),
    canModifyWorkspacePage: ref(true),
    title: ref('Roadmap'),
    workspacePropertyStatusOption: ref({ label: '진행 중' }),
    workspacePropertyPriorityOption: ref({ label: '높음' }),
    workspacePropertyOwnerEmail: ref('owner@example.com'),
    workspacePropertyOwnerName: ref('Owner'),
    workspacePropertyDueDate: ref('2026-07-04'),
    workspacePropertyTags: ref(['launch']),
    originFor: () => 'https://app.fileinnout.local',
    clipboardWriter,
    markWorkspaceDocumentLinkCopied,
    markdownBuilder,
    markdownDownloader,
    showWorkspaceNotice,
    ...overrides,
  })

  return {
    subject,
    editorApi,
    showWorkspaceNotice,
    clipboardWriter,
    markWorkspaceDocumentLinkCopied,
    markdownBuilder,
    markdownDownloader,
  }
}

describe('useWorkspaceDocumentLinkActions', () => {
  it('inserts workspace page links through the editor API', async () => {
    const { subject, editorApi } = createSubject()

    await subject.insertWorkspacePageLink({ id: 'page 1', title: 'Page One' })

    expect(editorApi.value.appendWorkspacePageLink).toHaveBeenCalledWith({
      id: 'page 1',
      title: 'Page One',
      path: '/workspace/read/page%201',
    })
  })

  it('copies absolute workspace document URLs and marks the copied document', async () => {
    const { subject, clipboardWriter, markWorkspaceDocumentLinkCopied, showWorkspaceNotice } = createSubject()
    const document = { id: 42, title: 'Launch' }

    await subject.copyWorkspaceDocumentLink(document)

    expect(clipboardWriter).toHaveBeenCalledWith('https://app.fileinnout.local/workspace/read/42')
    expect(markWorkspaceDocumentLinkCopied).toHaveBeenCalledWith(document)
    expect(showWorkspaceNotice).toHaveBeenCalledWith(expect.any(String), 'success')
  })

  it('exports markdown snapshots while guarding concurrent export state', async () => {
    const workspaceMarkdownExporting = ref(false)
    const { subject, markdownBuilder, markdownDownloader, showWorkspaceNotice } = createSubject({
      workspaceMarkdownExporting,
    })

    expect(subject.canExportWorkspaceMarkdown.value).toBe(true)
    await subject.exportWorkspaceMarkdown()

    expect(markdownBuilder).toHaveBeenCalledWith(
      { blocks: [{ type: 'paragraph', data: { text: 'Hello' } }] },
      expect.objectContaining({
        pageTitle: 'Roadmap',
        statusLabel: '진행 중',
        priorityLabel: '높음',
        ownerLabel: 'Owner',
        dueDate: '2026-07-04',
        tags: ['launch'],
      }),
    )
    expect(markdownDownloader).toHaveBeenCalledWith('# Page', 'Roadmap.md')
    expect(showWorkspaceNotice).toHaveBeenCalledWith(expect.any(String), 'success')
    expect(workspaceMarkdownExporting.value).toBe(false)
  })
})
