import { buildWorkspaceTemplateData } from '../services/workspaceTemplates.js'

const resolveSource = (source) => (typeof source === 'function' ? source() : source?.value)
const setSourceValue = (source, value) => {
  if (source && typeof source === 'object' && 'value' in source) source.value = value
}
const readBoolean = (source) => Boolean(resolveSource(source))
const readString = (source) => String(resolveSource(source) || '')
const errorMessage = (error, fallback) =>
  error?.response?.data?.message || error?.message || fallback

const blurActiveElement = () => {
  if (typeof document !== 'undefined' && typeof document.activeElement?.blur === 'function') {
    document.activeElement.blur()
  }
}

export const useWorkspaceEditorMutations = ({
  editorApi,
  canInsertWorkspaceQuickBlock,
  workspaceQuickBlockAdding,
  workspaceQuickBlockText,
  workspaceInlineQuickBlockText,
  activeWorkspacePanelTab,
  showWorkspaceNotice,
  canEditWorkspace,
  workspacePageLocked,
  canModifyWorkspacePage,
  title,
  titleDirty,
  scheduleAutoSave,
  persistWorkspace,
  workspaceTemplateApplying,
  workspaceTemplateApplied,
  blurActiveElement: blurActiveElementFn = blurActiveElement,
} = {}) => {
  const insertWorkspaceQuickBlock = async (block, options = {}) => {
    if (!block?.id || !readBoolean(canInsertWorkspaceQuickBlock) || readString(workspaceQuickBlockAdding)) return false
    const blockText = options.text ?? readString(workspaceQuickBlockText)
    setSourceValue(workspaceQuickBlockAdding, block.id)
    try {
      const inserted = await resolveSource(editorApi)?.appendWorkspaceBlock?.({
        type: block.id,
        text: blockText,
        level: block.id === 'header' ? 2 : undefined,
      })
      if (inserted) {
        if (typeof options.onInserted === 'function') {
          options.onInserted()
        } else {
          setSourceValue(workspaceQuickBlockText, '')
        }
        if (options.revealOutline !== false) {
          setSourceValue(activeWorkspacePanelTab, 'outline')
        }
        return true
      }
      showWorkspaceNotice?.('블록을 삽입하지 못했습니다.', 'error')
      return false
    } catch (error) {
      console.error('Workspace quick block insert failed:', error)
      showWorkspaceNotice?.(errorMessage(error, '블록을 삽입하지 못했습니다.'), 'error')
      return false
    } finally {
      setSourceValue(workspaceQuickBlockAdding, '')
    }
  }

  const insertWorkspaceInlineQuickBlock = async (block) =>
    insertWorkspaceQuickBlock(block, {
      text: readString(workspaceInlineQuickBlockText),
      revealOutline: false,
      onInserted: () => {
        setSourceValue(workspaceInlineQuickBlockText, '')
      },
    })

  const toggleWorkspacePageLock = () => {
    if (!readBoolean(canEditWorkspace)) return false
    const nextLocked = !readBoolean(workspacePageLocked)
    setSourceValue(workspacePageLocked, nextLocked)
    if (nextLocked) {
      resolveSource(editorApi)?.clearSelectedBlockAnchor?.()
      blurActiveElementFn?.()
    }
    return true
  }

  const handleSave = async () => {
    try {
      await persistWorkspace?.({ navigateNewDocument: true })
      return true
    } catch (error) {
      console.error('Workspace save failed:', error)
      return false
    }
  }

  const handleTitleInput = (event) => {
    if (!readBoolean(canModifyWorkspacePage)) return false
    const nextTitle = event?.target?.value ?? ''
    setSourceValue(title, nextTitle)
    setSourceValue(titleDirty, true)
    scheduleAutoSave?.()
    resolveSource(editorApi)?.updateTitleFromLocal?.(nextTitle)
    return true
  }

  const applyWorkspaceTemplate = async (template) => {
    const currentEditorApi = resolveSource(editorApi)
    if (!template || !readBoolean(canModifyWorkspacePage) || !currentEditorApi?.applyDocumentTemplate || readString(workspaceTemplateApplying)) {
      return false
    }
    setSourceValue(workspaceTemplateApplying, template.id)
    try {
      const nextTitle = template.titleValue || template.title || '새 페이지'
      setSourceValue(title, nextTitle)
      setSourceValue(titleDirty, true)
      currentEditorApi.updateTitleFromLocal?.(nextTitle)
      await currentEditorApi.applyDocumentTemplate(buildWorkspaceTemplateData(template))
      setSourceValue(workspaceTemplateApplied, true)
      setSourceValue(activeWorkspacePanelTab, 'outline')
      return true
    } catch (error) {
      showWorkspaceNotice?.(errorMessage(error, '템플릿을 적용하지 못했습니다.'), 'error')
      return false
    } finally {
      setSourceValue(workspaceTemplateApplying, '')
    }
  }

  return {
    insertWorkspaceQuickBlock,
    insertWorkspaceInlineQuickBlock,
    toggleWorkspacePageLock,
    handleSave,
    handleTitleInput,
    applyWorkspaceTemplate,
  }
}
