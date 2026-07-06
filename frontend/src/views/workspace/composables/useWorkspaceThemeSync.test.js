import { describe, expect, it, vi } from 'vitest'

import {
  createWorkspaceThemeSync,
  shouldUseWorkspaceDarkTheme,
} from './useWorkspaceThemeSync.js'

const createStorage = (theme) => ({
  getItem: vi.fn(() => theme),
})

const createDocumentElement = () => ({
  classList: {
    toggle: vi.fn(),
  },
})

const createMatchMedia = (matches) => vi.fn(() => ({ matches }))

describe('useWorkspaceThemeSync', () => {
  it('uses saved dark theme before system preference', () => {
    const documentElement = createDocumentElement()
    const syncTheme = createWorkspaceThemeSync({
      storage: createStorage('dark'),
      documentElement,
      matchMedia: createMatchMedia(false),
    })

    syncTheme()

    expect(documentElement.classList.toggle).toHaveBeenCalledWith('dark', true)
  })

  it('uses saved light theme before system preference', () => {
    const documentElement = createDocumentElement()
    const syncTheme = createWorkspaceThemeSync({
      storage: createStorage('light'),
      documentElement,
      matchMedia: createMatchMedia(true),
    })

    syncTheme()

    expect(documentElement.classList.toggle).toHaveBeenCalledWith('dark', false)
  })

  it('falls back to system preference when no saved theme exists', () => {
    expect(shouldUseWorkspaceDarkTheme({ savedTheme: null, prefersDark: true })).toBe(true)
    expect(shouldUseWorkspaceDarkTheme({ savedTheme: null, prefersDark: false })).toBe(false)
  })

  it('treats browser theme APIs as best-effort dependencies', () => {
    const documentElement = createDocumentElement()
    const syncTheme = createWorkspaceThemeSync({
      storage: { getItem: vi.fn(() => { throw new Error('blocked') }) },
      documentElement,
      matchMedia: vi.fn(() => { throw new Error('missing') }),
    })

    expect(() => syncTheme()).not.toThrow()
    expect(documentElement.classList.toggle).toHaveBeenCalledWith('dark', false)
  })
})