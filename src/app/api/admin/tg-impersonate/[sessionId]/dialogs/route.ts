import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAdminFromRequest, requireRole } from '@/lib/auth'
import { getDialogs } from '@/lib/impersonation'

export const runtime = 'nodejs'
export const maxDuration = 60

/** GET /api/admin/tg-impersonate/[sessionId]/dialogs — the user's chat list. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  const admin = await getAdminFromRequest(request)
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = requireRole(admin, ['SUPER_ADMIN', 'OPERATOR'])
  if (denied) return denied

  const { sessionId } = await params
  const row = await db.impersonationSession.findUnique({ where: { id: sessionId } })
  if (!row) return NextResponse.json({ error: 'نشست یافت نشد' }, { status: 404 })
  if (row.status !== 'ACTIVE' || !row.sessionString || row.expiresAt < new Date()) {
    return NextResponse.json({ error: 'نشست فعال نیست', expired: true }, { status: 403 })
  }

  try {
    const dialogs = await getDialogs(row.sessionString, 40)
    return NextResponse.json({ dialogs })
  } catch (e) {
    console.error('tg-impersonate dialogs failed', e)
    return NextResponse.json({ error: 'خطا در دریافت فهرست گفتگوها' }, { status: 502 })
  }
}
