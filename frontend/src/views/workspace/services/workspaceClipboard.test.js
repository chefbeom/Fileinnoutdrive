import { describe, expect, it, vi } from 'vitest'

import {
  writeWorkspaceClipboardText,
  writeWorkspaceClipboardTextFallback,
} from './workspaceClipboard.js'

const fakeDocument = ({ copyResult = true, throwOnCopy = false } = {}) => {
  const textarea = {
    value: '',
    style: {},
    setAttribute: vi.fn(),
    select: vi.fn(),
    setSelectionRange: vi.fn(),
  }
  return {
    textarea,
    body: {
      appendChild: vi.fn(),
      removeChild: vi.fn(),
    },
    createElement: vi.fn(() => textarea),
    execCommand: vi.fn(() => {
      if (throwOnCopy) throw new Error('copy denied')
      return copyResult
    }),
  }
}

describe('workspaceClipboard', () => {
  it('uses navigator clipboard first', async () => {
    const navigatorRef = { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } }

    await expect(writeWorkspaceClipboardText('https://example.test', { navigatorRef })).resolves.toBe(true)

    expect(navigatorRef.clipboard.writeText).toHaveBeenCalledWith('https://example.test')
  })

  it('falls back to textarea copy when navigator clipboard fails', async () => {
    const navigatorRef = { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } }
    const documentRef = fakeDocument()

    await expect(writeWorkspaceClipboardText('fallback text', { navigatorRef, documentRef })).resolves.toBe(true)

    expect(documentRef.createElement).toHaveBeenCalledWith('textarea')
    expect(documentRef.body.appendChild).toHaveBeenCalledWith(documentRef.textarea)
    expect(documentRef.textarea.value).toBe('fallback text')
    expect(documentRef.execCommand).toHaveBeenCalledWith('copy')
    expect(documentRef.body.removeChild).toHaveBeenCalledWith(documentRef.textarea)
  })

  it('reports false for empty values or unavailable fallback copy', async () => {
    await expect(writeWorkspaceClipboardText('', {})).resolves.toBe(false)
    expect(writeWorkspaceClipboardTextFallback('copy me', { documentRef: null })).toBe(false)
    expect(writeWorkspaceClipboardTextFallback('copy me', { documentRef: fakeDocument({ throwOnCopy: true }) })).toBe(false)
  })
})
