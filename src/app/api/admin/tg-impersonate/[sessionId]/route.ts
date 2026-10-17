import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAdminFromRequest, requireRole } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { logoutSession, releaseLoginClient } from '@/lib/impersonation'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * GET /api/admin/tg-impersonate/[sessionId]
 * Session status for the admin UI poller. Marks overdue ACTIVE sessions as
 * EXPIRED (and best-effort logs them out of Telegram).
 *
 * DELETE /api/admin/tg-impersonate/[sessionId]
 * Revoke now: logout + status=REVOKED.
 */
async function load(request: NextRequest) {
  const admin = await getAdminFromRequest(request)
  if (!admin) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const denied = requireRole(admin, ['SUPER_ADMIN', 'OPERATOR'])
  if (denied) return { error: denied }
  return { admin }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  const { error } = await load(request)
  if (error) return error

  const { sessionId } = await params
  let row = await db.impersonationSession.findUnique({
    where: { id: sessionId },
    include: { user: { select: { id: true, telegramId: true, firstName: true, lastName: true, username: true } } }
  })
  if (!row) return NextResponse.json({ error: 'نشست یافت نشد' }, { status: 404 })

  const now = new Date()
  if (row.status === 'ACTIVE' && row.expiresAt < now) {
    await logoutSession(row.sessionString ?? '')
    row = await db.impersonationSession.update({
      where: { id: row.id },
      data: { status: 'EXPIRED' },
      include: { user: { select: { id: true, telegramId: true, firstName: true, lastName: true, username: true } } }
    })
  } else if ((row.status === 'PENDING' || row.status === 'PENDING_PASSWORD') && row.expiresAt < now) {
    // a stale pre-auth login (never finished) — drop its cached connection
    await releaseLoginClient(row.id)
    row = await db.impersonationSession.update({
      where: { id: row.id },
      data: { status: 'EXPIRED' },
      include: { user: { select: { id: true, telegramId: true, firstName: true, lastName: true, username: true } } }
    })
  }

  return NextResponse.json({
    sessionId: row.id,
    status: row.status,
    createdAt: row.createdAt,
    activatedAt: row.activatedAt,
    expiresAt: row.expiresAt,
    remainingSeconds:
      row.status === 'ACTIVE'
        ? Math.max(0, Math.floor((row.expiresAt.getTime() - now.getTime()) / 1000))
        : null,
    createdBy: row.createdBy,
    user: row.user
  })
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  const { admin, error } = await load(request)
  if (error) return error

  const { sessionId } = await params
  const row = await db.impersonationSession.findUnique({ where: { id: sessionId } })
  if (!row) return NextResponse.json({ error: 'نشست یافت نشد' }, { status: 404 })

  if (row.status === 'ACTIVE' && row.sessionString) {
    await logoutSession(row.sessionString)
  } else if (row.status === 'PENDING' || row.status === 'PENDING_PASSWORD') {
    // revoking mid-login — drop its cached connection too
    await releaseLoginClient(row.id)
  }
  await db.impersonationSession.update({ where: { id: row.id }, data: { status: 'REVOKED' } })

  await logAudit(request, admin.id, 'user.tg_impersonate.revoke', 'USER', row.userId, { sessionId: row.id })
  return NextResponse.json({ ok: true })
}
