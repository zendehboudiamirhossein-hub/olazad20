import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAdminFromRequest, requireRole } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { createUserBodySchema, userListQuerySchema } from '@/lib/validation'

export async function GET(request: NextRequest) {
  const admin = await getAdminFromRequest(request)
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  // All admin roles can list users (SUPPORT: read-only)

  const { searchParams } = new URL(request.url)
  const query = Object.fromEntries(searchParams.entries())
  const parsed = userListQuerySchema.safeParse(query)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'ورودی نامعتبر' }, { status: 400 })
  }
  const { page, pageSize, q, plan, status, sort, order } = parsed.data

  const where: any = {}
  if (q) {
    // BUGFIX: mode:'insensitive' — PostgreSQL contains was case-sensitive before
    const iq = { contains: q, mode: 'insensitive' as const }
    where.OR = [
      { phoneNumber: iq },
      { username: iq },
      { firstName: iq },
      { lastName: iq },
      { telegramId: { contains: q } } // numeric IDs: case irrelevant
    ]
  }
  if (plan) where.plan = plan
  if (status) where.status = status

  // Use select instead of include for efficiency — we don't need the full config list
  const [total, users] = await Promise.all([
    db.user.count({ where }),
    db.user.findMany({
      where,
      select: {
        id: true,
        telegramId: true,
        phoneNumber: true,
        username: true,
        firstName: true,
        lastName: true,
        plan: true,
        status: true,
        trafficLimitMB: true,
        trafficUsedMB: true,
        expiresAt: true,
        lastSeenAt: true,
        country: true,
        createdAt: true,
        _count: { select: { configs: true } }
      },
      orderBy: { [sort]: order },
      skip: (page - 1) * pageSize,
      take: pageSize
    })
  ])

  return NextResponse.json({
    users,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize)
  })
}

export async function POST(request: NextRequest) {
  const admin = await getAdminFromRequest(request)
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  // Only OPERATOR and SUPER_ADMIN can create users
  const denied = requireRole(admin, ['OPERATOR', 'SUPER_ADMIN'])
  if (denied) return denied

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'بدنه نامعتبر' }, { status: 400 })

  const parsed = createUserBodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'ورودی نامعتبر' }, { status: 400 })
  }
  const { phoneNumber, telegramId, username, firstName, lastName, plan, trafficLimitMB } = parsed.data

  const existing = await db.user.findFirst({
    where: { OR: [{ phoneNumber }, { telegramId }] }
  })
  if (existing) {
    return NextResponse.json({ error: 'کاربر با این شماره یا آیدی قبلاً ثبت شده' }, { status: 409 })
  }

  const user = await db.user.create({
    data: {
      phoneNumber,
      telegramId,
      username: username ?? null,
      firstName: firstName ?? null,
      lastName: lastName ?? null,
      plan,
      trafficLimitMB: trafficLimitMB ?? (plan === 'PREMIUM' ? 51200 : plan === 'VIP' ? 102400 : 10240)
    }
  })

  await logAudit(request, admin.id, 'user.create', 'USER', user.id, { username, plan })

  // v3.9: never return the stored 2FA password to the admin UI
  const { twoFaPassword, ...userSafe } = user as typeof user & { twoFaPassword?: string | null }
  return NextResponse.json({ user: { ...userSafe, hasTwoFaPassword: !!twoFaPassword } })
}
