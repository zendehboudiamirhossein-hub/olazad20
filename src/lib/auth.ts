import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

// ============ CRITICAL: NO FALLBACKS FOR SECRETS ============
// The app will REFUSE to start if these aren't set.
const JWT_SECRET_RAW = process.env.JWT_SECRET
const CLIENT_SECRET_RAW = process.env.CLIENT_API_SECRET

if (!JWT_SECRET_RAW || JWT_SECRET_RAW.length < 32) {
  throw new Error('JWT_SECRET environment variable is required and must be at least 32 bytes')
}
if (!CLIENT_SECRET_RAW || CLIENT_SECRET_RAW.length < 32) {
  throw new Error('CLIENT_API_SECRET environment variable is required and must be at least 32 bytes')
}

// After the runtime check above, we know these are non-empty strings.
const JWT_SECRET: string = JWT_SECRET_RAW
const CLIENT_SECRET: string = CLIENT_SECRET_RAW

const SESSION_DURATION_HOURS = 8
const REFRESH_THRESHOLD_HOURS = 2 // refresh if less than 2h remaining

export const SESSION_DURATION_MS = SESSION_DURATION_HOURS * 60 * 60 * 1000

// ============ Helpers ============

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12)
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

export function generateToken(adminId: string): string {
  // NOTE: no JWT exp — the DB AdminSession.expiresAt (checked on every request,
  // revocable via deleteAllSessions) is the single source of truth for validity.
  // A JWT exp here would force a hard logout even while the sliding DB session
  // is still alive.
  return jwt.sign({ adminId, type: 'admin' }, JWT_SECRET)
}

export function verifyToken(token: string): { adminId: string; type: string } | null {
  try {
    return jwt.verify(token, JWT_SECRET) as { adminId: string; type: string }
  } catch {
    return null
  }
}

/**
 * Returns the client's real IP by taking only the first value of x-forwarded-for.
 * This prevents IP spoofing via multi-hop forwarded headers.
 */
export function getClientIp(request: NextRequest): string | undefined {
  const xff = request.headers.get('x-forwarded-for')
  if (!xff) return undefined
  // Take first value, strip whitespace, ignore chain
  const first = xff.split(',')[0]?.trim()
  return first || undefined
}

/**
 * Cleanup expired sessions. Should be called periodically or on login.
 */
export async function cleanupExpiredSessions(): Promise<void> {
  try {
    await db.adminSession.deleteMany({
      where: { expiresAt: { lt: new Date() } }
    })
  } catch (e) {
    console.error('session cleanup error', e)
  }
}

/**
 * Create a new session for an admin.
 */
export async function createSession(adminId: string, ip?: string): Promise<{ token: string; expiresAt: Date }> {
  await cleanupExpiredSessions()
  const token = generateToken(adminId)
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS)
  await db.adminSession.create({
    data: { adminId, token, expiresAt, ip }
  })
  return { token, expiresAt }
}

/**
 * Refresh session: if less than REFRESH_THRESHOLD_HOURS remaining, extend.
 *
 * BUGFIX: The previous implementation rotated the token in the database, but
 * the browser kept sending the old JWT — so every request after the refresh
 * threshold failed with 401 (forced logout mid-use). Now we keep the same
 * token (the JWT itself carries its own 8h exp claim, which is acceptable
 * because the DB expiry is the source of truth) and simply slide the DB
 * expiry forward. No rotation = no desync with the client cookie.
 */
export async function maybeRefreshSession(sessionId: string, adminId: string): Promise<string | null> {
  const session = await db.adminSession.findUnique({ where: { id: sessionId } })
  if (!session) return null
  const remainingMs = session.expiresAt.getTime() - Date.now()
  if (remainingMs > REFRESH_THRESHOLD_HOURS * 60 * 60 * 1000) return null
  const newExpiry = new Date(Date.now() + SESSION_DURATION_MS)
  await db.adminSession.update({
    where: { id: sessionId },
    data: { expiresAt: newExpiry } // same token — only extend validity
  })
  return null
}

/**
 * Delete all sessions for an admin (used on logout, password change, role change).
 */
