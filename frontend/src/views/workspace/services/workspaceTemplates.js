import { createWorkspaceDocumentPath, escapeWorkspaceInlineHtml } from './workspaceDocuments.js'
import { normalizeWorkspaceProperties } from './workspaceProperties.js'

const DEFAULT_SUBPAGE_PARENT_LABEL = '\uC0C1\uC704 \uD398\uC774\uC9C0'
const DEFAULT_SUBPAGE_TITLE = '\uC0C8 \uD558\uC704 \uD398\uC774\uC9C0'
const DEFAULT_PAGE_ICON = '\uD83D\uDCC4'

export const buildWorkspaceTemplateData = (template = {}, timestamp = Date.now()) => ({
  time: timestamp,
  blocks: (template?.blocks || []).map((block, index) => ({
    ...JSON.parse(JSON.stringify(block)),
    id: `template-${template?.id}-${timestamp}-${index}`,
  })),
})

export const buildWorkspaceSubpageSnapshot = ({
  parentId = '',
  parentTitle = '',
  pageTitle = '',
  currentProperties = {},
  propertyOptions = {},
  timestamp = Date.now(),
} = {}) => {
  const parentPath = createWorkspaceDocumentPath({ id: parentId })
  const parentLabel = parentTitle || DEFAULT_SUBPAGE_PARENT_LABEL

  return JSON.stringify({
    time: timestamp,
    blocks: [
      {
        id: `subpage-title-${timestamp}`,
        type: 'header',
        data: { text: escapeWorkspaceInlineHtml(pageTitle || DEFAULT_SUBPAGE_TITLE), level: 1 },
      },
      {
        id: `subpage-parent-${timestamp}`,
        type: 'paragraph',
        data: {
          text: `<a href="${escapeWorkspaceInlineHtml(parentPath)}" data-workspace-page-id="${escapeWorkspaceInlineHtml(parentId)}">\u2190 ${escapeWorkspaceInlineHtml(parentLabel)}</a>`,
        },
      },
      {
        id: `subpage-body-${timestamp}`,
        type: 'paragraph',
        data: { text: '' },
      },
    ],
    meta: {
      parentWorkspaceId: String(parentId || ''),
      parentWorkspaceTitle: parentLabel,
      workspaceProperties: normalizeWorkspaceProperties({
        icon: DEFAULT_PAGE_ICON,
        coverColor: currentProperties.coverColor,
        status: 'planning',
        priority: currentProperties.priority,
        ownerEmail: currentProperties.ownerEmail,
        ownerName: currentProperties.ownerName,
        tags: currentProperties.tags,
      }, propertyOptions),
    },
  })
}