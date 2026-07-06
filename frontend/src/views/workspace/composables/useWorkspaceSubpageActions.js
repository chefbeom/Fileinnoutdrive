import { nextTick, unref } from 'vue'

import { extractSavedWorkspaceId } from '../services/workspaceDocuments.js'
import { buildWorkspaceSubpageSnapshot } from '../services/workspaceTemplates.js'

const noop = () => {}

const DEFAULT_LABELS = Object.freeze({
  defaultParentTitle: '\uC0C1\uC704 \uD398\uC774\uC9C0',
  missingChildInfo: '\uD558\uC704 \uD398\uC774\uC9C0 \uC815\uBCF4\uB97C \uD655\uC778\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.',
  missingSavedChild: '\uD558\uC704 \uD398\uC774\uC9C0 \uC800\uC7A5 \uACB0\uACFC\uB97C \uD655\uC778\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.',
  linkInsertFailed: '\uD558\uC704 \uD398\uC774\uC9C0\uB294 \uC0DD\uC131\uD588\uC9C0\uB9CC \uBD80\uBAA8 \uBB38\uC11C\uC5D0 \uB9C1\uD06C\uB97C \uC0BD\uC785\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.',
  createFailed: '\uD558\uC704 \uD398\uC774\uC9C0\uB97C \uB9CC\uB4E4\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.',
})

const readValue = (source) => {
  if (typeof source === 'function') return source()
  return unref(source)
}

const readString = (source) => String(readValue(source) || '')

const writeRef = (target, value) => {
  if (target && typeof target === 'object' && 'value' in target) {
    target.value = value
  }
}

const errorMessage = (error, fallback) =>
  error?.response?.data?.message || error?.message || fallback

export const useWorkspaceSubpageActions = ({
  api,
  editorApi,
  title,
  currentWorkspaceProperties,
  workspacePropertyOptions = {},
  workspaceSubpageInput,
  workspaceSubpageTitle,
  workspaceSubpageCreating,
  workspaceSubpageError,
  canStartWorkspaceSubpage,
  canCreateWorkspaceSubpage,
  isWorkspacePanelCollapsed,
  activeWorkspacePanelTab,
  workspaceDocumentPath = () => '',
  ensureWorkspacePersisted = async () => null,
  persistWorkspace = async () => {},
  refreshWorkspaceDocuments = async () => {},
  refreshWorkspacePageIndex = async () => {},
  snapshotBuilder = buildWorkspaceSubpageSnapshot,
  savedWorkspaceIdExtractor = extractSavedWorkspaceId,
  nextTickFn = nextTick,
  labels = {},
} = {}) => {
  const messages = { ...DEFAULT_LABELS, ...labels }

  const createWorkspaceSubpageSnapshot = ({ parentId, parentTitle, pageTitle }) =>
    snapshotBuilder({
      parentId,
      parentTitle,
      pageTitle,
      currentProperties: readValue(currentWorkspaceProperties) || {},
      propertyOptions: workspacePropertyOptions,
    })

  const focusWorkspaceSubpageComposer = async () => {
    if (!readValue(canStartWorkspaceSubpage)) return false

    writeRef(isWorkspacePanelCollapsed, false)
    writeRef(activeWorkspacePanelTab, 'links')
    await nextTickFn()
    readValue(workspaceSubpageInput)?.focus?.()
    return true
  }

  const createWorkspaceChildPage = async ({ parentId, parentTitle, pageTitle, refresh = true } = {}) => {
    if (!parentId || !pageTitle) {
      throw new Error(messages.missingChildInfo)
    }

    const response = await api.savePost({
      idx: null,
      title: pageTitle,
      contents: createWorkspaceSubpageSnapshot({ parentId, parentTitle, pageTitle }),
    })
    const childId = savedWorkspaceIdExtractor(response)
    if (!childId) {
      throw new Error(messages.missingSavedChild)
    }

    const childDocument = { id: childId, title: pageTitle, role: 'ADMIN', scope: 'personal' }
    if (refresh) {
      await refreshWorkspaceDocuments()
      await refreshWorkspacePageIndex()
    }
    return childDocument
  }

  const createWorkspaceSubpage = async () => {
    const pageTitle = readString(workspaceSubpageTitle).trim()
    if (!pageTitle || !readValue(canCreateWorkspaceSubpage)) return false

    writeRef(workspaceSubpageCreating, true)
    writeRef(workspaceSubpageError, '')

    try {
      const parentId = await ensureWorkspacePersisted({ navigate: true })
      const parentTitle = readString(title).trim() || messages.defaultParentTitle
      const childDocument = await createWorkspaceChildPage({
        parentId,
        parentTitle,
        pageTitle,
        refresh: false,
      })
      const inserted = await readValue(editorApi)?.appendWorkspacePageLink?.({
        id: childDocument.id,
        title: pageTitle,
        path: workspaceDocumentPath(childDocument),
      })
      if (!inserted) {
        throw new Error(messages.linkInsertFailed)
      }

      writeRef(workspaceSubpageTitle, '')
      await persistWorkspace({ navigateNewDocument: false })
      await refreshWorkspaceDocuments()
      await refreshWorkspacePageIndex()
      writeRef(activeWorkspacePanelTab, 'links')
      return true
    } catch (error) {
      writeRef(workspaceSubpageError, errorMessage(error, messages.createFailed))
      return false
    } finally {
      writeRef(workspaceSubpageCreating, false)
    }
  }

  return {
    createWorkspaceSubpageSnapshot,
    focusWorkspaceSubpageComposer,
    createWorkspaceChildPage,
    createWorkspaceSubpage,
  }
}
