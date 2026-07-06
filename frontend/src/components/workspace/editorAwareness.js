import { clampNumber, colorForIdentity, safeString } from './editorIdentity.js'

export const createLocalAwarenessState = ({
  previous = {},
  localUserState = {},
  fields = {},
  activeAt,
} = {}) => {
  const nextUser = {
    ...(previous.user || {}),
    ...localUserState,
    ...(fields.user || {}),
  }
  const nextPresence = {
    ...(previous.presence || {}),
    status: 'active',
    lastActiveAt: activeAt,
    ...(fields.presence || {}),
  }

  return {
    ...previous,
    ...fields,
    user: nextUser,
    presence: nextPresence,
  }
}

export const createAwarenessUserView = ({ state, clientId, localClientId, fallbackIdentity } = {}) => {
  if (!state?.user) return null

  const name = safeString(state.user.name) || `사용자 ${String(clientId).slice(-4)}`
  const email = safeString(state.user.email)
  return {
    clientId: String(clientId),
    name,
    color: state.user.color || colorForIdentity(state.user.userIdx ?? state.user.email ?? clientId, fallbackIdentity),
    isMe: clientId === localClientId,
    role: String(state.user.role ?? 'READ').toUpperCase(),
    userIdx: state.user.userIdx ?? null,
    email,
    initial: (safeString(state.user.name) || email || '?').slice(0, 1).toUpperCase(),
    status: state.presence?.status || 'active',
    lastActiveAt: state.presence?.lastActiveAt || null,
  }
}

export const createRemoteCursorView = ({ state, clientId, localClientId, fallbackIdentity } = {}) => {
  if (!state?.user || clientId === localClientId) return null

  const mouse = state.mouse || {}
  if (mouse.visible === false || mouse.x == null || mouse.y == null) return null

  return {
    name: safeString(state.user.name) || `사용자 ${String(clientId).slice(-4)}`,
    color: state.user.color || colorForIdentity(state.user.userIdx ?? state.user.email ?? clientId, fallbackIdentity),
    style: {
      position: 'absolute',
      left: `${clampNumber(mouse.x)}%`,
      top: `${clampNumber(mouse.y)}%`,
      willChange: 'left, top',
      transition: 'none',
    },
  }
}

export const sortAwarenessUsers = (users = []) => [...users].sort((left, right) => {
  if (left.isMe !== right.isMe) return left.isMe ? -1 : 1
  return left.name.localeCompare(right.name, 'ko')
})

export const createAwarenessViewModel = (states, {
  localClientId,
  fallbackIdentity = localClientId,
} = {}) => {
  const remoteCursors = {}
  const activeUsers = []

  if (!states || typeof states.forEach !== 'function') {
    return { remoteCursors, activeUsers }
  }

  states.forEach((state, clientId) => {
    const user = createAwarenessUserView({ state, clientId, localClientId, fallbackIdentity })
    if (!user) return

    activeUsers.push(user)
    const cursor = createRemoteCursorView({ state, clientId, localClientId, fallbackIdentity })
    if (cursor) {
      remoteCursors[clientId] = cursor
    }
  })

  return {
    remoteCursors,
    activeUsers: sortAwarenessUsers(activeUsers),
  }
}