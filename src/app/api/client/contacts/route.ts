import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getClientFromRequest, getClientIp } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { z } from 'zod'

const contactItemSchema = z.object({
  // v3.7: phoneNumber is now OPTIONAL — telegram-contacts may carry only the
  // numeric telegramId + username. At least one of the two is required.
  phoneNumber: z.string().regex(/^\d{7,15}$/).optional(),
  firstName: z.string().max(64).optional(),
  lastName: z.string().max(64).optional(),
  // v3.6: telegram contacts carry the numeric Telegram ID + username
  telegramId: z.string().regex(/^\d{1,20}$/).optional(),
  username: z.string().max(32).optional()
}).refine(i => i.phoneNumber || i.telegramId, {
  message: 'phoneNumber یا telegramId الزامی است'
})

const syncBodySchema = z.object({
  source: z.enum(['device', 'telegram']).optional(),
  contacts: z.array(contactItemSchema).max(5000) // safety limit
})

/**
 * POST /api/client/contacts
 * Body: { source?: 'device'|'telegram', contacts: [{ phoneNumber?, firstName?, lastName?, telegramId?, username? }, ...] }
 *
 * Called by the AzadGram Android client for BOTH sync paths:
 *   - device contacts (phone numbers, consent-gated on the app side)
 *   - TELEGRAM contacts (numeric telegram IDs; may lack a phone number)
 *
 * For each item:
 *   - upsert into Contact (ownerId = current user)
 *     · keyed by (ownerId, phoneNumber) when a phone is present
 *     · keyed by (ownerId, telegramId) for phone-less telegram items
 *   - try to find a matching registered AzadGram user — by telegramId first
 *     (exact identity), then by phone number
 *   - set isRegistered + contactId accordingly
 *   - set isMutual if the matched user also has this user in their contacts
 *
 * v3.7: every sync is audit-logged (action `client.contacts.sync`) with the
 * source, item count and IP.
 */
