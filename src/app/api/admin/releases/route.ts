import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAdminFromRequest, requireRole } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { createReleaseBodySchema } from '@/lib/validation'
import { isUrlAllowed } from '@/lib/security-utils'

export async function GET(request: NextRequest) {
  const admin = await getAdminFromRequest(request)
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const releases = await db.appRelease.findMany({
    orderBy: { releasedAt: 'desc' }
  })
  return NextResponse.json({ releases })
}

export async function POST(request: NextRequest) {
  const admin = await getAdminFromRequest(request)
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = requireRole(admin, ['SUPER_ADMIN'])
  if (denied) return denied

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'بدنه نامعتبر' }, { status: 400 })

  const parsed = createReleaseBodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'ورودی نامعتبر' }, { status: 400 })
  }
  const data = parsed.data

  // Check downloadUrl against allowed domains — Settings table first,
  // then env fallback (v3 bugfix: fresh installs with no Setting row always
  // failed validation even when ALLOWED_RELEASE_DOMAINS was set in env).
  const allowedDomainsSetting = await db.setting.findUnique({ where: { key: 'ALLOWED_RELEASE_DOMAINS' } })
  const allowedDomainsCsv = allowedDomainsSetting?.value ?? process.env.ALLOWED_RELEASE_DOMAINS
  if (!isUrlAllowed(data.downloadUrl, allowedDomainsCsv)) {
    return NextResponse.json(
      { error: 'دامنه‌ی downloadUrl مجاز نیست. دامنه را در تنظیمات اضافه کنید.' },
      { status: 400 }
    )
  }

  const release = await db.appRelease.create({
    data: {
      version: data.version,
      versionCode: data.versionCode,
      downloadUrl: data.downloadUrl,
      sha256: data.sha256 ?? null,
      changelog: data.changelog ?? null,
      minAndroid: data.minAndroid ?? null,
      isActive: data.isActive,
      forceUpdate: data.forceUpdate
    }
  })

  await logAudit(request, admin.id, 'release.create', 'RELEASE', release.id, {
    version: data.version,
    versionCode: data.versionCode
  })

  return NextResponse.json({ release })
}
