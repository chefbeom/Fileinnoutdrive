export const extractWorkspaceMentionEmails = (value = '') => {
  const matches = String(value || '').match(/@([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/gi) || []
  return [...new Set(matches.map((mention) => mention.slice(1).toLowerCase()))]
}