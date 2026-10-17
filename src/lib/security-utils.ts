/**
 * Mask sensitive fields (uuid, password) for display in lists.
 * Full value only visible in detail views (which require SUPER_ADMIN/OPERATOR).
 */
export function maskConfigSecrets(config: any) {
  return {
    ...config,
    uuid: config.uuid ? maskValue(config.uuid) : null,
    password: config.password ? maskValue(config.password) : null,
    pluginOpts: config.pluginOpts ? maskValue(config.pluginOpts) : null
  }
}

function maskValue(value: string): string {
  if (!value) return value
  if (value.length <= 8) return '••••••••'
  return value.slice(0, 4) + '••••' + value.slice(-4)
}

/**
 * Returns a 6-digit verification code as string.
 */
import crypto from 'crypto'
export function generateVerificationCode(): string {
  return crypto.randomInt(100000, 999999).toString()
}

/**
 * Returns true if the URL is on the allowed domains list.
 * Allowed domains are stored in Settings.ALLOWED_RELEASE_DOMAINS as CSV.
 */
export function isUrlAllowed(url: string, allowedDomainsCsv: string | undefined): boolean {
  if (!allowedDomainsCsv) return false
  try {
    const u = new URL(url)
    const allowed = allowedDomainsCsv
      .split(',')
      .map(d => d.trim().toLowerCase())
      .filter(Boolean)
    return allowed.some(d => {
      const cleaned = d.replace(/^\*\./, '')
      return u.hostname === cleaned || u.hostname.endsWith('.' + cleaned)
    })
  } catch {
    return false
  }
}

/**
 * Idempotency helper for traffic reporting.
 * Tracks recent request IDs per user to dedupe.
 */
const recentRequestIds = new Map<string, number>()

export function isDuplicateTrafficRequest(userId: string, requestId?: string): boolean {
  if (!requestId) return false
  const key = `${userId}:${requestId}`
  const now = Date.now()
  // Clean old entries (>5min)
  for (const [k, t] of recentRequestIds.entries()) {
    if (now - t > 5 * 60 * 1000) recentRequestIds.delete(k)
  }
  if (recentRequestIds.has(key)) return true
  recentRequestIds.set(key, now)
  return false
}
