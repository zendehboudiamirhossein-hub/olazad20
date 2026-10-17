import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAdminFromRequest, requireRole } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { changePlanBodySchema } from '@/lib/validation'

// Change plan for a user (OPERATOR and SUPER_ADMIN only)
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminFromRequest(request)
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = requireRole(admin, ['OPERATOR', 'SUPER_ADMIN'])
  if (denied) return denied

  const { id } = await params
  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'بدنه نامعتبر' }, { status: 400 })

  const parsed = changePlanBodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'ورودی نامعتبر' }, { status: 400 })
  }
  const { plan, trafficLimitMB, expiresAt, days } = parsed.data

  const data: any = { plan }
  if (typeof trafficLimitMB === 'number') data.trafficLimitMB = trafficLimitMB
  else data.trafficLimitMB = plan === 'PREMIUM' ? 51200 : plan === 'VIP' ? 102400 : 10240
  if (expiresAt) data.expiresAt = new Date(expiresAt)
  else if (typeof days === 'number') {
    const exp = new Date()
    exp.setDate(exp.getDate() + days)
    data.expiresAt = exp
  } else if (plan === 'FREE') {
    data.expiresAt = null
  }

  const exists = await db.user.findUnique({ where: { id } })
  if (!exists) return NextResponse.json({ error: 'کاربر یافت نشد' }, { status: 404 })

  const user = await db.user.update({ where: { id }, data })

  await logAudit(request, admin.id, 'user.plan_change', 'USER', id, {
    previousPlan: exists.plan,
    newPlan: plan,
    trafficLimitMB: data.trafficLimitMB,
    expiresAt: data.expiresAt
  })

  return NextResponse.json({ user })
}
