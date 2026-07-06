import { describe, expect, it } from 'vitest'

import { extractWorkspaceMentionEmails } from './workspaceMentions.js'

describe('workspaceMentions', () => {
  it('extracts unique lower-case email mentions in first-seen order', () => {
    expect(
      extractWorkspaceMentionEmails(
        'Ping @User.One+tag@Example.COM and @user.one+tag@example.com again.',
      ),
    ).toEqual(['user.one+tag@example.com'])
  })

  it('ignores non-email handles and keeps valid email mentions with dotted domains', () => {
    expect(
      extractWorkspaceMentionEmails('@kim hello @valid.user@example.co.kr, @bad @missing.local'),
    ).toEqual(['valid.user@example.co.kr'])
  })

  it('returns an empty array for blank or nullish input', () => {
    expect(extractWorkspaceMentionEmails()).toEqual([])
    expect(extractWorkspaceMentionEmails(null)).toEqual([])
    expect(extractWorkspaceMentionEmails('')).toEqual([])
  })
})