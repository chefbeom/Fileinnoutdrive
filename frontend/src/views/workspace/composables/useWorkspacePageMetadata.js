import { nextTick, ref, unref } from 'vue'

const noop = () => {}

const setRefValue = (target, value) => {
  if (target && typeof target === 'object' && 'value' in target) {
    target.value = value
  }
}

const resolveValue = (value) => {
  if (typeof value === 'function') return value()
  return unref(value)
}

export const useWorkspacePageMetadata = ({
  normalizeWorkspaceProperties = (properties) => properties || {},
  workspacePropertyIcon = null,
  workspacePropertyCoverColor = null,
  workspacePropertyStatus = null,
  workspacePropertyPriority = null,
  workspacePropertyOwnerEmail = null,
  workspacePropertyOwnerName = null,
  workspacePropertyDueDate = null,
  workspacePropertyTagsInput = null,
  workspacePageLocked = null,
  workspaceParentPageId = null,
  workspaceParentPageTitle = null,
  currentWorkspaceParentPage = null,
  openWorkspaceDocument = noop,
} = {}) => {
  const suppressWorkspacePropertyWatch = ref(false)

  const applyWorkspaceProperties = (properties = {}) => {
    const normalized = normalizeWorkspaceProperties(properties)

    suppressWorkspacePropertyWatch.value = true
    setRefValue(workspacePropertyIcon, normalized.icon)
    setRefValue(workspacePropertyCoverColor, normalized.coverColor)
    setRefValue(workspacePropertyStatus, normalized.status)
    setRefValue(workspacePropertyPriority, normalized.priority)
    setRefValue(workspacePropertyOwnerEmail, normalized.ownerEmail)
    setRefValue(workspacePropertyOwnerName, normalized.ownerName)
    setRefValue(workspacePropertyDueDate, normalized.dueDate)
    setRefValue(workspacePropertyTagsInput, Array.isArray(normalized.tags) ? normalized.tags.join(', ') : '')
    setRefValue(workspacePageLocked, Boolean(normalized.locked))

    nextTick(() => {
      suppressWorkspacePropertyWatch.value = false
    })

    return normalized
  }

  const applyWorkspaceParentPage = (parent = {}) => {
    const parentId = String(parent.id || '').trim()
    setRefValue(workspaceParentPageId, parentId)
    setRefValue(workspaceParentPageTitle, parentId ? String(parent.title || '').trim() : '')
    return {
      id: parentId,
      title: parentId ? String(parent.title || '').trim() : '',
    }
  }

  const openWorkspaceParentPage = async () => {
    const parent = resolveValue(currentWorkspaceParentPage)
    if (!parent?.id) return false
    await openWorkspaceDocument(parent)
    return true
  }

  return {
    suppressWorkspacePropertyWatch,
    applyWorkspaceProperties,
    applyWorkspaceParentPage,
    openWorkspaceParentPage,
  }
}
