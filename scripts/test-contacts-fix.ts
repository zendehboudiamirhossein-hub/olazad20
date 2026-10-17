/**
 * Live smoke test for the v3.9.1 panel fixes (run against `next dev` + sqlite):
 *
 *   1. contacts bulk sync (250 items → 3 chunks) — the old single-transaction
 *      code path hit Prisma's 5s interactive-transaction timeout (P2028
 *      "Transaction not found") and rolled the whole batch back, so contacts
 *      never reached the panel.
 *   2. re-sync / merge semantics (updated, not duplicated).
 *   3. registered-user matching by telegramId (isRegistered + contactId).
 *   4. the v3.9.1 double-delete fix: an existing row reachable via TWO
 *      indexes (byTg + byContactId) used to be deleted twice inside one
 *      transaction → P2025 → whole sync aborted.
 *   5. impersonation fetch circuit breaker: 5 consecutive failed token
 *      fetches mark the session FAILED (+ audit row) so the client polling
 *      loop ends instead of spinning for the 15-minute pending window.
 *
 * Usage (from the panel root, with the dev server on :3100):
 *   DATABASE_URL=file:./test-fixes.db bun scripts/test-contacts-fix.ts
 */
import { PrismaClient } from '@prisma/client'

const BASE = 'http://localhost:3100'
const db = new PrismaClient()

let passed = 0
let failed = 0
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) {
    passed++
    console.log(`  ✓ ${name}`)
  } else {
    failed++
    console.log(`  ✗ ${name}`, extra !== undefined ? JSON.stringify(extra) : '')
  }
}

async function post(path: string, body: unknown, token?: string) {
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(body)
  })
  return { status: res.status, json: await res.json().catch(() => ({})) }
}

async function get(path: string, token?: string) {
  const res = await fetch(BASE + path, {
    headers: token ? { authorization: `Bearer ${token}` } : {}
  })
  return { status: res.status, json: await res.json().catch(() => ({})) }
}

