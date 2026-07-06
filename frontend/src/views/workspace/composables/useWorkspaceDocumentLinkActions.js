import { computed, unref } from 'vue'

import {
  createWorkspaceDocumentAbsoluteUrl,
  createWorkspaceDocumentPath,
} from '../services/workspaceDocuments.js'
import { writeWorkspaceClipboardText } from '../services/workspaceClipboard.js'
import {
  buildWorkspaceMarkdownExport,
  downloadWorkspaceMarkdown,
  workspaceExportFileName,
} from '../services/workspaceMarkdown.js'
import { workspaceDocumentId } from '../services/workspacePreferenceState.js'

const noop = () => {}

const DEFAULT_LABELS = Object.freeze({
  untitledTitle: '\uC81C\uBAA9 \uC5C6\uC74C',
  insertFailed: '\uD398\uC774\uC9C0 \uB9C1\uD06C\uB97C \uBCF8\uBB38\uC5D0 \uC0BD\uC785\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.',
  copySuccess: '\uD398\uC774\uC9C0 \uB9C1\uD06C\uB97C \uBCF5\uC0AC\uD588\uC2B5\uB2C8\uB2E4.',
  copyFailed: '\uB9C1\uD06C\uB97C \uC790\uB3D9\uC73C\uB85C \uBCF5\uC0AC\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4. \uBE0C\uB77C\uC6B0\uC800 \uAD8C\uD55C\uC744 \uD655\uC778\uD574\uC8FC\uC138\uC694.',
  exportSuccess: 'Markdown \uD30C\uC77C\uC744 \uB0B4\uBCF4\uB0C8\uC2B5\uB2C8\uB2E4.',
  exportFailed: 'Markdown \uB0B4\uBCF4\uB0B4\uAE30\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.',
})

const readValue = (source) => {
  if (typeof source === 'function') return source()
  return unref(source)
}

const defaultOrigin = () =>
  typeof window === 'undefined' ? '' : window.location.origin

export const useWorkspaceDocumentLinkActions = ({
  editorApi,
  isEditorLoading,
  workspaceMarkdownExporting,
  canModifyWorkspacePage,
  title,
  workspacePropertyStatusOption,
  workspacePropertyPriorityOption,
  workspacePropertyOwnerEmail,
  workspacePropertyOwnerName,
  workspacePropertyDueDate,
  workspacePropertyTags,
  documentIdFor = workspaceDocumentId,
  originFor = defaultOrigin,
  markdownBuilder = buildWorkspaceMarkdownExport,
  markdownDownloader = downloadWorkspaceMarkdown,
  exportFileNameFor = workspaceExportFileName,
  clipboardWriter = writeWorkspaceClipboardText,
  markWorkspaceDocumentLinkCopied = noop,
  showWorkspaceNotice = noop,
  labels = {},
} = {}) => {
  const messages = { ...DEFAULT_LABELS, ...labels }

  const workspaceDocumentPath = (document) =>
    createWorkspaceDocumentPath(document, { documentIdFor })

  const workspaceDocumentAbsoluteUrl = (document) =>
    createWorkspaceDocumentAbsoluteUrl(document, {
      origin: readValue(originFor),
      documentIdFor,
    })

  const canExportWorkspaceMarkdown = computed(() =>
    Boolean(
      readValue(editorApi)?.getCurrentSnapshot &&
      !readValue(isEditorLoading) &&
      !readValue(workspaceMarkdownExporting),
    ),
  )

  const insertWorkspacePageLink = async (document) => {
    const api = readValue(editorApi)
    if (!readValue(canModifyWorkspacePage) || !api?.appendWorkspacePageLink) return

    const path = workspaceDocumentPath(document)
    if (!path) return

    const inserted = await api.appendWorkspacePageLink({
      id: documentIdFor(document),
      title: document?.title || messages.untitledTitle,
      path,
    })
    if (!inserted) {
      showWorkspaceNotice(messages.insertFailed, 'error')
    }
  }

  const copyWorkspaceDocumentLink = async (document) => {
    const url = workspaceDocumentAbsoluteUrl(document)
    if (!url) return

    const copied = await clipboardWriter(url)
    if (copied) {
      markWorkspaceDocumentLinkCopied(document)
      showWorkspaceNotice(messages.copySuccess, 'success')
      return
    }

    showWorkspaceNotice(messages.copyFailed, 'error', { timeout: 5200 })
  }

  const exportWorkspaceMarkdown = async () => {
    if (!canExportWorkspaceMarkdown.value) return

    workspaceMarkdownExporting.value = true
    try {
      const snapshot = await readValue(editorApi).getCurrentSnapshot()
      const ownerEmail = readValue(workspacePropertyOwnerEmail)
      const ownerName = readValue(workspacePropertyOwnerName)
      const markdown = markdownBuilder(snapshot, {
        pageTitle: readValue(title),
        statusLabel: readValue(workspacePropertyStatusOption)?.label,
        priorityLabel: readValue(workspacePropertyPriorityOption)?.label,
        ownerLabel: ownerEmail ? ownerName || ownerEmail : '',
        dueDate: readValue(workspacePropertyDueDate),
        tags: readValue(workspacePropertyTags),
      })

      markdownDownloader(markdown, exportFileNameFor(readValue(title)))
      showWorkspaceNotice(messages.exportSuccess, 'success')
    } catch (error) {
      console.error('Workspace markdown export failed:', error)
      showWorkspaceNotice(error?.message || messages.exportFailed, 'error')
    } finally {
      workspaceMarkdownExporting.value = false
    }
  }

  return {
    canExportWorkspaceMarkdown,
    workspaceDocumentPath,
    workspaceDocumentAbsoluteUrl,
    insertWorkspacePageLink,
    copyWorkspaceDocumentLink,
    exportWorkspaceMarkdown,
  }
}
