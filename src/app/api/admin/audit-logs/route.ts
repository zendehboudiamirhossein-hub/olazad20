import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAdminFromRequest, requireRole } from '@/lib/auth'

/**
 * GET /api/admin/audit-logs?page=&action=&targetType=
 * Read-only for all admin roles.
 */
export async function GET(request: NextRequest) {
  const admin = await getAdminFromRequest(request)
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1'))
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') ?? '50')))
  const action = searchParams.get('action') ?? ''
  const targetType = searchParams.get('targetType') ?? ''

  const where: any = {}
  if (action) where.action = action
  if (targetType) where.targetType = targetType

  const [total, logs] = await Promise.all([
    db.adminAuditLog.count({ where }),
    db.adminAuditLog.findMany({
      where,
      include: { admin: { select: { username: true, role: true } } },
      orderBy: { createdAt: 'desc' },
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
