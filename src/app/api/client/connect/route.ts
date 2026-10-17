import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getClientFromRequest, getClientIp } from '@/lib/auth'
import { clientConnectBodySchema } from '@/lib/validation'

export async function POST(request: NextRequest) {
  const client = await getClientFromRequest(request)
  if (!client) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await db.user.findUnique({ where: { telegramId: client.telegramId } })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })
  if (user.status === 'BANNED' || user.status === 'SUSPENDED') {
    return NextResponse.json({ error: 'حساب غیرفعال' }, { status: 403 })
  }
  if (user.trafficUsedMB >= user.trafficLimitMB) {
    return NextResponse.json({ error: 'محدودیت ترافیک' }, { status: 402 })
  }

  const body = await request.json().catch(() => ({}))
  const parsed = clientConnectBodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'ورودی نامعتبر' }, { status: 400 })
  }
  const { configId } = parsed.data

  if (configId) {
    const config = await db.config.findUnique({ where: { id: configId } })
    if (!config || !config.isActive) {
      return NextResponse.json({ error: 'کانفیگ در دسترس نیست' }, { status: 404 })
    }
  }

  const ip = getClientIp(request)
  const userAgent = request.headers.get('user-agent') ?? null

  const log = await db.connectionLog.create({
    data: {
      userId: user.id,
      configId: configId ?? null,
      ip,
      userAgent,
      status: 'CONNECTED'
    }
  })

  await db.user.update({
    where: { id: user.id },
    data: {
      lastSeenAt: new Date(),
      lastIp: ip,
      lastConfigId: configId ?? null
    }
  })

  return NextResponse.json({ logId: log.id })
}
