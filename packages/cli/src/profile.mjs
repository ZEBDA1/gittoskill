export function normalizeProfileSegment(raw) {
  return raw.trim().replace(/^@+/, '')
}

export function isValidGitHubProfileLogin(raw) {
  return typeof raw === 'string' && /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(raw) && !raw.includes('--')
}

export function parseGitHubProfileInput(raw) {
  if (typeof raw !== 'string' || raw.length > 256) return null
  const input = raw.trim()
  if (!input) return null
  let login = normalizeProfileSegment(input)
  if (input.includes('://') || /^(www\.)?github\.com\//i.test(input)) {
    try {
      const url = new URL(input.includes('://') ? input : `https://${input}`)
      if (!['https:', 'http:'].includes(url.protocol) || url.hostname.replace(/^www\./, '').toLowerCase() !== 'github.com' || url.username || url.password || url.port) return null
      const parts = url.pathname.split('/').filter(Boolean)
      if (parts.length !== 1) return null
      login = normalizeProfileSegment(decodeURIComponent(parts[0]))
    } catch { return null }
  }
  return isValidGitHubProfileLogin(login) ? { login } : null
}

export function skillDirectoryName(login) {
  if (!isValidGitHubProfileLogin(login)) throw new Error('Invalid GitHub login.')
  return `${login.toLowerCase()}-coding-skill`
}
