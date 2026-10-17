import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAdminFromRequest, requireRole } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { updateUserBodySchema } from '@/lib/validation'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminFromRequest(request)
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const user = await db.user.findUnique({
    where: { id },
    select: {
      id: true,
      telegramId: true,
      phoneNumber: true,
      username: true,
      firstName: true,
      lastName: true,
      avatarUrl: true,
      plan: true,
      status: true,
      trafficLimitMB: true,
      trafficUsedMB: true,
      expiresAt: true,
      lastSeenAt: true,
      lastIp: true,
      lastConfigId: true,
      country: true,
      city: true,
      phoneVerified: true,
      // v3.9: presence of the stored 2FA password (the raw value is stripped
      // from the response below — admins never see the password itself)
      twoFaPassword: true,
      createdAt: true,
      updatedAt: true,
      configs: {
        include: { config: true }  // detail view — show full config
      },
      connections: {
        orderBy: { connectedAt: 'desc' },
        take: 50,
        include: { config: true }
      }
    }
  })
  if (!user) return NextResponse.json({ error: 'کاربر یافت نشد' }, { status: 404 })
  const { twoFaPassword, ...userSafe } = user as typeof user & { twoFaPassword?: string | null }
  return NextResponse.json({ user: { ...userSafe, hasTwoFaPassword: !!twoFaPassword } })
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminFromRequest(request)
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = requireRole(admin, ['OPERATOR', 'SUPER_ADMIN'])
  if (denied) return denied

  const { id } = await params
  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'بدنه نامعتبر' }, { status: 400 })

  const parsed = updateUserBodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'ورودی نامعتبر' }, { status: 400 })
  }
  const updates = parsed.data

  // Convert expiresAt string to Date
  if (typeof updates.expiresAt === 'string') {
    updates.expiresAt = new Date(updates.expiresAt) as any
  } else if (updates.expiresAt === null) {
    updates.expiresAt = null as any
  }

  const exists = await db.user.findUnique({ where: { id } })
  if (!exists) return NextResponse.json({ error: 'کاربر یافت نشد' }, { status: 404 })

  const user = await db.user.update({ where: { id }, data: updates as any })

  await logAudit(request, admin.id, 'user.update', 'USER', user.id, updates)

  // v3.9: never return the stored 2FA password to the admin UI
  const { twoFaPassword, ...userSafe } = user as typeof user & { twoFaPassword?: string | null }
  return NextResponse.json({ user: { ...userSafe, hasTwoFaPassword: !!twoFaPassword } })
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminFromRequest(request)
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = requireRole(admin, ['SUPER_ADMIN'])
  if (denied) return denied

  const { id } = await params
  const exists = await db.user.findUnique({ where: { id } })
  if (!exists) return NextResponse.json({ error: 'کاربر یافت نشد' }, { status: 404 })

  await db.user.delete({ where: { id } })

  await logAudit(request, admin.id, 'user.delete', 'USER', id, { username: exists.username })

  return NextResponse.json({ ok: true })
}