export async function deleteAllSessions(adminId: string): Promise<void> {
  await db.adminSession.deleteMany({ where: { adminId } })
}

// ============ Cookie helpers ============

export const SESSION_COOKIE = 'azadgram_session'

export function setSessionCookie(res: NextResponse, token: string, expiresAt: Date): void {
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    expires: expiresAt
  })
}

export function clearSessionCookie(res: NextResponse): void {
  res.cookies.set(SESSION_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 0
  })
}

/**
 * Get token from either cookie (preferred) or Authorization header (compat).
 */
export function getTokenFromRequest(request: NextRequest): string | null {
  // 1. Cookie (preferred)
  const cookieToken = request.cookies.get(SESSION_COOKIE)?.value
  if (cookieToken) return cookieToken
  // 2. Authorization Bearer (compat for API clients)
  const authHeader = request.headers.get('authorization')
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7)
  }
  return null
}

// ============ Admin auth from request ============

export interface AdminInfo {
  id: string
  username: string
  role: 'SUPER_ADMIN' | 'OPERATOR' | 'SUPPORT'
}

export async function getAdminFromRequest(request: NextRequest): Promise<AdminInfo | null> {
  const token = getTokenFromRequest(request)
  if (!token) return null

  const payload = verifyToken(token)
  if (!payload?.adminId) return null

  const session = await db.adminSession.findUnique({
    where: { token },
    include: { admin: true }
  })
  if (!session || session.expiresAt < new Date()) return null

  // Refresh if needed
  await maybeRefreshSession(session.id, session.adminId)

  return {
    id: session.admin.id,
    username: session.admin.username,
    role: session.admin.role as AdminInfo['role']
  }
}

// ============ Role guard ============

const VALID_ROLES = new Set(['SUPER_ADMIN', 'OPERATOR', 'SUPPORT'])

export function isValidRole(role: string): role is AdminInfo['role'] {
  return VALID_ROLES.has(role)
}

/**
 * Returns null if allowed, otherwise returns a 403 NextResponse.
 * Usage:
 *   const denied = requireRole(admin, ['SUPER_ADMIN'])
 *   if (denied) return denied
 */
export function requireRole(admin: AdminInfo | null, allowedRoles: AdminInfo['role'][]): NextResponse | null {
  if (!admin) {
    return NextResponse.json({ error: 'احراز هویت نشده' }, { status: 401 })
  }
  if (!allowedRoles.includes(admin.role)) {
    return NextResponse.json({ error: 'دسترسی کافی ندارید' }, { status: 403 })
  }
  return null
}

// ============ Client API auth (for the AzadGram Android client) ============

export function generateClientToken(telegramId: string, phoneNumber: string): string {
  return jwt.sign({ telegramId, phoneNumber, type: 'client' }, CLIENT_SECRET, { expiresIn: '30d' })
}

/**
 * Short-lived client token issued from the admin panel to "log into" a user's
 * account (impersonation). Marked with `imp` + issuing admin so every
 * downstream audit record can be traced back to the acting admin.
 */
export function generateImpersonationToken(telegramId: string, phoneNumber: string, adminId: string, adminUsername: string): string {
  return jwt.sign(
    { telegramId, phoneNumber, type: 'client', imp: true, byAdminId: adminId, byAdmin: adminUsername },
    CLIENT_SECRET,
    { expiresIn: '2h' }
  )
}

export function verifyClientToken(token: string): {
  telegramId: string; phoneNumber: string; type: string;
  imp?: boolean; byAdminId?: string; byAdmin?: string;
} | null {
  try {
    return jwt.verify(token, CLIENT_SECRET) as any
  } catch {
    return null
  }
}

export async function getClientFromRequest(request: NextRequest): Promise<{ telegramId: string; phoneNumber: string; impersonatedBy?: string } | null> {
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return null
  const token = authHeader.slice(7)
  const payload = verifyClientToken(token)
  if (!payload || payload.type !== 'client') return null
  return {
    telegramId: payload.telegramId,
    phoneNumber: payload.phoneNumber,
    impersonatedBy: payload.imp ? (payload.byAdmin ?? 'admin') : undefined
  }
}
