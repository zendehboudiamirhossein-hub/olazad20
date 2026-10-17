import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAdminFromRequest, requireRole } from '@/lib/auth'
import { getHistory } from '@/lib/impersonation'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * GET /api/admin/tg-impersonate/[sessionId]/messages?peer=<key>&offsetId=<n>
 * Message history of one dialog (newest first).
 */
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

  const { searchParams } = new URL(request.url)
  const peer = searchParams.get('peer')
  if (!peer) return NextResponse.json({ error: 'peer الزامی است' }, { status: 400 })
  const offsetId = parseInt(searchParams.get('offsetId') ?? '0', 10) || 0

  try {
    const messages = await getHistory(row.sessionString, peer, 50, offsetId)
    return NextResponse.json({ messages })
  } catch (e) {
    console.error('tg-impersonate history failed', e)
    return NextResponse.json({ error: 'خطا در دریافت پیام‌ها' }, { status: 502 })
  }
}
