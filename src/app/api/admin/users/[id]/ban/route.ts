import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAdminFromRequest, requireRole } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { banBodySchema } from '@/lib/validation'

// Ban or suspend a user (SUPPORT can also do this)
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminFromRequest(request)
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  // SUPPORT, OPERATOR, SUPER_ADMIN can ban/suspend
  const denied = requireRole(admin, ['SUPPORT', 'OPERATOR', 'SUPER_ADMIN'])
  if (denied) return denied

  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const parsed = banBodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'ورودی نامعتبر' }, { status: 400 })
  }
  const status = parsed.data.status

  const exists = await db.user.findUnique({ where: { id } })
  if (!exists) return NextResponse.json({ error: 'کاربر یافت نشد' }, { status: 404 })

  const user = await db.user.update({ where: { id }, data: { status } })

  const action = status === 'SUSPENDED' ? 'user.suspend' : 'user.ban'
  await logAudit(request, admin.id, action as any, 'USER', id, { previousStatus: exists.status })

  return NextResponse.json({ user })
}