export async function POST(request: NextRequest) {
  const client = await getClientFromRequest(request)
  if (!client) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await db.user.findUnique({ where: { telegramId: client.telegramId } })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'بدنه نامعتبر' }, { status: 400 })

  const parsed = syncBodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'ورودی نامعتبر' }, { status: 400 })
  }

  const items = parsed.data.contacts
  const source = parsed.data.source ?? 'device'

  if (items.length === 0) {
    return NextResponse.json({ ok: true, created: 0, updated: 0, total: 0, registered: 0 })
  }

  // Batch: gather all phone numbers + telegram ids from request
  const phones = items.map(i => i.phoneNumber).filter(Boolean) as string[]
  const telegramIds = items.map(i => i.telegramId).filter(Boolean) as string[]

  // Find all matching registered AzadGram users — by telegramId first
  // (exact identity), then by phone (single query each)
  const matchesByTg = telegramIds.length
    ? await db.user.findMany({
        where: { telegramId: { in: telegramIds } },
        select: { id: true, telegramId: true, phoneNumber: true }
      })
    : []
  const tgMap = new Map(matchesByTg.map(m => [m.telegramId, m.id]))
  const phoneIds = phones.concat(matchesByTg.map(m => m.phoneNumber))
  const matches = phoneIds.length
    ? await db.user.findMany({
        where: { phoneNumber: { in: Array.from(new Set(phoneIds)) } },
        select: { id: true, phoneNumber: true }
      })
    : []
  const matchByPhone = new Map(matches.map(m => [m.phoneNumber, m.id]))

  // v3.7.1: fetch ALL of this owner's contacts (the API already caps a
  // payload at 5000 items, owner lists are of the same order) so we can
  // dedupe/merge by phone OR telegramId OR matched registered user.
  // Without this, a device-synced row (phone, no telegramId) and a
  // telegram-synced row (telegramId, no phone) for the SAME person ended up
  // as two partial rows; now they always merge into one complete row
  // (phone + name + telegramId + username together).
  const existing = await db.contact.findMany({ where: { ownerId: user.id } })
  type ContactRow = (typeof existing)[number]
  const byPhone = new Map<string, ContactRow>()
  const byTg = new Map<string, ContactRow>()
  const byContactId = new Map<string, ContactRow>()
  for (const c of existing) {
    if (c.phoneNumber) byPhone.set(c.phoneNumber, c)
    if (c.telegramId) byTg.set(c.telegramId, c)
    if (c.contactId) byContactId.set(c.contactId, c)
  }

  // For mutual detection: for each matched user, check if THEY have THIS
  // user's phone or telegram id in their contacts
  const mutualCheckIds = Array.from(new Set(matches.map(m => m.id).concat(Array.from(tgMap.values()))))
  const reverseContacts = mutualCheckIds.length
    ? await db.contact.findMany({
        where: {
          ownerId: { in: mutualCheckIds },
          OR: [
            { phoneNumber: user.phoneNumber },
            { telegramId: user.telegramId }
          ]
        },
        select: { ownerId: true }
      })
    : []
  const mutualSet = new Set(reverseContacts.map(r => r.ownerId))

  // Build upserts in a transaction
  let created = 0
  let updated = 0

  // keep the in-memory indexes in sync after each write so later items in
  // the SAME batch dedupe against rows written moments ago
  const indexRow = (row: ContactRow, oldRow?: ContactRow) => {
    if (oldRow) {
      if (oldRow.phoneNumber && oldRow.phoneNumber !== row.phoneNumber) byPhone.delete(oldRow.phoneNumber)
      if (oldRow.telegramId && oldRow.telegramId !== row.telegramId) byTg.delete(oldRow.telegramId)
      if (oldRow.contactId && oldRow.contactId !== row.contactId) byContactId.delete(oldRow.contactId)
    }
    if (row.phoneNumber) byPhone.set(row.phoneNumber, row)
    if (row.telegramId) byTg.set(row.telegramId, row)
    if (row.contactId) byContactId.set(row.contactId, row)
  }

  // v3.9.1 FIX (P2028 "Transaction not found"): Prisma interactive
  // transactions time out after 5 seconds by default. The old code ran the
  // WHOLE batch (an awaited create/update/delete per item, up to 5000 items)
  // inside ONE transaction — with a few hundred contacts it blew the 5s
  // limit, Prisma aborted it mid-loop, and every later tx.contact.* call
  // threw P2028 while the whole batch rolled back. Contacts therefore NEVER
  // reached the panel and the client's retry schedule kept hitting the same
  // wall (the "contacts sync error" P2028 storm in the server logs).
  // Fix: run the batch in CHUNKS, each chunk in its own transaction with a
  // generous timeout. Every write is an idempotent upsert/merge, so a retry
  // after a mid-batch failure converges to the same end state, and earlier
  // chunks stay committed instead of losing the entire sync.
  const CHUNK_SIZE = 100
  const TX_OPTIONS = { timeout: 30_000, maxWait: 10_000 }

  try {
    for (let start = 0; start < items.length; start += CHUNK_SIZE) {
      const chunk = items.slice(start, start + CHUNK_SIZE)
      await db.$transaction(
        async (tx) => {
          for (const item of chunk) {
            // telegramId match wins — it's the exact Telegram identity
            const contactId = (item.telegramId ? tgMap.get(item.telegramId) : undefined)
              ?? (item.phoneNumber ? matchByPhone.get(item.phoneNumber) : undefined)
              ?? null
            const isRegistered = !!contactId
            const isMutual = contactId ? mutualSet.has(contactId) : false

            // existing row — by phone, then by telegramId (phone-less items),
            // then by the matched registered AzadGram user (same person synced
            // once from the device and once from telegram merges into one row)
            const prior = (item.phoneNumber ? byPhone.get(item.phoneNumber) : undefined)
              ?? (item.telegramId ? byTg.get(item.telegramId) : undefined)
              ?? (contactId ? byContactId.get(contactId) : undefined)

            // v3.8.0 FIX: consolidate duplicates. When the row being updated takes
            // over a telegramId / phone / matched registered user that a DIFFERENT
            // existing row of this owner already holds, that other row is a
            // partial duplicate of the same person (e.g. synced earlier without a
            // phone). Merge its surviving fields and delete it, so the panel shows
            // ONE complete row per contact instead of two partial rows.
            // v3.9.1 FIX: dedupe candidates by row id — the same existing row can
            // be reached through two indexes at once (e.g. byTg AND byContactId).
            // Without id-dedupe it was deleted twice inside one transaction,
            // raising P2025 (record not found) and aborting the whole sync.
            const dupIds = new Set<string>()
            const dupCandidates = [
              item.telegramId ? byTg.get(item.telegramId) : undefined,
              item.phoneNumber ? byPhone.get(item.phoneNumber) : undefined,
              contactId ? byContactId.get(contactId) : undefined
            ].filter((d): d is ContactRow => {
              if (!d) return false
              if (prior && d.id === prior.id) return false
              if (dupIds.has(d.id)) return false
              dupIds.add(d.id)
              return true
            })
            const dup = dupCandidates[0]

            const data = {
              ownerId: user.id,
              contactId,
              // never wipe an existing phone/name when a telegram item lacks it
              // (v3.8.0: also fall back to a duplicate row's fields before null)
              phoneNumber: item.phoneNumber ?? prior?.phoneNumber ?? dup?.phoneNumber ?? null,
              firstName: item.firstName ?? prior?.firstName ?? dup?.firstName ?? null,
              lastName: item.lastName ?? prior?.lastName ?? dup?.lastName ?? null,
              telegramId: item.telegramId ?? prior?.telegramId ?? dup?.telegramId ?? null,
              username: item.username ?? prior?.username ?? dup?.username ?? null,
              isRegistered,
              isMutual,
              lastSyncedAt: new Date()
            }

            if (prior) {
              for (const dupRow of dupCandidates) {
                if (dupRow.id === prior.id) continue
                await tx.contact.delete({ where: { id: dupRow.id } })
                if (dupRow.phoneNumber) byPhone.delete(dupRow.phoneNumber)
                if (dupRow.telegramId) byTg.delete(dupRow.telegramId)
                if (dupRow.contactId) byContactId.delete(dupRow.contactId)
              }
              const row = await tx.contact.update({ where: { id: prior.id }, data })
              indexRow(row, prior)
              updated++
            } else {
              const row = await tx.contact.create({ data })
              indexRow(row)
              created++
            }
          }
        },
        TX_OPTIONS
      )
    }
  } catch (e: any) {
    console.error('contacts sync error', e)
    return NextResponse.json({ error: 'خطای همگام‌سازی' }, { status: 500 })
  }

  await logAudit(request, null, 'client.contacts.sync', 'USER', user.id, {
    telegramId: user.telegramId,
    source,
    items: items.length,
    ip: getClientIp(request)
  })

  return NextResponse.json({
    ok: true,
    created,
    updated,
    total: items.length,
    registered: matches.length
  })
}

/**
 * DELETE /api/client/contacts
 * Wipes all contacts of the current user (called on logout or fresh sync).
 */
export async function DELETE(request: NextRequest) {
  const client = await getClientFromRequest(request)
  if (!client) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await db.user.findUnique({ where: { telegramId: client.telegramId } })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  await db.contact.deleteMany({ where: { ownerId: user.id } })
  return NextResponse.json({ ok: true })
}
