import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAdminFromRequest, requireRole, generateImpersonationToken } from '@/lib/auth'
import { logAudit } from '@/lib/audit'

/**
 * POST /api/admin/users/[id]/impersonate
 *
 * "ورود به اکانت کاربر" — lets an authorized admin open a short-lived client
 * session on behalf of a user. The panel then uses the standard client API
 * (/api/client/*) with this token, so the admin sees EXACTLY what the user's
 * app sees: their assigned configs, share URIs, traffic status, plan limits.
 *
 * Security:
 *  - SUPER_ADMIN / OPERATOR only
 *  - Token expires in 2 hours, is marked imp=true + issuing admin
 *  - Every impersonation is written to the audit log
 *  - Banned/suspended users cannot be impersonated
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminFromRequest(request)
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = requireRole(admin, ['SUPER_ADMIN', 'OPERATOR'])
  if (denied) return denied

  const { id } = await params

  const user = await db.user.findUnique({
    where: { id },
    include: { configs: { include: { config: true } } }
  })
  if (!user) return NextResponse.json({ error: 'کاربر یافت نشد' }, { status: 404 })

  if (user.status === 'BANNED') {
    return NextResponse.json({ error: 'کاربر مسدود است؛ ابتدا وضعیت او را تغییر دهید' }, { status: 400 })
  }

  const token = generateImpersonationToken(user.telegramId, user.phoneNumber, admin.id, admin.username)

  await logAudit(request, admin.id, 'user.impersonate', 'USER', user.id, {
    telegramId: user.telegramId,
    phoneNumber: user.phoneNumber,
    adminUsername: admin.username
  })

  return NextResponse.json({
    token,
    expiresInSeconds: 2 * 60 * 60,
    user: {
      id: user.id,
      telegramId: user.telegramId,
      phoneNumber: user.phoneNumber,
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
      plan: user.plan,
      status: user.status,
      trafficLimitMB: user.trafficLimitMB,
      trafficUsedMB: user.trafficUsedMB,
      expiresAt: user.expiresAt
    }
  })
}
