import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAdminFromRequest } from '@/lib/auth'

/**
 * GET /api/admin/users/[id]/contacts
 * Returns the contact list of a user (synced from their device).
 *
 * For each contact:
 *  - phoneNumber, firstName, lastName
 *  - isRegistered (whether contact is also an AzadGram user)
 *  - isMutual (whether the contact also has THIS user as a contact)
 *  - contactUser (the matched AzadGram user's basic info, if any)
 *
 * All admin roles can read this.
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
      contact: {
        select: {
          id: true,
          telegramId: true,
          phoneNumber: true,
          username: true,
          firstName: true,
          lastName: true,
          plan: true,
          status: true,
          lastSeenAt: true,
          avatarUrl: true
        }
      }
    },
    orderBy: [
      { isRegistered: 'desc' }, // show registered contacts first
      { firstName: 'asc' }
    ]
  })

  // Stats
  const total = contacts.length
  const registered = contacts.filter(c => c.isRegistered).length
  const mutual = contacts.filter(c => c.isMutual).length

  return NextResponse.json({
    total,
    registered,
    mutual,
    contacts: contacts.map(c => ({
      id: c.id,
      phoneNumber: c.phoneNumber,
      firstName: c.firstName,
      lastName: c.lastName,
      // v3.7: telegram-source fields (telegram-sourced contacts may have no phone)
      telegramId: c.telegramId,
      username: c.username,
      isTelegramSource: c.telegramId != null,
      isRegistered: c.isRegistered,
      isMutual: c.isMutual,
      lastSyncedAt: c.lastSyncedAt,
      contactUser: c.contact
    }))
  })
}
