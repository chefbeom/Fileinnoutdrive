const globalObject = globalThis

export const writeWorkspaceClipboardTextFallback = (text, { documentRef = globalObject.document } = {}) => {
  if (!documentRef?.createElement || !documentRef?.body?.appendChild) return false

  const textarea = documentRef.createElement('textarea')
  textarea.value = String(text || '')
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.top = '-1000px'
  textarea.style.left = '-1000px'
  documentRef.body.appendChild(textarea)
  textarea.select()
  textarea.setSelectionRange(0, textarea.value.length)

  try {
    return Boolean(documentRef.execCommand?.('copy'))
  } catch {
    return false
  } finally {
    documentRef.body.removeChild(textarea)
  }
}

export const writeWorkspaceClipboardText = async (text, {
  navigatorRef = globalObject.navigator,
  documentRef = globalObject.document,
} = {}) => {
  const value = String(text || '')
  if (!value) return false

  try {
    if (navigatorRef?.clipboard?.writeText) {
      await navigatorRef.clipboard.writeText(value)
      return true
    }
  } catch {
    // Fall through to the selection-based fallback.
  }

  return writeWorkspaceClipboardTextFallback(value, { documentRef })
}
