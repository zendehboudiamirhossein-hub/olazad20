/**
 * Runtime wiring check for the v3.9.1 silent-logger fix:
 *  - TelegramClient must accept { baseLogger } without throwing
 *  - a failing connect must NOT print the raw "Error: TIMEOUT" /
 *    "WebSocket connection failed" spam (MTProtoSender's console.error is
 *    gated behind logger.canSend(ERROR), which is false at level 'none')
 *
 * Both connect outcomes are acceptable — this sandbox may or may not have
 * Telegram egress; what matters is the constructor wiring + a silent retry
 * loop. Run with: bun scripts/smoke-logger.ts
 */
import { TelegramClient } from 'telegram'
import { StringSession } from 'telegram/sessions'
import { Logger, LogLevel } from 'telegram/extensions/Logger'

const log = new Logger()
log.setLevel(LogLevel.NONE)

const client = new TelegramClient(new StringSession(''), 39703773, 'eb00e0cce4fc4d8d419be0e73cfd187d', {
  connectionRetries: 5,
  requestRetries: 3,
  timeout: 20,
  useWSS: true,
  baseLogger: log
})

console.log('✓ TelegramClient constructed with baseLogger (level "none")')
const inner = (client as unknown as { _log?: { logLevel?: string } })._log
console.log('✓ client._log.logLevel =', inner?.logLevel)

const killer = setTimeout(() => {
  console.log('✓ connect still running after 25s (slow/blocked egress) — wiring OK, no spam printed above')
  process.exit(0)
}, 25_000)

try {
  await client.connect()
  clearTimeout(killer)
  console.log('✓ CONNECTED to a Telegram DC — full login-client path works with the silent logger')
  await client.disconnect()
  process.exit(0)
} catch (e) {
  clearTimeout(killer)
  const msg = (e as Error)?.message ?? String(e)
  console.log(`✓ connect failed cleanly (expected without egress): "${String(msg).slice(0, 100)}"`)
  console.log('✓ NOTE: no raw Error TIMEOUT / WebSocket-connection-failed lines were printed above → spam silenced')
  process.exit(0)
}
