import { describe, expect, it, vi } from 'vitest'
import { computed, nextTick } from 'vue'

import { useWorkspaceCommandPalette } from './useWorkspaceCommandPalette.js'

const createSubject = (items = []) => {
  const handlers = {
    onDocument: vi.fn(async () => {}),
    onTemplate: vi.fn(async () => {}),
    onBlock: vi.fn(async () => {}),
    onPanel: vi.fn(async () => {}),
    actionNew: vi.fn(async () => {}),
  }
  const subject = useWorkspaceCommandPalette({
    workspaceCommandBaseItems: computed(() => items),
    onDocument: handlers.onDocument,
    onTemplate: handlers.onTemplate,
    onBlock: handlers.onBlock,
    onPanel: handlers.onPanel,
    actionHandlers: {
      new: handlers.actionNew,
    },
    nextTickFn: vi.fn(async () => {}),
  })
  return { subject, handlers }
}

describe('useWorkspaceCommandPalette', () => {
  it('opens, focuses, and closes the palette', async () => {
    const { subject } = createSubject()
    const input = { focus: vi.fn() }
    subject.workspaceCommandInput.value = input

    await subject.openWorkspaceCommandPalette()

    expect(subject.isWorkspaceCommandPaletteOpen.value).toBe(true)
    expect(subject.workspaceCommandQuery.value).toBe('')
    expect(subject.workspaceCommandActiveIndex.value).toBe(0)
    expect(input.focus).toHaveBeenCalledTimes(1)

    subject.workspaceCommandQuery.value = 'abc'
    subject.workspaceCommandActiveIndex.value = 2
    subject.closeWorkspaceCommandPalette()

    expect(subject.isWorkspaceCommandPaletteOpen.value).toBe(false)
    expect(subject.workspaceCommandQuery.value).toBe('')
    expect(subject.workspaceCommandActiveIndex.value).toBe(0)
  })

  it('filters items and resets selection when the query changes', async () => {
    const { subject } = createSubject([
      { id: 'a', title: 'Alpha', detail: '', keywords: '' },
      { id: 'b', title: 'Beta', detail: '', keywords: '' },
    ])
    subject.workspaceCommandActiveIndex.value = 1

    subject.workspaceCommandQuery.value = 'alp'
    await nextTick()

    expect(subject.workspaceCommandItems.value.map((item) => item.id)).toEqual(['a'])
    expect(subject.workspaceCommandActiveIndex.value).toBe(0)
    expect(subject.workspaceCommandActiveItem.value.id).toBe('a')
  })

  it('moves and clamps the active selection', async () => {
    const { subject } = createSubject([
      { id: 'a', title: 'Alpha', detail: '', keywords: '' },
      { id: 'b', title: 'Beta', detail: '', keywords: '' },
    ])

    subject.moveWorkspaceCommandSelection(1)
    expect(subject.workspaceCommandActiveIndex.value).toBe(1)

    subject.moveWorkspaceCommandSelection(1)
    expect(subject.workspaceCommandActiveIndex.value).toBe(0)

    subject.workspaceCommandActiveIndex.value = 5
    subject.workspaceCommandQuery.value = 'alpha'
    await nextTick()

    expect(subject.workspaceCommandActiveIndex.value).toBe(0)
  })

  it('dispatches command items by type and action', async () => {
    const document = { id: 1 }
    const template = { id: 'tpl' }
    const block = { id: 'todo' }
    const { subject, handlers } = createSubject()

    await subject.executeWorkspaceCommand({ type: 'document', document })
    await subject.executeWorkspaceCommand({ type: 'template', template })
    await subject.executeWorkspaceCommand({ type: 'block', block })
    await subject.executeWorkspaceCommand({ type: 'panel', panelId: 'tasks' })
    await subject.executeWorkspaceCommand({ action: 'new' })

    expect(handlers.onDocument).toHaveBeenCalledWith(document, expect.objectContaining({ type: 'document' }))
    expect(handlers.onTemplate).toHaveBeenCalledWith(template, expect.objectContaining({ type: 'template' }))
    expect(handlers.onBlock).toHaveBeenCalledWith(block, expect.objectContaining({ type: 'block' }))
    expect(handlers.onPanel).toHaveBeenCalledWith('tasks', expect.objectContaining({ type: 'panel' }))
    expect(handlers.actionNew).toHaveBeenCalledWith(expect.objectContaining({ action: 'new' }))
  })

  it('handles ctrl+k and escape global shortcuts', async () => {
    const { subject } = createSubject()
    const openEvent = { key: 'k', ctrlKey: true, preventDefault: vi.fn() }

    subject.handleWorkspaceGlobalKeydown(openEvent)
    await nextTick()

    expect(openEvent.preventDefault).toHaveBeenCalledTimes(1)
    expect(subject.isWorkspaceCommandPaletteOpen.value).toBe(true)

    const closeEvent = { key: 'Escape', preventDefault: vi.fn() }
    subject.handleWorkspaceGlobalKeydown(closeEvent)

    expect(closeEvent.preventDefault).toHaveBeenCalledTimes(1)
    expect(subject.isWorkspaceCommandPaletteOpen.value).toBe(false)
  })
})
