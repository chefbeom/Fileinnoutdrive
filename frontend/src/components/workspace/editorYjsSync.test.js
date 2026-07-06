import { describe, expect, it, vi } from 'vitest'

import { createEditorYjsSyncController } from './editorYjsSync.js'

const createTimerHarness = () => {
  let nextId = 1
  const timers = new Map()
  return {
    setTimeoutImpl(callback) {
      const id = nextId++
      timers.set(id, callback)
      return id
    },
    clearTimeoutImpl(id) {
      timers.delete(id)
    },
    run(id) {
      const callback = timers.get(id)
      timers.delete(id)
      callback?.()
    },
    runAll() {
      for (const id of [...timers.keys()]) {
        this.run(id)
      }
    },
    size() {
      return timers.size
    },
  }
}

describe('editorYjsSync', () => {
  it('schedules local editor snapshots into Yjs contents', async () => {
    const timer = createTimerHarness()
    const yValues = new Map()
    const yMap = {
      get: (key) => yValues.get(key),
      set: (key, value) => yValues.set(key, value),
    }
    const runLocalTransaction = vi.fn((callback) => callback())
    const editor = {
      save: vi.fn(async () => ({ blocks: [{ id: 'a', type: 'paragraph', data: { text: 'A' } }] })),
    }

    const controller = createEditorYjsSyncController({
      getEditor: () => editor,
      yMap,
      runLocalTransaction,
      setTimeoutImpl: timer.setTimeoutImpl.bind(timer),
      clearTimeoutImpl: timer.clearTimeoutImpl.bind(timer),
    })

    controller.scheduleLocalSync()
    expect(yValues.get('contents')).toBeUndefined()

    timer.runAll()
    await Promise.resolve()

    expect(runLocalTransaction).toHaveBeenCalledTimes(1)
    expect(JSON.parse(yValues.get('contents')).blocks[0].id).toBe('a')
  })

  it('suppresses local sync while rendering local task snapshots', async () => {
    const timer = createTimerHarness()
    const yMap = { get: vi.fn(), set: vi.fn() }
    const controller = createEditorYjsSyncController({
      yMap,
      setTimeoutImpl: timer.setTimeoutImpl.bind(timer),
      clearTimeoutImpl: timer.clearTimeoutImpl.bind(timer),
    })

    expect(controller.isLocalSuppressed()).toBe(false)
    await controller.runWithLocalSuppressed(async ({ setRenderedSnapshot }) => {
      expect(controller.isLocalSuppressed()).toBe(true)
      setRenderedSnapshot({ blocks: [{ id: 'local' }] })
      controller.scheduleLocalSync({ blocks: [{ id: 'skip' }] })
    })

    expect(controller.isLocalSuppressed()).toBe(false)
    expect(timer.size()).toBe(0)
    expect(yMap.set).not.toHaveBeenCalled()
  })

  it('renders remote Yjs snapshots and flushes the latest pending snapshot', async () => {
    const timer = createTimerHarness()
    const render = vi.fn(async () => {})
    const editor = {
      isReady: Promise.resolve(),
      render,
    }
    const onRemoteRender = vi.fn()
    const controller = createEditorYjsSyncController({
      getEditor: () => editor,
      onRemoteRender,
      setTimeoutImpl: timer.setTimeoutImpl.bind(timer),
      clearTimeoutImpl: timer.clearTimeoutImpl.bind(timer),
    })

    await controller.renderFromY(JSON.stringify({ blocks: [{ id: 'first' }] }))
    await controller.renderFromY(JSON.stringify({ blocks: [{ id: 'second' }] }))

    expect(render).toHaveBeenCalledTimes(1)
    expect(render).toHaveBeenCalledWith({ blocks: [{ id: 'first' }] })
    expect(onRemoteRender).toHaveBeenCalledWith([{ id: 'first' }], { blocks: [{ id: 'first' }] })

    timer.runAll()
    await Promise.resolve()
    await Promise.resolve()

    expect(render).toHaveBeenCalledTimes(2)
    expect(render).toHaveBeenLastCalledWith({ blocks: [{ id: 'second' }] })
  })

  it('stores pending remote snapshots until an editor instance exists', async () => {
    const render = vi.fn(async () => {})
    let editor = null
    const controller = createEditorYjsSyncController({
      getEditor: () => editor,
    })

    await controller.renderFromY(JSON.stringify({ blocks: [{ id: 'pending' }] }))
    editor = { isReady: Promise.resolve(), render }

    await controller.flushPendingRender()

    expect(render).toHaveBeenCalledWith({ blocks: [{ id: 'pending' }] })
  })
})
