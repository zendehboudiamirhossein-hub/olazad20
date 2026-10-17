import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getClientFromRequest } from '@/lib/auth'
import { clientDisconnectBodySchema } from '@/lib/validation'

export async function POST(request: NextRequest) {
  const client = await getClientFromRequest(request)
  if (!client) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'بدنه نامعتبر' }, { status: 400 })

  const parsed = clientDisconnectBodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'ورودی نامعتبر' }, { status: 400 })
  }
  const { logId, durationSec, bytesIn, bytesOut, status, errorMessage } = parsed.data

  const log = await db.connectionLog.findUnique({ where: { id: logId } })
  if (!log) return NextResponse.json({ error: 'log not found' }, { status: 404 })

  const user = await db.user.findUnique({ where: { telegramId: client.telegramId } })
  if (!user || log.userId !== user.id) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const updated = await db.connectionLog.update({
    where: { id: logId },
    data: {
      disconnectedAt: new Date(),
      durationSec,
      bytesIn: bytesIn ?? null,
      bytesOut: bytesOut ?? null,
      status,
      errorMessage
    }
  })

  // NOTE (v3 bugfix): the total bytes are stored on the ConnectionLog for
  // history, but user.trafficUsedMB is NO longer incremented here. The
  // Android client reports periodic totals via /api/client/traffic AND a
  // final summary here — incrementing in both places double-counted every
  // session. /api/client/traffic is the single source of truth for quotas.

  return NextResponse.json({ ok: true, log: { ...updated, bytesIn: Number(updated.bytesIn), bytesOut: Number(updated.bytesOut) } })
}
