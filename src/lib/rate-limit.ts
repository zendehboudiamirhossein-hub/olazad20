/**
 * In-memory rate limiter.
 * For production with multiple instances, replace with Redis-based rate limiter.
 *
 * Usage:
 *   const limited = await checkRateLimit(`login:${ip}:${username}`, 5, 15 * 60 * 1000)
 *   if (limited) return NextResponse.json({ error: 'too many attempts' }, { status: 429 })
 */

interface RateLimitEntry {
  count: number
  firstAttemptAt: number
  lastAttemptAt: number
}

const store = new Map<string, RateLimitEntry>()

// Cleanup old entries every 5 minutes
let lastCleanup = Date.now()
function maybeCleanup() {
  const now = Date.now()
  if (now - lastCleanup < 5 * 60 * 1000) return
  lastCleanup = now
  // Drop entries older than 1 hour
  for (const [k, v] of store.entries()) {
    if (now - v.firstAttemptAt > 60 * 60 * 1000) store.delete(k)
  }
}

export interface RateLimitResult {
  limited: boolean
  remaining: number
  retryAfterSec: number
}

export function checkRateLimit(key: string, maxAttempts: number, windowMs: number): RateLimitResult {
  maybeCleanup()
  const now = Date.now()
  const entry = store.get(key)

  if (!entry || now - entry.firstAttemptAt > windowMs) {
    // Fresh window
    store.set(key, { count: 1, firstAttemptAt: now, lastAttemptAt: now })
    return { limited: false, remaining: maxAttempts - 1, retryAfterSec: 0 }
  }

  entry.count++
  entry.lastAttemptAt = now

  if (entry.count > maxAttempts) {
    const retryAfterSec = Math.ceil((windowMs - (now - entry.firstAttemptAt)) / 1000)
    return { limited: true, remaining: 0, retryAfterSec: Math.max(1, retryAfterSec) }
  }

  return {
    limited: false,
    remaining: Math.max(0, maxAttempts - entry.count),
    retryAfterSec: 0
  }
}

/**
 * Reset rate limit for a key (e.g., after successful login).
 */
export function resetRateLimit(key: string): void {
  store.delete(key)
}

/**
 * Helper for login rate limiting: combines IP and username.
 * Returns 429-style error response or null.
 */
export function loginRateLimit(ip: string | undefined, username: string): { limited: boolean; retryAfterSec: number; remaining: number } {
  const maxAttempts = 5
  const windowMs = 15 * 60 * 1000 // 15 minutes
  const ipKey = `login:ip:${ip ?? 'unknown'}`
  const userKey = `login:user:${username.toLowerCase()}`

  const ipResult = checkRateLimit(ipKey, maxAttempts, windowMs)
  if (ipResult.limited) {
    return { limited: true, retryAfterSec: ipResult.retryAfterSec, remaining: 0 }
  }
  const userResult = checkRateLimit(userKey, maxAttempts, windowMs)
  if (userResult.limited) {
    return { limited: true, retryAfterSec: userResult.retryAfterSec, remaining: 0 }
  }
  return {
    limited: false,
    retryAfterSec: 0,
    remaining: Math.min(ipResult.remaining, userResult.remaining)
  }
}

export function resetLoginRateLimit(ip: string | undefined, username: string): void {
  resetRateLimit(`login:ip:${ip ?? 'unknown'}`)
  resetRateLimit(`login:user:${username.toLowerCase()}`)
}
