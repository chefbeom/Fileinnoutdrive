const COLLABORATOR_COLORS = Object.freeze([
  '#2563eb',
  '#16a34a',
  '#f97316',
  '#db2777',
  '#7c3aed',
  '#0891b2',
  '#ca8a04',
  '#dc2626',
])

export const safeString = (value) => (typeof value === 'string' ? value.trim() : '')

export const clampNumber = (value, min = 0, max = 100) =>
  Math.min(max, Math.max(min, Number(value) || 0))

export const colorForIdentity = (identity, fallbackIdentity) => {
  const source = String(identity ?? fallbackIdentity ?? '')
  let hash = 0
  for (let i = 0; i < source.length; i += 1) {
    hash = ((hash << 5) - hash + source.charCodeAt(i)) | 0
  }
  return COLLABORATOR_COLORS[Math.abs(hash) % COLLABORATOR_COLORS.length]
}

export const decodeTokenPayload = (tokenValue) => {
  if (!tokenValue) return null
  try {
    const base64Url = tokenValue.split('.')[1]
    if (!base64Url) return null
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')
    const jsonPayload = decodeURIComponent(
      atob(padded).split('').map((c) => `%${(`00${c.charCodeAt(0).toString(16)}`).slice(-2)}`).join('')
    )
    return JSON.parse(jsonPayload)
  } catch (error) {
    console.warn('토큰에서 사용자 정보를 읽어오는데 실패했습니다.', error)
    return null
  }
}

export const readStoredUserInfo = () => {
  try {
    const stored = localStorage.getItem('USERINFO')
    return stored ? JSON.parse(stored) : null
  } catch {
    return null
  }
}
