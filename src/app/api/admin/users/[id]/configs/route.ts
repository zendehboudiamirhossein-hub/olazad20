import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAdminFromRequest, requireRole } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { assignConfigBodySchema } from '@/lib/validation'

// Assign config to user (with $transaction)
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminFromRequest(request)
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = requireRole(admin, ['OPERATOR', 'SUPER_ADMIN'])
  if (denied) return denied

  const { id } = await params
  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'بدنه نامعتبر' }, { status: 400 })

  const parsed = assignConfigBodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'ورودی نامعتبر' }, { status: 400 })
  }
  const { configId, isPrimary } = parsed.data

  // Atomic transaction: verify both exist, check maxUsers, create association, update count
  try {
    const result = await db.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id } })
      if (!user) throw { status: 404, message: 'کاربر یافت نشد' }
      const config = await tx.config.findUnique({ where: { id: configId } })
      if (!config) throw { status: 404, message: 'کانفیگ یافت نشد' }
      if (!config.isActive) throw { status: 400, message: 'کانفیگ فعال نیست' }

      const existing = await tx.userConfig.findUnique({
        where: { userId_configId: { userId: id, configId } }
      })
      if (existing) {
        return { userConfig: existing, message: 'already assigned' }
      }

      if (isPrimary) {
        await tx.userConfig.updateMany({
          where: { userId: id },
          data: { isPrimary: false }
        })
      }

      const userConfig = await tx.userConfig.create({
        data: { userId: id, configId, isPrimary: !!isPrimary }
      })

      return { userConfig, message: 'created' }
    })

    await logAudit(request, admin.id, 'user.config_assign', 'USER', id, { configId, isPrimary })

    return NextResponse.json(result)
  } catch (e: any) {
    if (e?.status === 404 || e?.status === 400) {
      return NextResponse.json({ error: e.message }, { status: e.status })
    }
    console.error('assign config error', e)
    return NextResponse.json({ error: 'خطای سرور' }, { status: 500 })
  }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminFromRequest(request)
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const configs = await db.userConfig.findMany({
    where: { userId: id },
    include: { config: true }
  })
  return NextResponse.json({ configs })
}

// Unassign config from user (with $transaction)
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminFromRequest(request)
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = requireRole(admin, ['OPERATOR', 'SUPER_ADMIN'])
  if (denied) return denied

  const { id } = await params
  const { searchParams } = new URL(request.url)
  const configId = searchParams.get('configId')
  if (!configId) return NextResponse.json({ error: 'configId required' }, { status: 400 })

  try {
    const result = await db.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id } })
      if (!user) throw { status: 404, message: 'کاربر یافت نشد' }

      const existing = await tx.userConfig.findUnique({
        where: { userId_configId: { userId: id, configId } }
      })
      if (!existing) throw { status: 404, message: 'کانفیگ به این کاربر اختصاص نیافته' }

      await tx.userConfig.delete({
        where: { userId_configId: { userId: id, configId } }
      })

      return { ok: true }
    })

    await logAudit(request, admin.id, 'user.config_remove', 'USER', id, { configId })

    return NextResponse.json(result)
  } catch (e: any) {
    if (e?.status === 404) {
      return NextResponse.json({ error: e.message }, { status: e.status })
    }
    console.error('unassign config error', e)
    return NextResponse.json({ error: 'خطای سرور' }, { status: 500 })
  }
}
