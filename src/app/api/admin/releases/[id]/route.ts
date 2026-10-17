import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAdminFromRequest, requireRole } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { updateReleaseBodySchema } from '@/lib/validation'
import { isUrlAllowed } from '@/lib/security-utils'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminFromRequest(request)
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const release = await db.appRelease.findUnique({ where: { id } })
  if (!release) return NextResponse.json({ error: 'نسخه یافت نشد' }, { status: 404 })
  return NextResponse.json({ release })
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminFromRequest(request)
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = requireRole(admin, ['SUPER_ADMIN'])
  if (denied) return denied

  const { id } = await params
  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'بدنه نامعتبر' }, { status: 400 })

  const parsed = updateReleaseBodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'ورودی نامعتبر' }, { status: 400 })
  }
  const data: any = { ...parsed.data }

  // If downloadUrl is being updated, re-check domain
  if (data.downloadUrl) {
    const allowedDomainsSetting = await db.setting.findUnique({ where: { key: 'ALLOWED_RELEASE_DOMAINS' } })
    const allowedDomainsCsv = allowedDomainsSetting?.value ?? process.env.ALLOWED_RELEASE_DOMAINS
    if (!isUrlAllowed(data.downloadUrl, allowedDomainsCsv)) {
      return NextResponse.json({ error: 'دامنه‌ی مجاز نیست' }, { status: 400 })
    }
  }

  const exists = await db.appRelease.findUnique({ where: { id } })
  if (!exists) return NextResponse.json({ error: 'نسخه یافت نشد' }, { status: 404 })

  const release = await db.appRelease.update({ where: { id }, data })

  await logAudit(request, admin.id, 'release.update', 'RELEASE', id, parsed.data)

  return NextResponse.json({ release })
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminFromRequest(request)
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = requireRole(admin, ['SUPER_ADMIN'])
  if (denied) return denied

  const { id } = await params
  const exists = await db.appRelease.findUnique({ where: { id } })
  if (!exists) return NextResponse.json({ error: 'نسخه یافت نشد' }, { status: 404 })

  await db.appRelease.delete({ where: { id } })

  await logAudit(request, admin.id, 'release.delete', 'RELEASE', id, {
    version: exists.version,
    versionCode: exists.versionCode
  })

  return NextResponse.json({ ok: true })
}
