import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getClientFromRequest, getClientIp } from '@/lib/auth'
import { buildShareUri } from '@/lib/protocols'
import { blockedResponse } from '@/lib/client-block'

/**
 * GET /api/client/configs
 * Returns the list of configs assigned to (or available for) the current user.
 */
export async function GET(request: NextRequest) {
  const client = await getClientFromRequest(request)
  if (!client) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await db.user.findUnique({
    where: { telegramId: client.telegramId },
    include: {
      configs: { include: { config: true } }
    }
  })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  // Reject banned / suspended — app locks with the support-block message
  if (user.status === 'BANNED' || user.status === 'SUSPENDED') {
    return blockedResponse(user.status) as NextResponse
  }

  // Reject expired premium
  if (user.expiresAt && user.expiresAt < new Date() && user.plan !== 'FREE') {
    await db.user.update({
      where: { id: user.id },
      data: { plan: 'FREE', trafficLimitMB: 10240, expiresAt: null }
    })
    user.plan = 'FREE'
  }

  // Check traffic
  if (user.trafficUsedMB >= user.trafficLimitMB) {
    return NextResponse.json({
      error: 'محدودیت ترافیک به پایان رسید',
      upgradeUrl: '/pricing'
    }, { status: 402 })
  }

  const assignedConfigs = user.configs.map(uc => uc.config).filter(c => c.isActive)

  let configs = assignedConfigs
  if (configs.length === 0) {
    // Fall back to all active free configs with capacity
    // Compute current users per config from _count of UserConfig
    const candidates = await db.config.findMany({
      where: { isActive: true, isPremium: false },
      include: { _count: { select: { users: true } } },
      take: 10,
      orderBy: { ping: 'asc' }
    })
    configs = candidates.filter(c => c.maxUsers === -1 || c._count.users < c.maxUsers)
  }

  // Mask secrets in client response too — client gets only the shareUri
  // (which contains all the info it needs) and NOT the raw uuid/password
  const withUri = configs.map(c => ({
    id: c.id,
    name: c.name,
    protocol: c.protocol,
    server: c.server,
    port: c.port,
    country: c.country,
    city: c.city,
    flag: c.flag,
    ping: c.ping,
    loadPercent: c.loadPercent,
    isPremium: c.isPremium,
    shareUri: c.shareUri ?? buildShareUri(c)
  }))

  return NextResponse.json({
    user: {
      id: user.id,
      telegramId: user.telegramId,
      phoneNumber: user.phoneNumber,
      plan: user.plan,
      trafficLimitMB: user.trafficLimitMB,
      trafficUsedMB: user.trafficUsedMB,
      expiresAt: user.expiresAt
    },
    configs: withUri
  })
}
