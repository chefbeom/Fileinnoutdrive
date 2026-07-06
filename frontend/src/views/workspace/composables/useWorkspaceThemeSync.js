const THEME_STORAGE_KEY = 'theme'
const DARK_THEME_QUERY = '(prefers-color-scheme: dark)'

const fallbackStorage = () => {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

const fallbackDocumentElement = () => {
  try {
    return globalThis.document?.documentElement ?? null
  } catch {
    return null
  }
}

const fallbackMatchMedia = () => {
  try {
    return globalThis.window?.matchMedia?.bind(globalThis.window) ?? null
  } catch {
    return null
  }
}

const readSavedTheme = (storage) => {
  try {
    return storage?.getItem?.(THEME_STORAGE_KEY) ?? null
  } catch {
    return null
  }
}

const readPrefersDark = (matchMedia) => {
  try {
    return Boolean(matchMedia?.(DARK_THEME_QUERY)?.matches)
  } catch {
    return false
  }
}

export const shouldUseWorkspaceDarkTheme = ({ savedTheme, prefersDark } = {}) =>
  savedTheme === 'dark' || (!savedTheme && Boolean(prefersDark))

export const createWorkspaceThemeSync = ({
  storage = fallbackStorage(),
  documentElement = fallbackDocumentElement(),
  matchMedia = fallbackMatchMedia(),
} = {}) => () => {
  const savedTheme = readSavedTheme(storage)
  const prefersDark = readPrefersDark(matchMedia)
  documentElement?.classList?.toggle?.(
    'dark',
    shouldUseWorkspaceDarkTheme({ savedTheme, prefersDark }),
  )
}

export const useWorkspaceThemeSync = (options = {}) => ({
  syncTheme: createWorkspaceThemeSync(options),
})