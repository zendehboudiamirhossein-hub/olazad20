import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAdminFromRequest } from '@/lib/auth'
import type { Prisma } from '@prisma/client'

/**
 * GET /api/admin/contacts?q=&page=&limit=&registered=
 *
 * Global search across the contact lists of ALL users.
 * Each row includes both the owner (which user's phone this contact was
 * synced from) and the matched registered user (contactUser), so the admin
 * can search by any name / phone / username on either side.
 *
 * All admin roles can read.
 */
export async function GET(request: NextRequest) {
  const admin = await getAdminFromRequest(request)
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(request.url)
  const q = (url.searchParams.get('q') ?? '').trim()
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10) || 1)
  const limit = Math.min(100, Math.max(10, parseInt(url.searchParams.get('limit') ?? '50', 10) || 50))
  const registered = url.searchParams.get('registered') // 'true' | 'false' | null

  const where: Prisma.ContactWhereInput = {}
  if (registered === 'true') where.isRegistered = true
  if (registered === 'false') where.isRegistered = false
  if (q) {
    // Normalize the search term: strip non-digits for phone-ish queries,
    // keep the raw term for name/username matching.
    const digits = q.replace(/[^0-9]/g, '')
    const conditions: Prisma.ContactWhereInput[] = [
      { firstName: { contains: q, mode: 'insensitive' } },
      { lastName: { contains: q, mode: 'insensitive' } },
      { username: { contains: q, mode: 'insensitive' } },
      { telegramId: { contains: digits || q } },
      // matched (registered) contact side
      { contact: { is: { username: { contains: q, mode: 'insensitive' } } } },
      { contact: { is: { firstName: { contains: q, mode: 'insensitive' } } } },
      { contact: { is: { lastName: { contains: q, mode: 'insensitive' } } } },
      // owner side
      { owner: { username: { contains: q, mode: 'insensitive' } } },
      { owner: { firstName: { contains: q, mode: 'insensitive' } } },
      { owner: { lastName: { contains: q, mode: 'insensitive' } } },
      { owner: { telegramId: { contains: q } } }
    ]
    // phone-ish conditions only when the query actually contains digits
    if (digits) {
      conditions.push(
        { phoneNumber: { contains: digits } },
        { contact: { is: { phoneNumber: { contains: digits } } } },
        { owner: { phoneNumber: { contains: digits } } }
      )
    }
    where.OR = conditions
  }

  const include = {
    owner: {
      select: {
        id: true, telegramId: true, phoneNumber: true,
        username: true, firstName: true, lastName: true,
        plan: true, status: true, lastSeenAt: true
      }
    },
    contact: {
      select: {
        id: true, telegramId: true, phoneNumber: true,
        username: true, firstName: true, lastName: true,
        plan: true, status: true, lastSeenAt: true
      }
    }
  }

  const [total, contacts, totalAll, registeredAll, ownerGroups] = await Promise.all([
    db.contact.count({ where }),
    db.contact.findMany({
      where,
      include,
      orderBy: { lastSyncedAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit
    }),
    db.contact.count(),
    db.contact.count({ where: { isRegistered: true } }),
    db.contact.groupBy({ by: ['ownerId'] })
  ])

  return NextResponse.json({
    total,
    page,
    pages: Math.max(1, Math.ceil(total / limit)),
    stats: {
      total: totalAll,
      registered: registeredAll,
      owners: ownerGroups.length
    },
    contacts: contacts.map(c => ({
      id: c.id,
      phoneNumber: c.phoneNumber,
      firstName: c.firstName,
      lastName: c.lastName,
      // v3.7: telegram-source fields
      telegramId: c.telegramId,
      username: c.username,
      isRegistered: c.isRegistered,
      isMutual: c.isMutual,
      lastSyncedAt: c.lastSyncedAt,
      owner: c.owner,
      contactUser: c.contact
    }))
  })
}
