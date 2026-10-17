import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAdminFromRequest } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const admin = await getAdminFromRequest(request)
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const now = new Date()
  const dayAgo = new Date(now.getTime() - 86400000)
  const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000)
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 86400000)

  const [
    totalUsers,
    activeUsers,
    premiumUsers,
    bannedUsers,
    suspendedUsers,
    verifiedUsers,
    totalConfigs,
    activeConfigs,
    premiumConfigs,
    connectionsToday,
    usersToday,
    newUsersToday,
    onlineNow,
    trafficAgg,
    todayAgg
  ] = await Promise.all([
    db.user.count(),
    db.user.count({ where: { status: 'ACTIVE' } }),
    db.user.count({ where: { plan: { in: ['PREMIUM', 'VIP'] } } }),
    db.user.count({ where: { status: 'BANNED' } }),
    db.user.count({ where: { status: 'SUSPENDED' } }),
    db.user.count({ where: { phoneVerified: true } }),
    db.config.count(),
    db.config.count({ where: { isActive: true } }),
    db.config.count({ where: { isPremium: true } }),
    db.connectionLog.count({ where: { connectedAt: { gte: dayAgo } } }),
    db.user.count({ where: { lastSeenAt: { gte: dayAgo } } }),
    db.user.count({ where: { createdAt: { gte: dayAgo } } }),
    db.user.count({ where: { lastSeenAt: { gte: fiveMinAgo } } }),
    db.user.aggregate({ _sum: { trafficUsedMB: true } }),
    db.user.aggregate({
      _sum: { trafficUsedMB: true },
      where: { lastSeenAt: { gte: dayAgo } }
    })
  ])

  const totalTrafficMB = trafficAgg._sum.trafficUsedMB ?? 0

  // Users grouped by plan (single query)
  const byPlan = await db.user.groupBy({ by: ['plan'], _count: { plan: true } })
  const planCounts: Record<string, number> = {}
  for (const r of byPlan) planCounts[r.plan] = r._count.plan

  // Users grouped by country (top 8)
  const byCountry = await db.user.groupBy({
    by: ['country'],
    _count: { country: true },
    orderBy: { _count: { country: 'desc' } },
    take: 8
  })

  // ===== 14-day series (users + connections), bucketed in memory =====
  const [recentUsers, recentConns] = await Promise.all([
    db.user.findMany({
      where: { createdAt: { gte: fourteenDaysAgo } },
      select: { createdAt: true }
    }),
    db.connectionLog.findMany({
      where: { connectedAt: { gte: fourteenDaysAgo } },
      select: { connectedAt: true }
    })
  ])

  const daily: { date: string; label: string; users: number; connections: number }[] = []
  for (let i = 13; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const ds = d.toISOString().slice(0, 10)
    daily.push({
      date: ds,
      label: d.toLocaleDateString('fa-IR', { month: 'short', day: 'numeric' }),
      users: recentUsers.filter(u => u.createdAt.toISOString().slice(0, 10) === ds).length,
      connections: recentConns.filter(c => c.connectedAt.toISOString().slice(0, 10) === ds).length
    })
  }

  // ===== Daily traffic (MB) for last 14 days from TrafficEvent =====
  const trafficEvents = await db.trafficEvent.findMany({
    where: { recordedAt: { gte: fourteenDaysAgo } },
    select: { bytesIn: true, bytesOut: true, recordedAt: true }
  })
  const dailyTraffic: { date: string; label: string; mb: number }[] = []
  for (let i = 13; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const ds = d.toISOString().slice(0, 10)
    const mb = trafficEvents
      .filter(t => t.recordedAt.toISOString().slice(0, 10) === ds)
      .reduce((sum, t) => sum + Number(t.bytesIn) + Number(t.bytesOut), 0) / (1024 * 1024)
    dailyTraffic.push({
      date: ds,
      label: d.toLocaleDateString('fa-IR', { month: 'short', day: 'numeric' }),
      mb: Math.round(mb * 10) / 10
    })
  }

  // ===== Top configs by assigned users =====
  const topConfigs = await db.config.findMany({
    where: { isActive: true },
    select: {
      id: true, name: true, protocol: true, country: true, flag: true, ping: true,
      _count: { select: { users: true } }
    },
    orderBy: { users: { _count: 'desc' } },
    take: 6
  })

  // ===== Connection status breakdown (7 days) =====
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000)
  const statusRows = await db.connectionLog.groupBy({
    by: ['status'],
    _count: { status: true },
    where: { connectedAt: { gte: sevenDaysAgo } }
  })
  const statusCounts: Record<string, number> = {}
  for (const r of statusRows) statusCounts[r.status] = r._count.status

  return NextResponse.json({
    totals: {
      totalUsers,
      activeUsers,
      premiumUsers,
      bannedUsers,
      suspendedUsers,
      verifiedUsers,
      totalConfigs,
      activeConfigs,
      premiumConfigs,
      usersToday,
      newUsersToday,
      connectionsToday,
      onlineNow,
      totalTrafficMB
    },
    planCounts,
    statusCounts,
    byCountry,
    daily,
    dailyTraffic,
    topConfigs: topConfigs.map(c => ({
      id: c.id,
      name: c.name,
      protocol: c.protocol,
      country: c.country,
      flag: c.flag,
      ping: c.ping,
      users: c._count?.users ?? 0
    }))
  })
}
