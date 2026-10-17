import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { hashPassword, verifyPassword, createSession, setSessionCookie, getClientIp } from '@/lib/auth'
import { loginBodySchema } from '@/lib/validation'
import { loginRateLimit, resetLoginRateLimit } from '@/lib/rate-limit'
import { logAudit } from '@/lib/audit'

/**
 * POST /api/admin/login
 * Body: { username, password }
 * Returns: { token, admin: { id, username, role } }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null)
    if (!body) {
      return NextResponse.json({ error: 'بدنه‌ی نامعتبر' }, { status: 400 })
    }

    const parsed = loginBodySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'ورودی نامعتبر' }, { status: 400 })
    }
    const { username, password } = parsed.data

    // === Rate limit: 5 attempts per 15 min per IP and per username ===
    const ip = getClientIp(request)
    const rl = loginRateLimit(ip, username)
    if (rl.limited) {
      return NextResponse.json(
        { error: `تلاش‌های زیادی انجام شده است. ${rl.retryAfterSec} ثانیه دیگر تلاش کنید.` },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } }
      )
    }

    const admin = await db.admin.findUnique({ where: { username } })
    if (!admin) {
      // Don't reveal whether user exists — but still penalize rate limit
      return NextResponse.json({ error: 'نام کاربری یا رمز عبور نادرست است' }, { status: 401 })
    }

    const ok = await verifyPassword(password, admin.passwordHash)
    if (!ok) {
      return NextResponse.json({ error: 'نام کاربری یا رمز عبور نادرست است' }, { status: 401 })
    }

    // Successful login: reset rate limit
    resetLoginRateLimit(ip, username)

    const { token, expiresAt } = await createSession(admin.id, ip)

    await db.admin.update({
      where: { id: admin.id },
      data: { lastLoginAt: new Date() }
    })

    await logAudit(request, admin.id, 'admin.login', 'ADMIN', admin.id, {
      username: admin.username,
      role: admin.role
    })

    const res = NextResponse.json({
      token, // for API clients
      admin: { id: admin.id, username: admin.username, role: admin.role },
      expiresAt: expiresAt.toISOString()
    })
    // Also set the HttpOnly cookie for browser sessions
    setSessionCookie(res, token, expiresAt)
    return res
  } catch (e) {
    console.error('login error', e)
    return NextResponse.json({ error: 'خطای سرور' }, { status: 500 })
  }
}

// GET seed endpoint has been removed for security.
// Use `bun run scripts/create-admin.ts <username> <password> [role]` instead.
