import { computed } from 'vue'

const DEFAULT_UNTITLED_TITLE = '\uC81C\uBAA9 \uC5C6\uC74C'
const DEFAULT_FAVORITE_DISABLED_TITLE = '\uC800\uC7A5\uB41C \uD398\uC774\uC9C0\uC5D0\uC11C \uC990\uACA8\uCC3E\uAE30\uB97C \uC0AC\uC6A9\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4'
const DEFAULT_FAVORITE_REMOVE_TITLE = '\uC990\uACA8\uCC3E\uAE30 \uD574\uC81C'
const DEFAULT_FAVORITE_ADD_TITLE = '\uC990\uACA8\uCC3E\uAE30 \uCD94\uAC00'

const readValue = (source) =>
  source && typeof source === 'object' && 'value' in source ? source.value : source

export const useWorkspaceCurrentDocumentActions = ({
  workspaceId,
  route,
  title,
  workspaceDocumentById,
  workspaceAccessRole,
  documentUrlFor = () => '',
  isFavoriteDocument = () => false,
  labels = {},
} = {}) => {
  const currentWorkspaceLinkDocument = computed(() => {
    const id = readValue(workspaceId) || route?.params?.id
    if (!id || String(id) === 'new') return null

    const documentById = readValue(workspaceDocumentById)
    const indexedDocument = documentById?.get?.(String(id))
    return {
      ...(indexedDocument || {}),
      id,
      title: readValue(title) || indexedDocument?.title || labels.untitledTitle || DEFAULT_UNTITLED_TITLE,
      role: indexedDocument?.role || readValue(workspaceAccessRole),
      scope: indexedDocument?.scope || 'personal',
    }
  })

  const canCopyCurrentWorkspaceDocumentLink = computed(() =>
    Boolean(currentWorkspaceLinkDocument.value && documentUrlFor(currentWorkspaceLinkDocument.value)),
  )

  const canFavoriteCurrentWorkspaceDocument = computed(() =>
    Boolean(currentWorkspaceLinkDocument.value?.id),
  )

  const isCurrentWorkspaceDocumentFavorite = computed(() =>
    isFavoriteDocument(currentWorkspaceLinkDocument.value),
  )

  const currentWorkspaceFavoriteTitle = computed(() => {
    if (!canFavoriteCurrentWorkspaceDocument.value) {
      return labels.favoriteDisabledTitle || DEFAULT_FAVORITE_DISABLED_TITLE
    }
    return isCurrentWorkspaceDocumentFavorite.value
      ? labels.favoriteRemoveTitle || DEFAULT_FAVORITE_REMOVE_TITLE
      : labels.favoriteAddTitle || DEFAULT_FAVORITE_ADD_TITLE
  })

  return {
    currentWorkspaceLinkDocument,
    canCopyCurrentWorkspaceDocumentLink,
    canFavoriteCurrentWorkspaceDocument,
    isCurrentWorkspaceDocumentFavorite,
    currentWorkspaceFavoriteTitle,
  }
}
