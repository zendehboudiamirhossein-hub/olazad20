/**
 * Stealth gate — keeps the admin panel invisible to app users & scanners.
 *
 * How it works:
 *  - If PANEL_ACCESS_KEY is set, the admin UI at `/` is locked behind a gate
 *    cookie. Anyone without the cookie sees a neutral 404-style page (no
 *    AzadGram branding, nothing to fingerprint).
 *  - The admin reaches the panel at:  https://<host>/<PANEL_ACCESS_KEY>
 *    which sets an HttpOnly cookie and redirects to `/`.
 *  - If PANEL_ACCESS_KEY is NOT set (e.g. local dev), the gate is disabled
 *    and the panel behaves like a normal app at `/`.
 *
 * The gate is UI-level obfuscation on top of real JWT auth on every
 * /api/admin/* route — defense in depth.
 *
 * NOTE: This module is imported by the edge middleware, so it MUST only use
 * Web Crypto (crypto.subtle) — Node's `crypto` module is unavailable there.
 */

export const GATE_COOKIE = 'azadgate'

export function getAccessKey(): string | null {
  const key = process.env.PANEL_ACCESS_KEY?.trim()
  return key && key.length >= 4 ? key : null
}

export function isGateEnabled(): boolean {
  return getAccessKey() !== null
}

/**
 * Cookie value derived from the key (SHA-256 via Web Crypto) so the cookie
 * itself leaks nothing usable.
 */
export async function gateCookieValue(): Promise<string> {
  const key = getAccessKey() ?? ''
  const data = new TextEncoder().encode(`azadgate:${key}`)
  const digest = await crypto.subtle.digest('SHA-256', data)
  const bytes = new Uint8Array(digest)
  let hex = ''
  for (const b of bytes) hex += b.toString(16).padStart(2, '0')
  return hex.slice(0, 40)
}

/**
 * Constant-time-ish compare of the provided cookie against the expected value.
 */
export async function isValidGateCookie(value: string | undefined): Promise<boolean> {
  if (!value) return false
  const expected = await gateCookieValue()
  if (value.length !== expected.length) return false
  let diff = 0
  for (let i = 0; i < expected.length; i++) diff |= value.charCodeAt(i) ^ expected.charCodeAt(i)
  return diff === 0
}
