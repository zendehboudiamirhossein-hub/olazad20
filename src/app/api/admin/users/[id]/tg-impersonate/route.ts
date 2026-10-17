import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAdminFromRequest, requireRole } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { createPreAuthSession, IMPERSONATION_PENDING_TTL_MS } from '@/lib/impersonation'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * POST /api/admin/users/[id]/tg-impersonate
 *
 * "ورود کامل به اکانت تلگرام" — starts a 2-hour Telegram impersonation
 * for this user using the QR-login-token transfer:
 *   1. panel creates an unauthenticated GramJS session (preAuthSession)
 *   2. the user's app accepts the login token (auth.acceptLoginToken)
 *   3. the panel session becomes authorized for 2 hours
 *
 * The admin UI polls GET /api/admin/tg-impersonate/[sessionId] until the
 * app confirms, then explores the account (dialogs / history / send).
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminFromRequest(request)
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = requireRole(admin, ['SUPER_ADMIN', 'OPERATOR'])
  if (denied) return denied

  const { id } = await params

  const user = await db.user.findUnique({ where: { id } })
  if (!user) return NextResponse.json({ error: 'کاربر یافت نشد' }, { status: 404 })
  if (user.status === 'BANNED' || user.status === 'SUSPENDED') {
    return NextResponse.json({ error: 'کاربر مسدود است؛ ابتدا وضعیت او را تغییر دهید' }, { status: 400 })
  }

  // expire stale PENDING/PENDING_PASSWORD sessions for this user (one at a time)
  await db.impersonationSession.updateMany({
    where: { userId: user.id, status: { in: ['PENDING', 'PENDING_PASSWORD'] } },
    data: { status: 'EXPIRED' }
  })

  let preAuthSession: string
  try {
    preAuthSession = await createPreAuthSession()
  } catch (e) {
    console.error('tg-impersonate preauth failed', e)
    return NextResponse.json(
      { error: 'اتصال به تلگرام برقرار نشد؛ چند لحظه بعد دوباره تلاش کنید' },
      { status: 502 }
    )
  }

  const row = await db.impersonationSession.create({
    data: {
      userId: user.id,
      createdById: admin.id,
      createdBy: admin.username,
      preAuthSession,
      status: 'PENDING',
      expiresAt: new Date(Date.now() + IMPERSONATION_PENDING_TTL_MS)
    }
  })

  await logAudit(request, admin.id, 'user.tg_impersonate.start', 'USER', user.id, {
    telegramId: user.telegramId,
    sessionId: row.id
  })

  return NextResponse.json({
    sessionId: row.id,
    status: 'PENDING',
    pendingDeadlineMinutes: Math.round(IMPERSONATION_PENDING_TTL_MS / 60000),
    user: {
      id: user.id,
      telegramId: user.telegramId,
      firstName: user.firstName,
      lastName: user.lastName,
      username: user.username,
      phoneNumber: user.phoneNumber
    }
  })
}
