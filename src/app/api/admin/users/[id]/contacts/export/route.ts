import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAdminFromRequest } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { buildCsv, csvFilename } from '@/lib/csv'

/**
 * GET /api/admin/users/[id]/contacts/export
 *
 * CSV download of a single user's contact list.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminFromRequest(request)
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const user = await db.user.findUnique({ where: { id } })
  if (!user) return NextResponse.json({ error: 'کاربر یافت نشد' }, { status: 404 })

  const contacts = await db.contact.findMany({
    where: { ownerId: id },
    include: {
      contact: { select: { telegramId: true, username: true } }
    },
    orderBy: [{ isRegistered: 'desc' }, { firstName: 'asc' }]
  })

  const csv = buildCsv(
    ['First Name', 'Last Name', 'Phone', 'Registered', 'Mutual',
     'Registered Telegram ID', 'Registered Username', 'Last Sync'],
    contacts.map(c => [
      c.firstName ?? '',
      c.lastName ?? '',
      c.phoneNumber,
      c.isRegistered,
      c.isMutual,
      c.contact?.telegramId ?? '',
      c.contact?.username ?? '',
      c.lastSyncedAt.toISOString()
    ])
  )

  await logAudit(request, admin.id, 'contacts.export', 'USER', user.id, {
    scope: 'single-user',
    count: contacts.length
  })

  const owner = [user.firstName, user.lastName].filter(Boolean).join('-') || user.telegramId
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${csvFilename(`azadgram-contacts-${owner}`)}"`,
      'Cache-Control': 'no-store'
    }
  })
}
