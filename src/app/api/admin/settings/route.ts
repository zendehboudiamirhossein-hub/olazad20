import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAdminFromRequest, requireRole } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { settingsBodySchema } from '@/lib/validation'

export async function GET(request: NextRequest) {
  const admin = await getAdminFromRequest(request)
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const settings = await db.setting.findMany()
  const obj: Record<string, string> = {}
  for (const s of settings) obj[s.key] = s.value
  return NextResponse.json({ settings: obj })
}

export async function PUT(request: NextRequest) {
  const admin = await getAdminFromRequest(request)
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = requireRole(admin, ['SUPER_ADMIN'])
  if (denied) return denied

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'بدنه نامعتبر' }, { status: 400 })
  }

  // Validate: only predefined keys allowed (zod enum)
  const parsed = settingsBodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'کلید نامعتبر' },
      { status: 400 }
    )
  }

  for (const [key, value] of Object.entries(parsed.data)) {
    await db.setting.upsert({
      where: { key },
      create: { key, value },
      update: { value }
    })
  }

  await logAudit(request, admin.id, 'settings.update', 'SETTING', null, {
    keys: Object.keys(parsed.data)
  })

  return NextResponse.json({ ok: true })
}
