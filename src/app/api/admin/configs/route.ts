import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAdminFromRequest, requireRole } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { createConfigBodySchema, configListQuerySchema, bulkConfigActionBodySchema } from '@/lib/validation'
import { buildShareUri } from '@/lib/protocols'
import { maskConfigSecrets } from '@/lib/security-utils'

export async function GET(request: NextRequest) {
  const admin = await getAdminFromRequest(request)
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const query = Object.fromEntries(searchParams.entries())
  const parsed = configListQuerySchema.safeParse(query)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'ورودی نامعتبر' }, { status: 400 })
  }
  const { protocol, active } = parsed.data

  const where: any = {}
  if (protocol) where.protocol = protocol
  if (active === 'true') where.isActive = true
  if (active === 'false') where.isActive = false

  // Use select for list — compute currentUsers from _count instead of storing
  const configs = await db.config.findMany({
    where,
    select: {
      id: true,
      name: true,
      protocol: true,
      server: true,
      port: true,
      shareUri: true,
      isActive: true,
      isPremium: true,
      country: true,
      city: true,
      flag: true,
      ping: true,
      loadPercent: true,
      maxUsers: true,
      // Mask uuid/password in list view (security)
      uuid: true,
      password: true,
      cipher: true,
      security: true,
      network: true,
      // Transport fields (not secrets — needed for display)
      wsPath: true,
      wsHost: true,
      grpcServiceName: true,
      alpn: true,
      allowInsecure: true,
      realityPublicKey: true,
      realityShortId: true,
      encryption: true,
      sni: true,
      fingerprint: true,
      flow: true,
      plugin: true,
      pluginOpts: true,
      createdAt: true,
      _count: { select: { users: true } }
    },
    orderBy: { createdAt: 'desc' }
  })

  // Mask secrets in list
  const maskedConfigs = configs.map(c => ({
    ...maskConfigSecrets(c),
    currentUsers: c._count?.users ?? 0,
    _count: undefined
  }))

  return NextResponse.json({ configs: maskedConfigs })
}

export async function POST(request: NextRequest) {
  const admin = await getAdminFromRequest(request)
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = requireRole(admin, ['OPERATOR', 'SUPER_ADMIN'])
  if (denied) return denied

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'بدنه نامعتبر' }, { status: 400 })

  const parsed = createConfigBodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'ورودی نامعتبر' }, { status: 400 })
  }
  const data = parsed.data

  const config = await db.config.create({
    data: {
      name: data.name,
      protocol: data.protocol,
      server: data.server,
      port: data.port,
      uuid: data.uuid ?? null,
      encryption: data.encryption ?? null,
      network: data.network ?? null,
      security: data.security ?? null,
      sni: data.sni ?? null,
      fingerprint: data.fingerprint ?? null,
      flow: data.flow ?? null,
      password: data.password ?? null,
      cipher: data.cipher ?? null,
      plugin: data.plugin ?? null,
      pluginOpts: data.pluginOpts ?? null,
      // WebSocket / gRPC transport fields
      wsPath: data.wsPath ?? null,
      wsHost: data.wsHost ?? null,
      grpcServiceName: data.grpcServiceName ?? null,
      alpn: data.alpn ?? null,
      allowInsecure: data.allowInsecure ?? false,
      // v3.7: REALITY fields
      realityPublicKey: data.realityPublicKey ?? null,
      realityShortId: data.realityShortId ?? null,
      isActive: data.isActive,
      isPremium: data.isPremium,
      country: data.country ?? null,
      city: data.city ?? null,
      flag: data.flag ?? null,
      ping: data.ping ?? null,
      loadPercent: data.loadPercent ?? null,
      maxUsers: data.maxUsers,
      notes: data.notes ?? null
    }
  })

  const shareUri = buildShareUri(config)
  const updated = await db.config.update({ where: { id: config.id }, data: { shareUri } })

  await logAudit(request, admin.id, 'config.create', 'CONFIG', config.id, {
    name: data.name,
    protocol: data.protocol
  })

  return NextResponse.json({ config: { ...updated, shareUri } })
}

// Bulk action (activate/deactivate/delete)
export async function PATCH(request: NextRequest) {
  const admin = await getAdminFromRequest(request)
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  // Delete requires SUPER_ADMIN; activate/deactivate is OPERATOR+
  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'بدنه نامعتبر' }, { status: 400 })

  const parsed = bulkConfigActionBodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'ورودی نامعتبر' }, { status: 400 })
  }
  const { ids, action } = parsed.data

  if (action === 'delete') {
    const denied = requireRole(admin, ['SUPER_ADMIN'])
    if (denied) return denied
    await db.config.deleteMany({ where: { id: { in: ids } } })
  } else if (action === 'activate') {
    const denied = requireRole(admin, ['OPERATOR', 'SUPER_ADMIN'])
    if (denied) return denied
    await db.config.updateMany({ where: { id: { in: ids } }, data: { isActive: true } })
  } else if (action === 'deactivate') {
    const denied = requireRole(admin, ['OPERATOR', 'SUPER_ADMIN'])
    if (denied) return denied
    await db.config.updateMany({ where: { id: { in: ids } }, data: { isActive: false } })
  }

  await logAudit(request, admin.id, 'config.bulk_action' as any, 'CONFIG', null, { ids, action })

  return NextResponse.json({ ok: true })
}
