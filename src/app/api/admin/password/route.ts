import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAdminFromRequest, verifyPassword, hashPassword, deleteAllSessions, getClientIp } from '@/lib/auth'
import { passwordChangeBodySchema } from '@/lib/validation'
import { logAudit } from '@/lib/audit'

/**
 * POST /api/admin/password
 * Body: { currentPassword, newPassword }
 * Requires authentication. On success: deletes all sessions, returns 200.
 */
export async function POST(request: NextRequest) {
  const admin = await getAdminFromRequest(request)
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'بدنه نامعتبر' }, { status: 400 })

  const parsed = passwordChangeBodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'ورودی نامعتبر' },
      { status: 400 }
    )
  }

  const { currentPassword, newPassword } = parsed.data

  const adminWithHash = await db.admin.findUnique({ where: { id: admin.id } })
  if (!adminWithHash) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const valid = await verifyPassword(currentPassword, adminWithHash.passwordHash)
  if (!valid) {
    return NextResponse.json({ error: 'رمز فعلی نادرست است' }, { status: 401 })
  }

  // Don't reuse current password
  if (currentPassword === newPassword) {
    return NextResponse.json({ error: 'رمز جدید باید متفاوت باشد' }, { status: 400 })
  }

  const passwordHash = await hashPassword(newPassword)
  await db.admin.update({
    where: { id: admin.id },
    data: { passwordHash }
  })

  // Delete all sessions (force re-login on all devices)
  await deleteAllSessions(admin.id)

  await logAudit(request, admin.id, 'admin.password_change', 'ADMIN', admin.id)

  return NextResponse.json({ ok: true, message: 'رمز تغییر کرد. باید دوباره وارد شوید.' })
}
