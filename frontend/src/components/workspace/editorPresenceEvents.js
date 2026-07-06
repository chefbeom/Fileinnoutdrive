import { clampNumber } from './editorIdentity.js'

export const createCursorPresenceFields = ({
  clientX = 0,
  clientY = 0,
  rect,
  activeAt,
} = {}) => {
  const width = Number(rect?.width || 0)
  const height = Number(rect?.height || 0)
  if (!width || !height) return null

  const xPercentage = ((Number(clientX) - Number(rect?.left || 0)) / width) * 100
  const yPercentage = ((Number(clientY) - Number(rect?.top || 0)) / height) * 100
  const isInside =
    xPercentage >= 0 &&
    xPercentage <= 100 &&
    yPercentage >= 0 &&
    yPercentage <= 100

  if (!isInside) {
    return {
      state: 'away',
      fields: createHiddenCursorPresenceFields({
        activeAt,
        reason: 'cursor-outside',
      }),
    }
  }

  return {
    state: 'active',
    fields: {
      mouse: {
        x: clampNumber(xPercentage),
        y: clampNumber(yPercentage),
        visible: true,
        lastActiveAt: activeAt,
      },
      presence: { reason: 'cursor' },
    },
  }
}

export const createHiddenCursorPresenceFields = ({ activeAt, reason } = {}) => ({
  mouse: {
    visible: false,
    lastActiveAt: activeAt,
  },
  ...(reason ? { presence: { reason } } : {}),
})
