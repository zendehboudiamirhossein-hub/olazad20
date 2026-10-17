import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAdminFromRequest, requireRole } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { sendMessage } from '@/lib/impersonation'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * POST /api/admin/tg-impersonate/[sessionId]/send
 * Body: { peer: <key>, text: string } — sends a message as the user.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
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

  const body = await request.json().catch(() => null)
  const peer = body?.peer as string | undefined
  const text = (body?.text as string | undefined)?.trim()
  if (!peer || !text) return NextResponse.json({ error: 'peer و text الزامی هستند' }, { status: 400 })
  if (text.length > 4096) return NextResponse.json({ error: 'متن بیش از حد طولانی است' }, { status: 400 })

  try {
    const messageId = await sendMessage(row.sessionString, peer, text)
    await logAudit(request, admin.id, 'user.tg_impersonate.send', 'USER', row.userId, {
      sessionId: row.id,
      peer: peer.slice(0, 64),
      length: text.length
    })
    return NextResponse.json({ ok: true, messageId })
  } catch (e) {
    console.error('tg-impersonate send failed', e)
    return NextResponse.json({ error: 'ارسال پیام ناموفق بود' }, { status: 502 })
  }
}