async function del(path: string, token: string) {
  const res = await fetch(BASE + path, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${token}` }
  })
  return { status: res.status, json: await res.json().catch(() => ({})) }
}

async function main() {
  console.log('— A) client auth (owner) —')
  const ownerAuth = await post('/api/client/auth', {
    telegramId: '900100',
    phoneNumber: '989110000001',
    firstName: 'مالک',
    lastName: 'تست'
  })
  check('auth returns 200 + token', ownerAuth.status === 200 && !!ownerAuth.json.token, ownerAuth.json)
  const ownerToken = ownerAuth.json.token as string
  const owner = await db.user.findUnique({ where: { telegramId: '900100' } })
  check('owner row exists', !!owner)

  console.log('— B) bulk contacts sync: 250 items (150 phone-only, 50 tg-only, 50 both) —')
  const items: Record<string, string>[] = []
  for (let i = 0; i < 150; i++) {
    items.push({ phoneNumber: `98912000${String(1000 + i).padStart(5, '0')}`, firstName: `دستگاه${i}` })
  }
  for (let i = 0; i < 50; i++) {
    items.push({ telegramId: String(910000 + i), username: `tg_user_${i}` })
  }
  for (let i = 0; i < 50; i++) {
    items.push({
      phoneNumber: `98913000${String(2000 + i).padStart(5, '0')}`,
      telegramId: String(920000 + i),
      firstName: `ترکیبی${i}`
    })
  }
  const t0 = Date.now()
  const r1 = await post('/api/client/contacts', { source: 'telegram', contacts: items }, ownerToken)
  const syncMs = Date.now() - t0
  check('sync 200 + created=250', r1.status === 200 && r1.json.created === 250, r1.json)
  const cnt1 = await db.contact.count({ where: { ownerId: owner!.id } })
  check('250 rows in db', cnt1 === 250, { cnt1 })
  console.log(`    (sync took ${syncMs}ms — 3 chunks)`)

  console.log('— C) re-sync enrichment (idempotent) —')
  const enriched = items.map((it, i) => ({ ...it, lastName: `فامیل${i}` }))
  const r2 = await post('/api/client/contacts', { source: 'telegram', contacts: enriched }, ownerToken)
  check('re-sync: created=0 updated=250', r2.status === 200 && r2.json.created === 0 && r2.json.updated === 250, r2.json)
  const cnt2 = await db.contact.count({ where: { ownerId: owner!.id } })
  check('still 250 rows (no dupes)', cnt2 === 250, { cnt2 })

  console.log('— D) registered-user match by telegramId —')
  const friendAuth = await post('/api/client/auth', {
    telegramId: '900200',
    phoneNumber: '989220000002',
    firstName: 'رفیق'
  })
  check('friend auth ok', friendAuth.status === 200 && !!friendAuth.json.token)
  const friend = await db.user.findUnique({ where: { telegramId: '900200' } })
  const r3 = await post(
    '/api/client/contacts',
    { source: 'telegram', contacts: [{ telegramId: '900200', firstName: 'رفیق' }] },
    ownerToken
  )
  check('friend contact created', r3.status === 200 && r3.json.created === 1, r3.json)
  const friendRow = await db.contact.findFirst({
    where: { ownerId: owner!.id, telegramId: '900200' }
  })
  check('isRegistered=true + contactId=friend', !!friendRow && friendRow.isRegistered === true && friendRow.contactId === friend!.id, friendRow)

  console.log('— E) double-delete dup fix (byTg + byContactId → same row) —')
  // rowA: phone-only row
  await post('/api/client/contacts', { source: 'device', contacts: [{ phoneNumber: '989330000003', firstName: 'دو' }] }, ownerToken)
  // same person now arrives with the friend's telegramId too → merges rowA + friendRow
  const r4 = await post(
    '/api/client/contacts',
    { source: 'telegram', contacts: [{ phoneNumber: '989330000003', telegramId: '900200' }] },
    ownerToken
  )
  check('merge sync ok', r4.status === 200, r4.json)
  const merged = await db.contact.findFirst({ where: { ownerId: owner!.id, phoneNumber: '989330000003' } })
  const cnt3 = await db.contact.count({ where: { ownerId: owner!.id } })
  check('merged row has phone + telegramId + contactId',
    !!merged && merged.telegramId === '900200' && merged.contactId === friend!.id, merged)
  check('row count = 251 (one merge, no dupes)', cnt3 === 251, { cnt3 })

  console.log('— F) impersonation fetch circuit breaker —')
  const sess = await db.impersonationSession.create({
    data: {
      userId: owner!.id,
      createdById: 'test-admin',
      createdBy: 'test',
      preAuthSession: 'garbage-not-a-session-string',
      status: 'PENDING',
      expiresAt: new Date(Date.now() + 15 * 60 * 1000)
    }
  })
  for (let i = 1; i <= 4; i++) {
    const rf = await post('/api/client/tg-impersonate', { sessionId: sess.id, action: 'fetch' }, ownerToken)
    check(`fetch #${i} → 502`, rf.status === 502, rf.json)
  }
  let st = await db.impersonationSession.findUnique({ where: { id: sess.id } })
  check('still PENDING after 4 failures', st?.status === 'PENDING', st?.status)
  await post('/api/client/tg-impersonate', { sessionId: sess.id, action: 'fetch' }, ownerToken)
  st = await db.impersonationSession.findUnique({ where: { id: sess.id } })
  check('5th failure → FAILED (circuit open)', st?.status === 'FAILED', st?.status)
  const audit = await db.adminAuditLog.findFirst({ where: { action: 'client.tg_impersonate.circuit_open' } })
  check('circuit_open audit row exists', !!audit)
  const pending = await get('/api/client/tg-impersonate', ownerToken)
  check('heartbeat-style GET: no pending after FAILED', pending.json?.impersonation === null, pending.json)

  console.log('— G) DELETE contacts —')
  const rd = await del('/api/client/contacts', ownerToken)
  check('delete ok', rd.status === 200)
  const cnt4 = await db.contact.count({ where: { ownerId: owner!.id } })
  check('all rows wiped', cnt4 === 0, { cnt4 })

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) process.exit(1)
}

main()
  .catch(e => {
    console.error('TEST RUNNER ERROR', e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
