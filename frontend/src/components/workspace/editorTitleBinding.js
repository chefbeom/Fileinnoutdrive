export const seedInitialTitleIfEmpty = ({ yTitle, initialTitle, runLocalTransaction } = {}) => {
  const fallbackTitle = String(initialTitle ?? '')
  if (!yTitle || !fallbackTitle || yTitle.toString() !== '') return false

  const writeTitle = () => {
    yTitle.insert(0, fallbackTitle)
  }

  if (typeof runLocalTransaction === 'function') {
    runLocalTransaction(writeTitle)
  } else {
    writeTitle()
  }
  return true
}

export const bindEditorTitleRef = ({
  yTitle,
  titleRef,
  previousObserver = null,
  localEditOrigin,
} = {}) => {
  if (!yTitle || !titleRef) return previousObserver

  const current = yTitle.toString()
  if (current && titleRef.value !== current) {
    titleRef.value = current
  }

  const observer = (event) => {
    if (event?.transaction?.origin === localEditOrigin) return
    const nextTitle = yTitle.toString()
    if (titleRef.value !== nextTitle) {
      titleRef.value = nextTitle
    }
  }

  if (previousObserver && typeof yTitle.unobserve === 'function') {
    yTitle.unobserve(previousObserver)
  }
  yTitle.observe(observer)
  return observer
}

export const updateEditorTitleFromLocal = ({
  yTitle,
  value,
  isReadOnly = false,
  runLocalTransaction,
} = {}) => {
  if (isReadOnly || !yTitle) return false

  const nextTitle = String(value ?? '')
  const current = yTitle.toString()
  if (current === nextTitle) return true

  const writeTitle = () => {
    yTitle.delete(0, yTitle.length)
    if (nextTitle) {
      yTitle.insert(0, nextTitle)
    }
  }

  if (typeof runLocalTransaction === 'function') {
    runLocalTransaction(writeTitle)
  } else {
    writeTitle()
  }
  return true
}

export const resolveEditorSaveTitle = ({ yTitle, initialTitle, fallbackTitle = '제목 없음' } = {}) => {
  const syncedTitle = String(yTitle?.toString?.() ?? '').trim()
  const initial = String(initialTitle ?? '').trim()
  return syncedTitle || initial || fallbackTitle
}