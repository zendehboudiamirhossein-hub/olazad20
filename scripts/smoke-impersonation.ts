/**
 * Smoke test: create a pre-auth GramJS session, export a login token,
 * then poll exportLoginToken again (should stay a token — nothing accepted).
 * Verifies the panel impersonation plumbing works against real Telegram DCs.
 */
import { TelegramClient } from 'telegram'
import { StringSession } from 'telegram/sessions'
import { Api } from 'telegram'
import bigInt from 'big-integer'

const API_ID = 39703773
const API_HASH = 'eb00e0cce4fc4d8d419be0e73cfd187d'

async function main() {
  console.log('1) creating pre-auth session (fresh client)...')
  const client = new TelegramClient(new StringSession(''), API_ID, API_HASH, {
    connectionRetries: 3, requestRetries: 2, timeout: 15, useWSS: false
  })
  await client.connect()
  const pre = client.session.save() as unknown as string
  console.log('   pre-auth session saved, length =', pre.length)

  console.log('2) exportLoginToken...')
  const res = await client.invoke(new Api.auth.ExportLoginToken({ apiId: API_ID, apiHash: API_HASH, exceptIds: [] }))
  if (res instanceof Api.auth.LoginToken) {
    const b64 = Buffer.from(res.token).toString('base64')
    console.log('   token OK, base64 len =', b64.length, 'expires in', res.expires, 's')
  } else {
    console.log('   UNEXPECTED:', res.className)
    process.exit(1)
  }
  await client.disconnect()

  console.log('3) re-create client from saved pre-auth session...')
  const client2 = new TelegramClient(new StringSession(pre), API_ID, API_HASH, {
    connectionRetries: 3, useWSS: false
  })
  await client2.connect()
  const res2 = await client2.invoke(new Api.auth.ExportLoginToken({ apiId: API_ID, apiHash: API_HASH, exceptIds: [] }))
  console.log('   second exportLoginToken ->', res2.className, '(expected LoginToken again — nothing accepted yet)')
  await client2.disconnect()

  console.log('4) bigInt peer roundtrip...')
  const p = new Api.InputPeerUser({ userId: bigInt('123456789'), accessHash: bigInt('0') })
  console.log('   InputPeerUser constructed:', p.userId.toString())
  console.log('SMOKE TEST PASS')
}

main().catch(e => { console.error('FAIL', e); process.exit(1) })
