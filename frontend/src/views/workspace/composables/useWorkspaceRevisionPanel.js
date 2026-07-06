import { computed } from 'vue'

import {
  buildWorkspaceRevisionDiffSnapshot,
  createWorkspaceRevisionDiffItems,
  createWorkspaceRevisionDiffSummary,
} from '../services/workspaceRevisionDiff.js'
import { parseWorkspaceSnapshot } from '../services/workspaceSnapshot.js'

export const WORKSPACE_REVISION_DIFF_LABELS = Object.freeze({
  emptyTitle: '\uC81C\uBAA9 \uC5C6\uC74C',
  blockSuffix: '\uBE14\uB85D',
  truncationSuffix: '\u2026',
})

const resolveSource = (source) => (typeof source === 'function' ? source() : source?.value)
const readRows = (source) => {
  const value = resolveSource(source)
  return Array.isArray(value) ? value : []
}
const readString = (source) => String(resolveSource(source) || '')
const readBoolean = (source) => Boolean(resolveSource(source))

export const useWorkspaceRevisionPanel = ({
  workspaceRevisions,
  workspaceId,
  canModifyWorkspacePage,
  activeWorkspaceRevision,
  workspaceRevisionDiff,
  editorApi,
  title,
  blockTypeLabel,
  labels = WORKSPACE_REVISION_DIFF_LABELS,
} = {}) => {
  const workspaceRevisionCount = computed(() => readRows(workspaceRevisions).length)
  const canRestoreWorkspaceRevision = computed(() =>
    Boolean(
      readString(workspaceId) &&
      readBoolean(canModifyWorkspacePage) &&
      resolveSource(activeWorkspaceRevision)?.id,
    ),
  )
  const workspaceRevisionDiffSummary = computed(() =>
    createWorkspaceRevisionDiffSummary(resolveSource(workspaceRevisionDiff)),
  )
  const workspaceRevisionDiffItems = computed(() =>
    createWorkspaceRevisionDiffItems(resolveSource(workspaceRevisionDiff)),
  )

  const buildWorkspaceRevisionDiff = async (revision) => {
    const targetSnapshot = parseWorkspaceSnapshot(revision?.contents)
    const currentEditorApi = resolveSource(editorApi)
    const currentSnapshot = currentEditorApi?.getCurrentSnapshot
      ? await currentEditorApi.getCurrentSnapshot()
      : { blocks: [] }

    return buildWorkspaceRevisionDiffSnapshot({
      revision,
      targetSnapshot,
      currentSnapshot,
      currentTitle: readString(title),
      blockTypeLabel,
      labels,
    })
  }

  return {
    workspaceRevisionCount,
    canRestoreWorkspaceRevision,
    workspaceRevisionDiffSummary,
    workspaceRevisionDiffItems,
    buildWorkspaceRevisionDiff,
  }
}
