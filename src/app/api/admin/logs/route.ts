import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAdminFromRequest } from '@/lib/auth'
import { logsListQuerySchema } from '@/lib/validation'

export async function GET(request: NextRequest) {
  const admin = await getAdminFromRequest(request)
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const query = Object.fromEntries(searchParams.entries())
  const parsed = logsListQuerySchema.safeParse(query)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'ورودی نامعتبر' }, { status: 400 })
  }
  const { page, pageSize, status, userId } = parsed.data

  const where: any = {}
  if (status) where.status = status
  if (userId) where.userId = userId

  const [total, logs] = await Promise.all([
    db.connectionLog.count({ where }),
    db.connectionLog.findMany({
      where,
      include: { user: { select: { phoneNumber: true, firstName: true, telegramId: true } }, config: { select: { name: true, protocol: true } } },
      orderBy: { connectedAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize
    })
  ])

  return NextResponse.json({
    logs,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize)
  })
}
