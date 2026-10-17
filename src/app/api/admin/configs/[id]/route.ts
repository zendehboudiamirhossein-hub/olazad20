import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAdminFromRequest, requireRole } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { updateConfigBodySchema } from '@/lib/validation'
import { buildShareUri } from '@/lib/protocols'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminFromRequest(request)
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const config = await db.config.findUnique({
    where: { id },
    include: { _count: { select: { users: true } } }
  })
  if (!config) return NextResponse.json({ error: 'کانفیگ یافت نشد' }, { status: 404 })

  // Detail view — full secrets allowed (no masking)
  return NextResponse.json({
    config: { ...config, shareUri: config.shareUri ?? buildShareUri(config), currentUsers: config._count?.users ?? 0 }
  })
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminFromRequest(request)
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = requireRole(admin, ['OPERATOR', 'SUPER_ADMIN'])
  if (denied) return denied

  const { id } = await params
  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'بدنه نامعتبر' }, { status: 400 })

  const parsed = updateConfigBodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'ورودی نامعتبر' }, { status: 400 })
  }
  const data: any = { ...parsed.data }
  if (typeof data.port === 'string') data.port = parseInt(data.port)

  const exists = await db.config.findUnique({ where: { id } })
  if (!exists) return NextResponse.json({ error: 'کانفیگ یافت نشد' }, { status: 404 })

  const config = await db.config.update({ where: { id }, data })

  // Regenerate shareUri
  const shareUri = buildShareUri(config)
  const updated = await db.config.update({ where: { id }, data: { shareUri } })

  await logAudit(request, admin.id, 'config.update', 'CONFIG', id, parsed.data)

  return NextResponse.json({ config: { ...updated, shareUri } })
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminFromRequest(request)
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = requireRole(admin, ['SUPER_ADMIN'])
  if (denied) return denied

  const { id } = await params
  const exists = await db.config.findUnique({ where: { id } })
  if (!exists) return NextResponse.json({ error: 'کانفیگ یافت نشد' }, { status: 404 })

  await db.config.delete({ where: { id } })

  await logAudit(request, admin.id, 'config.delete', 'CONFIG', id, { name: exists.name })

  return NextResponse.json({ ok: true })
}
