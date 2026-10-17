import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAdminFromRequest } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { buildCsv, csvFilename } from '@/lib/csv'
import type { Prisma } from '@prisma/client'

/**
 * GET /api/admin/contacts/export?q=&registered=&all=1
 *
 * CSV export of contacts across ALL users (respects the current search
 * filter when ?q= is passed; ?all=1 exports everything).
 */
export async function GET(request: NextRequest) {
  const admin = await getAdminFromRequest(request)
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(request.url)
  const q = (url.searchParams.get('q') ?? '').trim()
  const registered = url.searchParams.get('registered')

  const where: Prisma.ContactWhereInput = {}
  if (registered === 'true') where.isRegistered = true
  if (registered === 'false') where.isRegistered = false
  if (q) {
    const digits = q.replace(/[^0-9]/g, '')
    where.OR = [
      { phoneNumber: { contains: digits || q } },
      { firstName: { contains: q, mode: 'insensitive' } },
      { lastName: { contains: q, mode: 'insensitive' } },
      { contact: { is: { username: { contains: q, mode: 'insensitive' } } } },
      { contact: { is: { firstName: { contains: q, mode: 'insensitive' } } } },
      { contact: { is: { lastName: { contains: q, mode: 'insensitive' } } } },
      { contact: { is: { phoneNumber: { contains: digits || q } } } },
      { owner: { username: { contains: q, mode: 'insensitive' } } },
      { owner: { firstName: { contains: q, mode: 'insensitive' } } },
      { owner: { lastName: { contains: q, mode: 'insensitive' } } },
      { owner: { phoneNumber: { contains: digits || q } } },
      { owner: { telegramId: { contains: q } } }
    ]
  }

  const contacts = await db.contact.findMany({
    where,
    include: {
      owner: { select: { telegramId: true, phoneNumber: true, username: true, firstName: true, lastName: true } },
      contact: { select: { telegramId: true, username: true } }
    },
    orderBy: [{ ownerId: 'asc' }, { isRegistered: 'desc' }, { firstName: 'asc' }],
    take: 100_000
  })

  const csv = buildCsv(
    ['Owner Telegram ID', 'Owner Name', 'Owner Phone', 'Owner Username',
     'Contact First Name', 'Contact Last Name', 'Contact Phone',
     'Registered', 'Mutual', 'Registered Telegram ID', 'Registered Username', 'Last Sync'],
    contacts.map(c => [
      c.owner.telegramId,
      [c.owner.firstName, c.owner.lastName].filter(Boolean).join(' ') || '-',
      c.owner.phoneNumber,
      c.owner.username ?? '',
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

  await logAudit(request, admin.id, 'contacts.export', 'CONTACT', null, {
    scope: 'all-users',
    count: contacts.length,
    filter: q || undefined
  })

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${csvFilename('azadgram-all-contacts')}"`,
      'Cache-Control': 'no-store'
    }
  })
}
