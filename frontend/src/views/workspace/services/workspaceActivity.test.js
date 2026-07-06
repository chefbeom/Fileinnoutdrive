import { describe, expect, it } from 'vitest'

import { createWorkspaceActivityItems, truncateWorkspaceActivityText, workspaceActivityTimestamp } from './workspaceActivity.js'

describe('workspaceActivity', () => {
  it('converts valid dates to timestamps and invalid dates to zero', () => {
    expect(workspaceActivityTimestamp('2026-07-02T10:00:00.000Z')).toBe(Date.parse('2026-07-02T10:00:00.000Z'))
    expect(workspaceActivityTimestamp('not-a-date')).toBe(0)
    expect(workspaceActivityTimestamp(null)).toBe(0)
  })

  it('collapses whitespace before truncating activity text', () => {
    expect(truncateWorkspaceActivityText('  hello\n\t world  ', 20)).toBe('hello world')
  })

  it('truncates long activity text with an ellipsis while preserving the requested length', () => {
    const text = truncateWorkspaceActivityText('abcdef', 4)

    expect(text).toBe('abc\u2026')
    expect(text).toHaveLength(4)
  })
})
