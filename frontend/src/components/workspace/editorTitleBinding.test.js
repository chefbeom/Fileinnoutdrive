import { describe, expect, it, vi } from 'vitest'

import {
  bindEditorTitleRef,
  resolveEditorSaveTitle,
  seedInitialTitleIfEmpty,
  updateEditorTitleFromLocal,
} from './editorTitleBinding.js'

const createYText = (initial = '') => {
  const observers = new Set()
  return {
    text: initial,
    get length() {
      return this.text.length
    },
    toString() {
      return this.text
    },
    insert(index, value) {
      this.text = `${this.text.slice(0, index)}${value}${this.text.slice(index)}`
    },
    delete(index, length) {
      this.text = `${this.text.slice(0, index)}${this.text.slice(index + length)}`
    },
    observe(observer) {
      observers.add(observer)
    },
    unobserve(observer) {
      observers.delete(observer)
    },
    emit(event) {
      observers.forEach((observer) => observer(event))
    },
    observerCount() {
      return observers.size
    },
  }
}

describe('editorTitleBinding', () => {
  it('seeds an initial title only when the shared title is empty', () => {
    const yTitle = createYText('')
    const runLocalTransaction = vi.fn((callback) => callback())

    expect(seedInitialTitleIfEmpty({ yTitle, initialTitle: 'Draft', runLocalTransaction })).toBe(true)
    expect(yTitle.toString()).toBe('Draft')
    expect(runLocalTransaction).toHaveBeenCalledTimes(1)

    expect(seedInitialTitleIfEmpty({ yTitle, initialTitle: 'Other', runLocalTransaction })).toBe(false)
    expect(yTitle.toString()).toBe('Draft')
    expect(seedInitialTitleIfEmpty({ yTitle: createYText(''), initialTitle: '' })).toBe(false)
  })

  it('binds title refs, ignores local-origin updates, and replaces prior observers', () => {
    const yTitle = createYText('Remote')
    const titleRef = { value: '' }
    const previousObserver = vi.fn()
    const localEditOrigin = Symbol('local')
    yTitle.observe(previousObserver)

    const observer = bindEditorTitleRef({ yTitle, titleRef, previousObserver, localEditOrigin })

    expect(titleRef.value).toBe('Remote')
    expect(yTitle.observerCount()).toBe(1)

    yTitle.text = 'Local ignored'
    yTitle.emit({ transaction: { origin: localEditOrigin } })
    expect(titleRef.value).toBe('Remote')

    yTitle.text = 'Remote update'
    yTitle.emit({ transaction: { origin: Symbol('remote') } })
    expect(titleRef.value).toBe('Remote update')
    expect(observer).toEqual(expect.any(Function))
  })

  it('updates shared title from local input through local transactions', () => {
    const yTitle = createYText('Old')
    const runLocalTransaction = vi.fn((callback) => callback())

    expect(updateEditorTitleFromLocal({ yTitle, value: 'New', runLocalTransaction })).toBe(true)
    expect(yTitle.toString()).toBe('New')
    expect(runLocalTransaction).toHaveBeenCalledTimes(1)

    expect(updateEditorTitleFromLocal({ yTitle, value: 'New', runLocalTransaction })).toBe(true)
    expect(runLocalTransaction).toHaveBeenCalledTimes(1)

    expect(updateEditorTitleFromLocal({ yTitle, value: 'Ignored', isReadOnly: true, runLocalTransaction })).toBe(false)
    expect(yTitle.toString()).toBe('New')
  })

  it('resolves save titles from shared title, initial title, then fallback', () => {
    expect(resolveEditorSaveTitle({ yTitle: createYText(' Shared '), initialTitle: 'Initial' })).toBe('Shared')
    expect(resolveEditorSaveTitle({ yTitle: createYText('  '), initialTitle: ' Initial ' })).toBe('Initial')
    expect(resolveEditorSaveTitle({ yTitle: createYText(''), initialTitle: '', fallbackTitle: 'Untitled' })).toBe('Untitled')
  })
})