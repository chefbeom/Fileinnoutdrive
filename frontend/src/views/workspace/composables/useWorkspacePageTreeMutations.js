import { nextTick } from 'vue'

const resolveSource = (source) => (typeof source === 'function' ? source() : source?.value)
const writeSource = (source, value) => {
  if (source && typeof source === 'object' && 'value' in source) source.value = value
}
const readString = (source) => String(resolveSource(source) || '')
const readMap = (source) => {
  const value = resolveSource(source)
  return value instanceof Map ? value : new Map()
}

const errorMessage = (error, fallback) =>
  error?.response?.data?.message || error?.message || fallback

export const useWorkspacePageTreeMutations = ({
  documentId,
  canApplyWorkspaceTreeMove,
  workspaceTreeMoveTargetId,
  workspaceTreeMoveSavingId,
  workspaceTreeMoveError,
  workspacePageIndexRowById,
  workspaceDocumentById,
  currentWorkspaceKey,
  editorApi,
  applyWorkspaceParentPage,
  persistWorkspace,
  fetchWorkspaceDocument,
  saveWorkspaceDocument,
  serializeWorkspaceSnapshotWithParent,
  refreshWorkspaceDocuments,
  refreshWorkspacePageIndex,
  collapsedWorkspacePageTreeIds,
  cancelWorkspaceTreeMove,
  workspaceTreeRenameDraft,
  workspaceTreeRenameSavingId,
  workspaceTreeRenameError,
  isWorkspaceTreeRenameOpen,
  cancelWorkspaceTreeRename,
  title,
  titleDirty,
  createWorkspaceChildPage,
  workspaceTreeSubpageCreatingId,
  workspaceTreeSubpageError,
  workspaceTreeSubpageTitle,
  workspacePageTreeQuery,
  cancelWorkspaceTreeSubpageComposer,
  activeWorkspacePanelTab,
} = {}) => {
  const moveWorkspaceTreePage = async (node) => {
    const pageId = documentId?.(node)
    if (!pageId || !canApplyWorkspaceTreeMove?.(node)) return false

    const targetId = readString(workspaceTreeMoveTargetId)
    const target = targetId
      ? readMap(workspacePageIndexRowById).get(targetId) || readMap(workspaceDocumentById).get(targetId)
      : null
    const parent = targetId
      ? { id: targetId, title: target?.title || 'Parent page' }
      : { id: '', title: '' }

    writeSource(workspaceTreeMoveSavingId, String(pageId))
    writeSource(workspaceTreeMoveError, '')
    try {
      const currentEditorApi = resolveSource(editorApi)
      if (String(pageId) === readString(currentWorkspaceKey) && currentEditorApi?.savePost) {
        applyWorkspaceParentPage?.(parent)
        await nextTick()
        await persistWorkspace?.({ navigateNewDocument: false })
      } else {
        const data = await fetchWorkspaceDocument?.(pageId)
        await saveWorkspaceDocument?.({
          idx: pageId,
          title: data?.title || node.title || 'Untitled',
          contents: serializeWorkspaceSnapshotWithParent?.(data?.contents, parent),
        })
        await refreshWorkspaceDocuments?.()
      }
      if (targetId && collapsedWorkspacePageTreeIds?.value) {
        collapsedWorkspacePageTreeIds.value = collapsedWorkspacePageTreeIds.value.filter(
          (id) => String(id) !== targetId,
        )
      }
      await refreshWorkspacePageIndex?.()
      cancelWorkspaceTreeMove?.()
      return true
    } catch (error) {
      writeSource(workspaceTreeMoveError, errorMessage(error, '페이지 위치를 변경하지 못했습니다.'))
      return false
    } finally {
      writeSource(workspaceTreeMoveSavingId, '')
    }
  }

  const renameWorkspaceTreePage = async (node) => {
    const pageId = documentId?.(node)
    const nextTitle = readString(workspaceTreeRenameDraft).trim().slice(0, 120)
    if (!pageId || !node?.canEditProperties || !isWorkspaceTreeRenameOpen?.(node)) return false
    if (!nextTitle) {
      writeSource(workspaceTreeRenameError, '페이지 제목을 입력해주세요.')
      return false
    }
    if (nextTitle === String(node.title || '').trim()) {
      cancelWorkspaceTreeRename?.()
      return false
    }

    writeSource(workspaceTreeRenameSavingId, String(pageId))
    writeSource(workspaceTreeRenameError, '')
    try {
      const currentEditorApi = resolveSource(editorApi)
      if (String(pageId) === readString(currentWorkspaceKey) && currentEditorApi?.savePost) {
        writeSource(title, nextTitle)
        writeSource(titleDirty, true)
        currentEditorApi.updateTitleFromLocal?.(nextTitle)
        await persistWorkspace?.({ navigateNewDocument: false })
      } else {
        const data = await fetchWorkspaceDocument?.(pageId)
        await saveWorkspaceDocument?.({
          idx: pageId,
          title: nextTitle,
          contents: data?.contents || '',
        })
        await refreshWorkspaceDocuments?.()
      }
      await refreshWorkspacePageIndex?.()
      cancelWorkspaceTreeRename?.()
      return true
    } catch (error) {
      writeSource(workspaceTreeRenameError, errorMessage(error, '페이지 이름을 변경하지 못했습니다.'))
      return false
    } finally {
      writeSource(workspaceTreeRenameSavingId, '')
    }
  }

  const createWorkspaceTreeSubpage = async (parentDocument) => {
    const parentId = documentId?.(parentDocument)
    if (!parentId || readString(workspaceTreeSubpageCreatingId) || !parentDocument?.canEditProperties) return false
    const parentTitle = parentDocument.title || '상위 페이지'
    const pageTitle = readString(workspaceTreeSubpageTitle).trim().slice(0, 80)
    if (!pageTitle) {
      writeSource(workspaceTreeSubpageError, '하위 페이지 제목을 입력해주세요.')
      return false
    }

    writeSource(workspaceTreeSubpageCreatingId, String(parentId))
    writeSource(workspaceTreeSubpageError, '')
    try {
      await createWorkspaceChildPage?.({
        parentId,
        parentTitle,
        pageTitle,
        refresh: true,
      })
      if (collapsedWorkspacePageTreeIds?.value) {
        collapsedWorkspacePageTreeIds.value = collapsedWorkspacePageTreeIds.value.filter(
          (id) => String(id) !== String(parentId),
        )
      }
      writeSource(workspacePageTreeQuery, '')
      cancelWorkspaceTreeSubpageComposer?.()
      writeSource(activeWorkspacePanelTab, 'tree')
      return true
    } catch (error) {
      writeSource(workspaceTreeSubpageError, errorMessage(error, '하위 페이지를 만들지 못했습니다.'))
      return false
    } finally {
      writeSource(workspaceTreeSubpageCreatingId, '')
    }
  }

  return {
    moveWorkspaceTreePage,
    renameWorkspaceTreePage,
    createWorkspaceTreeSubpage,
  }
}
