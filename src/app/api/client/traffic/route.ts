import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getClientFromRequest } from '@/lib/auth'
import { clientTrafficBodySchema } from '@/lib/validation'
import { isDuplicateTrafficRequest } from '@/lib/security-utils'

/**
 * POST /api/client/traffic
 * Body: { configId?, bytesIn, bytesOut, requestId? }
 *
 * Validates inputs (no negative or non-numeric values).
 * Uses requestId for dedup (same requestId within 5min is ignored).
 * Updates user.trafficUsedMB by the MB-equivalent of bytes.
 *
 * NOTE: For more accurate traffic accounting, you can replace this with a
 * call to V2Ray's stats API on the proxy server. The client currently
 * self-reports, which can be abused.
 */
export async function POST(request: NextRequest) {
  const client = await getClientFromRequest(request)
  if (!client) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await db.user.findUnique({ where: { telegramId: client.telegramId } })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'بدنه نامعتبر' }, { status: 400 })

  const parsed = clientTrafficBodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'ورودی نامعتبر' }, { status: 400 })
  }
  const { configId, bytesIn, bytesOut, requestId } = parsed.data

  // Dedup by requestId
  if (requestId && isDuplicateTrafficRequest(user.id, requestId)) {
    return NextResponse.json({ ok: true, dedup: true })
  }

  // Record the traffic event (raw bytes, no manipulation).
  // NOTE: plain numbers (not BigInt()) — works on both PostgreSQL and SQLite
  // providers, and the zod schema already caps at MAX_SAFE_INTEGER.
  await db.trafficEvent.create({
    data: {
      userId: user.id,
      configId: configId ?? null,
      bytesIn,
      bytesOut
    }
  })

  // Convert to MB and add to user's usage (round down to avoid inflating)
  const totalBytes = Number(bytesIn) + Number(bytesOut)
  const mb = Math.floor(totalBytes / (1024 * 1024))
  if (mb > 0) {
    const updatedUser = await db.user.update({
      where: { id: user.id },
      data: { trafficUsedMB: { increment: mb } }
    })

    // Check if limit reached
    if (updatedUser.trafficUsedMB >= updatedUser.trafficLimitMB) {
      return NextResponse.json({
        warning: 'محدودیت ترافیک به پایان رسید',
        upgradeUrl: '/pricing',
        trafficUsedMB: updatedUser.trafficUsedMB,
        trafficLimitMB: updatedUser.trafficLimitMB
      })
    }
  }

  return NextResponse.json({ ok: true })
}

/**
 * GET /api/client/traffic
 * Returns the current user's traffic stats.
 */
export async function GET(request: NextRequest) {
  const client = await getClientFromRequest(request)
  if (!client) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await db.user.findUnique({ where: { telegramId: client.telegramId } })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  return NextResponse.json({
    plan: user.plan,
    trafficLimitMB: user.trafficLimitMB,
    trafficUsedMB: user.trafficUsedMB,
    trafficRemainingMB: Math.max(0, user.trafficLimitMB - user.trafficUsedMB),
    expiresAt: user.expiresAt,
    status: user.status
  })
}
