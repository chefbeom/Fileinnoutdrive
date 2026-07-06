import { createChecklistTaskItem, createWorkspaceBlockId } from './editorBlockFactory.js'

export const normalizeTaskPath = (task = {}) => {
  if (Array.isArray(task?.path)) {
    return task.path.map((index) => Number(index)).filter((index) => Number.isInteger(index) && index >= 0)
  }

  const id = String(task?.id || '')
  const separatorIndex = id.lastIndexOf(':')
  const pathText = separatorIndex >= 0 ? id.slice(separatorIndex + 1) : String(task?.pathLabel || '')
  return pathText
    .split('.')
    .map((index) => String(index).trim())
    .filter(Boolean)
    .map((index) => Number(index))
    .filter((index) => Number.isInteger(index) && index >= 0)
}

export const resolveChecklistTaskTarget = (blocks = [], task = {}) => {
  const path = normalizeTaskPath(task)
  if (!path.length) return null

  const anchorId = String(task.anchorBlockId || '').trim()
  const hintedBlockIndex = Number(task.blockIndex)
  const blockIndex = Number.isInteger(hintedBlockIndex)
    && hintedBlockIndex >= 0
    && String(blocks[hintedBlockIndex]?.id || `index-${hintedBlockIndex}`) === anchorId
    ? hintedBlockIndex
    : blocks.findIndex((block, index) => String(block?.id || `index-${index}`) === anchorId)

  if (blockIndex < 0) return null

  const block = blocks[blockIndex]
  const style = String(block?.data?.style || '').toLowerCase()
  if (block?.type !== 'list' || style !== 'checklist' || !Array.isArray(block.data?.items)) {
    return null
  }

  let currentItems = block.data.items
  let item = null
  for (const index of path) {
    item = currentItems?.[index]
    if (!item) return null
    currentItems = Array.isArray(item.items) ? item.items : []
  }

  return { block, item, blockIndex, path }
}

export const readChecklistTaskChecked = (item) => Boolean(
  item?.meta?.checked ?? item?.checked ?? item?.data?.checked,
)

export const toggleChecklistTaskInSnapshot = (snapshot = {}, task = {}) => {
  const blocks = Array.isArray(snapshot.blocks) ? snapshot.blocks : []
  snapshot.blocks = blocks

  const target = resolveChecklistTaskTarget(blocks, task)
  if (!target?.item) return { changed: false, anchorBlockId: '' }

  target.item.meta = {
    ...(target.item.meta || {}),
    checked: !readChecklistTaskChecked(target.item),
  }

  return {
    changed: true,
    anchorBlockId: target.block?.id || `index-${target.blockIndex}`,
    checked: target.item.meta.checked,
  }
}

export const appendChecklistTaskToSnapshot = (snapshot = {}, input) => {
  const newItem = createChecklistTaskItem(input)
  if (!newItem) return { changed: false, anchorBlockId: '' }

  const blocks = Array.isArray(snapshot.blocks) ? snapshot.blocks : []
  snapshot.blocks = blocks

  let checklistBlockIndex = blocks.findIndex((block) =>
    block?.type === 'list' && String(block?.data?.style || '').toLowerCase() === 'checklist',
  )

  if (checklistBlockIndex < 0) {
    const nextBlock = {
      id: createWorkspaceBlockId('task'),
      type: 'list',
      data: {
        style: 'checklist',
        items: [newItem],
      },
    }
    blocks.push(nextBlock)
    checklistBlockIndex = blocks.length - 1
    return { changed: true, anchorBlockId: nextBlock.id }
  }

  const checklistBlock = blocks[checklistBlockIndex]
  checklistBlock.data = {
    ...(checklistBlock.data || {}),
    style: 'checklist',
    items: Array.isArray(checklistBlock.data?.items) ? checklistBlock.data.items : [],
  }
  checklistBlock.data.items.push(newItem)

  return {
    changed: true,
    anchorBlockId: checklistBlock.id || `index-${checklistBlockIndex}`,
  }
}