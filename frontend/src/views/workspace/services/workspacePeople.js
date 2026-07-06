const normalizeRows = (rows) => (Array.isArray(rows) ? rows : [])
const normalizeEmailKey = (email) => String(email || '').trim().toLowerCase()

export const workspaceUserInitial = (name) => String(name || '?').trim().slice(0, 1).toUpperCase() || '?'

export const normalizeWorkspaceMember = (member = {}) => {
  const userIdx = member.userIdx ?? member.idx ?? member.id ?? null
  const name = member.name || member.username || member.email || '이름 없는 멤버'
  return {
    userIdx,
    name,
    email: member.email || '',
    image: member.image || member.profileImage || '',
    role: String(member.role || member.level || 'READ').toUpperCase(),
  }
}

const personDisplayName = (person = {}, fallback = '담당자 없음') =>
  person.name || person.username || person.email || fallback

export const createWorkspaceWorkloadRows = ({
  currentUser = {},
  memberRows = [],
  activeUsers = [],
  pageRows = [],
  indexedTasks = [],
  currentUserEmail = '',
  initialFor = workspaceUserInitial,
} = {}) => {
  const people = new Map()
  const unassignedKey = 'unassigned'
  const currentEmail = normalizeEmailKey(currentUserEmail)
  const ensurePerson = (person = {}) => {
    const email = normalizeEmailKey(person.email)
    const key = email || person.key || unassignedKey
    if (!people.has(key)) {
      people.set(key, {
        key,
        email,
        name: personDisplayName(person),
        image: person.image || person.profileImage || '',
        initial: person.initial || initialFor(personDisplayName(person, '?')),
        role: person.role || '',
        isMe: Boolean(person.isMe || (email && email === currentEmail)),
        isOnline: Boolean(person.isOnline),
        pages: [],
        tasks: [],
      })
    }
    const row = people.get(key)
    row.name = row.name === '담당자 없음' ? personDisplayName(person, row.name) : row.name
    row.image = row.image || person.image || person.profileImage || ''
    row.role = row.role || person.role || ''
    row.isMe = row.isMe || Boolean(person.isMe || (email && email === currentEmail))
    row.isOnline = row.isOnline || Boolean(person.isOnline)
    return row
  }

  ensurePerson({ ...(currentUser || {}), isMe: true, isOnline: true })
  normalizeRows(memberRows).forEach(ensurePerson)
  normalizeRows(activeUsers).forEach(ensurePerson)

  normalizeRows(pageRows).forEach((page) => {
    const row = page.ownerEmail
      ? ensurePerson({ email: page.ownerEmail, name: page.ownerName || page.ownerEmail })
      : ensurePerson({ key: unassignedKey, name: '담당자 없음', initial: '?' })
    row.pages.push(page)
  })

  normalizeRows(indexedTasks).forEach((task) => {
    const row = task.assigneeEmail
      ? ensurePerson({ email: task.assigneeEmail, name: task.assigneeName || task.assigneeEmail })
      : ensurePerson({ key: unassignedKey, name: '담당자 없음', initial: '?' })
    row.tasks.push(task)
  })

  return [...people.values()]
    .map((person) => {
      const openTasks = person.tasks.filter((task) => !task.checked)
      const overdueTasks = person.tasks.filter((task) => task.isOverdue)
      const activePages = person.pages.filter((page) => page.status !== 'done')
      const overduePages = person.pages.filter((page) => page.isOverdue)
      return {
        ...person,
        openTasks,
        overdueTasks,
        activePages,
        overduePages,
        completedTasks: person.tasks.filter((task) => task.checked),
        workloadScore: openTasks.length * 2 + overdueTasks.length * 3 + activePages.length + overduePages.length * 2,
      }
    })
    .filter((person) =>
      person.key !== unassignedKey ||
      person.pages.length > 0 ||
      person.tasks.length > 0,
    )
    .sort((left, right) => {
      if (left.isMe !== right.isMe) return left.isMe ? -1 : 1
      if (right.workloadScore !== left.workloadScore) return right.workloadScore - left.workloadScore
      if (left.key === unassignedKey) return 1
      if (right.key === unassignedKey) return -1
      return left.name.localeCompare(right.name, 'ko')
    })
}

export const createWorkspaceMentionCandidates = ({
  memberRows = [],
  activeUsers = [],
  currentUser = {},
  currentUserIdx = null,
  limit = 8,
  initialFor = workspaceUserInitial,
} = {}) => {
  const candidates = new Map()
  const currentEmail = normalizeEmailKey(currentUser.email)
  const currentIdx = currentUserIdx == null ? '' : String(currentUserIdx)
  const addCandidate = (person = {}) => {
    const email = String(person.email || '').trim()
    if (!email) return
    const emailKey = email.toLowerCase()
    const userIdx = person.userIdx ?? person.idx ?? person.userId ?? null
    if (emailKey === currentEmail || (userIdx != null && String(userIdx) === currentIdx)) return
    if (candidates.has(emailKey)) return
    candidates.set(emailKey, {
      userIdx,
      email,
      name: person.name || person.username || email,
      image: person.image || person.profileImage || '',
      initial: person.initial || initialFor(person.name || email),
      source: person.isOnline ? 'online' : person.clientId ? 'active' : 'member',
    })
  }

  normalizeRows(memberRows).forEach(addCandidate)
  normalizeRows(activeUsers).forEach(addCandidate)
  return [...candidates.values()].slice(0, limit)
}

export const createWorkspaceTaskAssigneeCandidates = ({
  currentUser = {},
  memberRows = [],
  activeUsers = [],
  mentionCandidates = [],
  initialFor = workspaceUserInitial,
} = {}) => {
  const candidates = new Map()
  const addCandidate = (person = {}) => {
    const email = String(person.email || '').trim()
    if (!email) return
    const emailKey = email.toLowerCase()
    if (candidates.has(emailKey)) return
    candidates.set(emailKey, {
      email,
      name: person.name || person.username || email,
      image: person.image || person.profileImage || '',
      initial: person.initial || initialFor(person.name || email),
    })
  }

  addCandidate(currentUser || {})
  normalizeRows(memberRows).forEach(addCandidate)
  normalizeRows(activeUsers).forEach(addCandidate)
  normalizeRows(mentionCandidates).forEach(addCandidate)
  return [...candidates.values()]
}

export const createWorkspacePropertyOwnerCandidates = ({
  taskAssigneeCandidates = [],
  ownerEmail = '',
  ownerName = '',
  initialFor = workspaceUserInitial,
} = {}) => {
  const candidates = [...normalizeRows(taskAssigneeCandidates)]
  if (ownerEmail && !candidates.some((candidate) => candidate.email === ownerEmail)) {
    candidates.unshift({
      email: ownerEmail,
      name: ownerName || ownerEmail,
      image: '',
      initial: initialFor(ownerName || ownerEmail),
    })
  }
  return candidates
}
export const createWorkspaceMemberRows = ({
  members = [],
  currentUserIdx = null,
  activeUserIds = new Set(),
} = {}) => {
  const roleOrder = { ADMIN: 0, WRITE: 1, READ: 2 }
  const activeIds = new Set([...activeUserIds].map((id) => String(id)))
  return normalizeRows(members)
    .map((member) => ({
      ...member,
      isMe: currentUserIdx != null && String(member.userIdx) === String(currentUserIdx),
      isOnline: activeIds.has(String(member.userIdx)),
    }))
    .sort((left, right) => {
      const roleDiff = (roleOrder[left.role] ?? 9) - (roleOrder[right.role] ?? 9)
      if (roleDiff !== 0) return roleDiff
      if (left.isMe !== right.isMe) return left.isMe ? -1 : 1
      return String(left.name || '').localeCompare(String(right.name || ''), 'ko')
    })
}

export const filterWorkspaceUnassignedPages = (pages = []) =>
  normalizeRows(pages).filter((page) => page.status !== 'done' && !page.ownerEmail)

export const filterWorkspaceUnassignedTasks = (tasks = []) =>
  normalizeRows(tasks).filter((task) => !task.assigneeEmail)

export const filterWorkspaceBlockedPages = (pages = []) =>
  normalizeRows(pages).filter((page) => page.status === 'blocked')
