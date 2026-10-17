/**
 * Telegram impersonation — GramJS (MTProto) helpers.
 *
 * Implements the QR-login-token transfer WITHOUT a QR code:
 *   1. A fresh, unauthenticated GramJS session is created (preAuthSession)
 *      and persisted in the ImpersonationSession row.
 *   2. On demand, auth.exportLoginToken is invoked on that session and the
 *      short-lived token is handed to the user's AzadGram app.
 *   3. The app calls auth.acceptLoginToken on the user's own account —
 *      exactly like confirming a QR login — which authorizes OUR session.
 *   4. The next exportLoginToken call returns auth.loginTokenSuccess and the
 *      now-authorized StringSession is stored (status=ACTIVE, 2h window).
 *
 * All account-explorer API (dialogs/history/send) runs through the stored
 * session and self-revokes after expiry.
 *
 * ---- Connection reuse (fetch/confirm/confirm+password) ----
 * A pre-auth login is actually several sequential MTProto calls against the
 * SAME session (export token → confirm →, for 2FA accounts, one more round
 * trip to check the cloud password). Each call used to open a brand-new raw
 * connection and immediately tear it down, which made the 2FA path — one
 * extra connection — noticeably more exposed to a transient network hiccup
 * than the no-2FA path (that's the TIMEOUT some users hit only when their
 * account has two-step verification enabled). getOrCreateLoginClient keeps
 * one connected client alive per login flow (keyed by the
 * ImpersonationSession row id) and reuses it across those calls instead.
 */
import { TelegramClient } from 'telegram'
import { StringSession } from 'telegram/sessions'
import { Api } from 'telegram'
import { computeCheck } from 'telegram/Password'
import { Logger, LogLevel } from 'telegram/extensions/Logger'
import bigInt from 'big-integer'

export const TG_API_ID = Number(process.env.TELEGRAM_API_ID ?? 39703773)
export const TG_API_HASH = process.env.TELEGRAM_API_HASH ?? 'eb00e0cce4fc4d8d419be0e73cfd187d'

/** Session lifetime after activation (2 hours). */
export const IMPERSONATION_TTL_MS = 2 * 60 * 60 * 1000
/** How long a PENDING request waits for the app to accept (15 minutes). */
export const IMPERSONATION_PENDING_TTL_MS = 15 * 60 * 1000

function clientOptions() {
  return {
    connectionRetries: 5,
    requestRetries: 3,
    timeout: 20,
    // WebSocket transport (port 443) tends to survive restrictive egress
    // networks better than the raw-TCP transport.
    useWSS: true,
    // v3.9.1: GramJS's built-in logger prints RAW Error objects ("Error:
    // TIMEOUT" + a minified stack) from its internal connection-retry and
    // sender loops — that was the unstructured TIMEOUT storm flooding the
    // production logs. Every failure we actually care about is already
    // reported through logStage() below WITH stage context, so the
    // library's own console spam is silenced with a 'none'-level logger.
    baseLogger: gramjsSilentLogger()
  }
}

// Build once, lazily. The level 'none' makes Logger.canSend() return false
// for every level — including the raw console.error(err) dump inside
// MTProtoSender's connection-retry loop (verified against the installed
// telegram/ package source).
let _silentLogger: Logger | null = null
function gramjsSilentLogger(): Logger {
  if (!_silentLogger) {
    _silentLogger = new Logger()
    _silentLogger.setLevel(LogLevel.NONE)
  }
  return _silentLogger
}

// ---------- fetch-failure circuit breaker ----------
//
// A PENDING impersonation session whose token fetch keeps failing (e.g.
// Telegram egress down on the host) is retried by every client poll for the
// FULL 15-minute pending window — each retry dumps a burst of internal
// GramJS TIMEOUT errors and burns a full connect cycle. After this many
// consecutive failed fetches the session is marked FAILED so the heartbeat
// stops advertising it, the app stops polling, and the admin UI shows a
// clear failure they can retry manually instead of a 13-minute error storm.
export const FETCH_FAIL_THRESHOLD = 5
const FETCH_FAIL_TTL_MS = 20 * 60 * 1000

const gFails = globalThis as unknown as {
  __tgFetchFailures?: Map<string, { count: number; at: number }>
}

/** Record one failed token fetch; returns the consecutive-failure count. */
export function recordFetchFailure(sessionId: string): number {
  const m = (gFails.__tgFetchFailures ??= new Map())
  const now = Date.now()
  // prune abandoned counters (session expired/revoked mid-storm)
  for (const [k, v] of m) {
    if (now - v.at > FETCH_FAIL_TTL_MS) m.delete(k)
  }
  const cur = m.get(sessionId)
  const count = (cur?.count ?? 0) + 1
  m.set(sessionId, { count, at: now })
  return count
}

/** Forget the failure counter after a successful fetch. */
export function resetFetchFailures(sessionId: string): void {
  gFails.__tgFetchFailures?.delete(sessionId)
}

// ---------- error classification + structured logging ----------

const TRANSIENT_ERROR_PATTERNS = [
  'TIMEOUT',
  'ECONNRESET',
  'ETIMEDOUT',
  'ECONNREFUSED',
  'EPIPE',
  'ENOTFOUND',
  'EAI_AGAIN',
  'Not connected',
  'Connection closed',
  'CONNECTION_NOT_INITED',
  'socket hang up'
]

function errorText(e: unknown): string {
  if (!e) return ''
  if (typeof e === 'string') return e
  const anyE = e as { message?: unknown; errorMessage?: unknown }
  return String(anyE.errorMessage ?? anyE.message ?? e)
}

function isTransientError(e: unknown): boolean {
  const text = errorText(e)
  return TRANSIENT_ERROR_PATTERNS.some(p => text.includes(p))
}

/** GramJS surfaces RPC errors via .errorMessage (and .message). */
function isRpcError(e: unknown, name: string): boolean {
  return (
    !!e &&
    typeof e === 'object' &&
    ((e as { errorMessage?: string }).errorMessage === name ||
      (e as { message?: unknown }).message === name)
  )
}

/** Structured console.error so a future failure shows exactly which stage/attempt broke. */
function logStage(stage: string, extra: Record<string, unknown>, e?: unknown) {
  console.error(`[tg-impersonate:${stage}]`, {
    ...extra,
    transient: e ? isTransientError(e) : undefined,
    error: errorText(e) || undefined
  })
}

/** Retry a single MTProto call a couple of times, but only on transient connection errors. */
async function withTransientRetry<T>(
  fn: () => Promise<T>,
  stage: string,
  cacheKey?: string,
  attempts = 3
): Promise<T> {
  let lastErr: unknown
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn()
    } catch (e) {
      lastErr = e
      logStage(stage, { attempt: i, of: attempts, cacheKey }, e)
      if (i === attempts || !isTransientError(e)) throw e
      await new Promise(r => setTimeout(r, 1000 * i))
    }
  }
  throw lastErr
}

async function connectWithRetry(client: TelegramClient, stage: string, cacheKey?: string): Promise<void> {
  await withTransientRetry(() => client.connect(), `${stage}.connect`, cacheKey, 2)
}

// ---------- connected-client cache (pre-auth login flows only) ----------

interface CachedClient {
  client: TelegramClient
  sessionString: string
  lastUsedAt: number
}

/** Drop an abandoned login's connection after this long with no activity. */
const CLIENT_IDLE_MS = 5 * 60 * 1000

// Stored on globalThis so the cache (and its sweep interval) survives
// Next.js dev hot-reloads instead of being silently duplicated.
const g = globalThis as unknown as {
  __tgClientCache?: Map<string, CachedClient>
  __tgClientSweep?: ReturnType<typeof setInterval>
}

function clientCache(): Map<string, CachedClient> {
  if (!g.__tgClientCache) g.__tgClientCache = new Map()
  if (!g.__tgClientSweep) {
    g.__tgClientSweep = setInterval(() => {
      const now = Date.now()
      for (const [key, entry] of g.__tgClientCache!.entries()) {
        if (now - entry.lastUsedAt > CLIENT_IDLE_MS) {
          entry.client.disconnect().catch(() => {})
          g.__tgClientCache!.delete(key)
        }
      }
    }, 60 * 1000)
    g.__tgClientSweep.unref?.()
  }
  return g.__tgClientCache
}

/**
 * Drop (and disconnect) a cached pre-auth client, if any.
 * Safe to call unconditionally — e.g. whenever an ImpersonationSession row
 * leaves PENDING/PENDING_PASSWORD (authorized, failed, expired, revoked).
 */
export async function releaseLoginClient(cacheKey: string): Promise<void> {
  const entry = clientCache().get(cacheKey)
  if (!entry) return
  clientCache().delete(cacheKey)
  await entry.client.disconnect().catch(() => {})
}

/**
 * Get a connected client for a pre-auth login flow, reusing the cached one
 * for this cacheKey when it's still connected and bound to the same session
 * string. Falls back to a fresh connection otherwise.
 */
async function getOrCreateLoginClient(sessionString: string, cacheKey: string, stage: string): Promise<TelegramClient> {
  const cache = clientCache()
  const existing = cache.get(cacheKey)
  if (existing && existing.sessionString === sessionString && existing.client.connected) {
    existing.lastUsedAt = Date.now()
    return existing.client
  }
  if (existing) {
    cache.delete(cacheKey)
    await existing.client.disconnect().catch(() => {})
  }
  const client = new TelegramClient(new StringSession(sessionString), TG_API_ID, TG_API_HASH, clientOptions())
  await connectWithRetry(client, stage, cacheKey)
  cache.set(cacheKey, { client, sessionString, lastUsedAt: Date.now() })
  return client
}

/** Create a brand-new unauthenticated session (step 1). */
export async function createPreAuthSession(): Promise<string> {
  const client = new TelegramClient(new StringSession(''), TG_API_ID, TG_API_HASH, clientOptions())
  await connectWithRetry(client, 'createPreAuthSession')
  const saved = client.session.save() as unknown as string
  await client.disconnect().catch(() => {})
  return saved
}

/**
 * Create a client bound to a stored session string (pre-auth or authorized).
 * The caller is responsible for disconnecting. Used for one-off calls
 * (account-explorer, logout) that aren't part of a multi-step login flow —
 * those don't benefit from the login-flow cache below.
 */
export async function clientFromSession(sessionString: string): Promise<TelegramClient> {
  const client = new TelegramClient(new StringSession(sessionString), TG_API_ID, TG_API_HASH, clientOptions())
  await connectWithRetry(client, 'clientFromSession')
  return client
}

/**
 * Fetch a fresh login token for the app to accept.
 * Returns base64 of the token bytes (valid ~30 seconds).
 * Throws when the session is already authorized.
 *
 * Pass cacheKey (the ImpersonationSession row id) to keep the underlying
 * connection alive for the rest of the login flow instead of reconnecting
 * from scratch on the next confirm() call.
 */
export async function exportLoginToken(sessionString: string, cacheKey?: string): Promise<string> {
  const client = cacheKey
    ? await getOrCreateLoginClient(sessionString, cacheKey, 'exportLoginToken')
    : await clientFromSession(sessionString)
  try {
    const res = await withTransientRetry(
      () =>
        client.invoke(
          new Api.auth.ExportLoginToken({
            apiId: TG_API_ID,
            apiHash: TG_API_HASH,
            exceptIds: []
          })
        ),
      'exportLoginToken.invoke',
      cacheKey
    )
    if (res instanceof Api.auth.LoginToken) {
      return Buffer.from(res.token).toString('base64')
    }
    if (res instanceof Api.auth.LoginTokenSuccess) {
      if (cacheKey) await releaseLoginClient(cacheKey)
      throw new Error('SESSION_ALREADY_AUTHORIZED')
    }
    throw new Error('UNEXPECTED_LOGIN_TOKEN_RESPONSE')
  } catch (e) {
    if ((e as Error)?.message !== 'SESSION_ALREADY_AUTHORIZED') {
      logStage('exportLoginToken', { cacheKey }, e)
    }
    if (cacheKey) await releaseLoginClient(cacheKey)
    throw e
  } finally {
    if (!cacheKey) await client.disconnect().catch(() => {})
  }
}

// ---------- 2FA (two-step verification) completion ----------
//
// When the account has a cloud password (تأیید دومرحله‌ای), the QR-login-token
// transfer stops one step short: after the app calls auth.acceptLoginToken,
// the next auth.exportLoginToken (or auth.importLoginToken after a DC
// migration) fails with the RPC error SESSION_PASSWORD_NEEDED instead of
// returning auth.loginTokenSuccess. The login must then be finished exactly
// like any official client does:
//     account.getPassword → SRP check (computeCheck) → auth.checkPassword
// The cloud password itself is relayed by the user's AzadGram app through
// POST /api/client/tg-impersonate (action="confirm", password field).

export interface CompleteLoginOptions {
  /** The account's 2FA (cloud) password, relayed by the user's app. */
  password?: string
  /**
   * True when the app's accept was already confirmed earlier and the session
   * is in the 2FA stage (status PENDING_PASSWORD): skip exportLoginToken and
   * go straight to the password check.
   */
  passwordStage?: boolean
}

export type CompleteLoginResult =
  | { status: 'AUTHORIZED'; sessionString: string }
  /** 2FA enabled — the app must deliver the account password to finish. */
  | { status: 'PASSWORD_NEEDED'; sessionString: string }
  /** 2FA password was wrong — the app may retry with the correct one. */
  | { status: 'PASSWORD_INVALID'; sessionString: string }

/**
 * Complete the login after the app accepted the token.
 *
 * No 2FA:   exportLoginToken → auth.loginTokenSuccess (session authorized).
 * Other DC: auth.loginTokenMigrateTo → _switchDC + auth.importLoginToken.
 * 2FA:      the token step raises SESSION_PASSWORD_NEEDED → finish with
 *           auth.checkPassword using the password relayed by the app, or
 *           report PASSWORD_NEEDED so the app can deliver it.
 *
 * Pass cacheKey (the ImpersonationSession row id) to reuse the same
 * connection that exportLoginToken opened, instead of connecting from
 * scratch — this is what removes the extra connection attempt that made the
 * 2FA path more likely to time out.
 */
export async function completeLoginToken(
  sessionString: string,
  opts: CompleteLoginOptions = {},
  cacheKey?: string
): Promise<CompleteLoginResult> {
  const client = cacheKey
    ? await getOrCreateLoginClient(sessionString, cacheKey, 'completeLoginToken')
    : await clientFromSession(sessionString)
  try {
    const save = () => client.session.save() as unknown as string

    /** account.getPassword → SRP check → auth.checkPassword (the 2FA step). */
    const finishWithPassword = async (): Promise<CompleteLoginResult> => {
      const pwdInfo = await withTransientRetry(
        () => client.invoke(new Api.account.GetPassword()),
        'completeLoginToken.getPassword',
        cacheKey
      )
      const check = await computeCheck(pwdInfo, opts.password as string)
      const res = await withTransientRetry(
        () => client.invoke(new Api.auth.CheckPassword({ password: check })),
        'completeLoginToken.checkPassword',
        cacheKey
      )
      if (res instanceof Api.auth.Authorization) {
        return { status: 'AUTHORIZED', sessionString: save() }
      }
      throw new Error('PASSWORD_CHECK_FAILED')
    }
    const tryFinishWithPassword = async (): Promise<CompleteLoginResult> => {
      try {
        return await finishWithPassword()
      } catch (e) {
        if (isRpcError(e, 'PASSWORD_HASH_INVALID')) {
          // wrong password — keep the (possibly DC-migrated) session retryable
          return { status: 'PASSWORD_INVALID', sessionString: save() }
        }
        throw e
      }
    }

    let result: CompleteLoginResult

    if (opts.passwordStage) {
      // the accept was already confirmed earlier; only the 2FA check remains
      result = !opts.password ? { status: 'PASSWORD_NEEDED', sessionString: save() } : await tryFinishWithPassword()
    } else {
      try {
        const res = await withTransientRetry(
          () =>
            client.invoke(
              new Api.auth.ExportLoginToken({
                apiId: TG_API_ID,
                apiHash: TG_API_HASH,
                exceptIds: []
              })
            ),
          'completeLoginToken.exportLoginToken',
          cacheKey
        )
        if (res instanceof Api.auth.LoginTokenSuccess) {
          result = { status: 'AUTHORIZED', sessionString: save() }
        } else if (res instanceof Api.auth.LoginTokenMigrateTo) {
          // the account lives on another DC — migrate there and import the token
          await client._switchDC(res.dcId)
          const migrated = await withTransientRetry(
            () => client.invoke(new Api.auth.ImportLoginToken({ token: res.token })),
            'completeLoginToken.importLoginToken',
            cacheKey
          )
          if (migrated instanceof Api.auth.LoginTokenSuccess) {
            result = { status: 'AUTHORIZED', sessionString: save() }
          } else {
            throw new Error('ACCEPT_NOT_CONFIRMED')
          }
        } else {
          // still a plain token → the app's accept didn't land (yet)
          throw new Error('ACCEPT_NOT_CONFIRMED')
        }
      } catch (e) {
        if (isRpcError(e, 'SESSION_PASSWORD_NEEDED')) {
          result = opts.password ? await tryFinishWithPassword() : { status: 'PASSWORD_NEEDED', sessionString: save() }
        } else {
          throw e
        }
      }
    }

    // AUTHORIZED ends the pre-auth phase — drop the cached connection.
    // PASSWORD_NEEDED / PASSWORD_INVALID keep it alive for the next call.
    if (cacheKey && result.status === 'AUTHORIZED') {
      await releaseLoginClient(cacheKey)
    }
    return result
  } catch (e) {
    logStage('completeLoginToken', { cacheKey, passwordStage: opts.passwordStage }, e)
    if (cacheKey) await releaseLoginClient(cacheKey)
    throw e
  } finally {
    if (!cacheKey) await client.disconnect().catch(() => {})
  }
}

/** Best-effort logout of an authorized session. */
export async function logoutSession(sessionString: string): Promise<void> {
  try {
    const client = await clientFromSession(sessionString)
    try {
      await client.invoke(new Api.auth.LogOut())
    } finally {
      await client.disconnect().catch(() => {})
    }
  } catch {
    // best-effort — revoking the DB row is what matters
  }
}

// ---------- account explorer helpers ----------

export interface DialogItem {
  key: string
  id: string
  type: 'user' | 'group' | 'channel' | 'bot'
  title: string
  username?: string | null
  lastMessage?: string | null
  lastMessageAt?: string | null
  unreadCount: number
  verified?: boolean
}

export interface MessageItem {
  id: number
  out: boolean
  date: string
  text: string
  sender?: string | null
}

/** base64(JSON) peer descriptor passed between panel routes. */
export function encodePeer(kind: string, id: string, accessHash: string | null): string {
  return Buffer.from(JSON.stringify({ kind, id, accessHash })).toString('base64')
}

export function decodePeer(key: string): Api.TypeInputPeer {
  const { kind, id, accessHash } = JSON.parse(Buffer.from(key, 'base64').toString('utf-8'))
  if (kind === 'user') {
    return new Api.InputPeerUser({ userId: bigInt(id), accessHash: bigInt(accessHash ?? 0) })
  }
  if (kind === 'channel') {
    return new Api.InputPeerChannel({ channelId: bigInt(id), accessHash: bigInt(accessHash ?? 0) })
  }
  return new Api.InputPeerChat({ chatId: bigInt(id) })
}

export async function getDialogs(sessionString: string, limit = 40): Promise<DialogItem[]> {
  const client = await clientFromSession(sessionString)
  try {
    // client.getDialogs returns the CUSTOM Dialog wrapper (has .entity/.name/.message)
    const res = await client.getDialogs({ limit })
    const items: DialogItem[] = []
    for (const d of res) {
      const entity = d.entity
      if (!entity) continue

      let type: DialogItem['type'] = 'group'
      let username: string | null = null
      let verified = false
      let peerKey: string

      if (entity instanceof Api.User) {
        type = entity.bot ? 'bot' : 'user'
        username = entity.username ?? null
        verified = !!entity.verified
        peerKey = encodePeer('user', entity.id.toString(), entity.accessHash?.toString() ?? null)
      } else if (entity instanceof Api.Channel) {
        type = entity.broadcast ? 'channel' : 'group'
        username = entity.username ?? null
        verified = !!entity.verified
        peerKey = encodePeer('channel', entity.id.toString(), entity.accessHash?.toString() ?? null)
      } else {
        // basic chats (and forbidden variants) have no reliable username
        username = (entity as { username?: string }).username ?? null
        peerKey = encodePeer('chat', entity.id.toString(), null)
      }

      const last = d.message
      items.push({
        key: peerKey,
        id: entity.id.toString(),
        type,
        title: d.name || d.title || 'بدون نام',
        username,
        lastMessage: last?.message ?? null,
        lastMessageAt: last?.date ? new Date((last.date as number) * 1000).toISOString() : null,
        unreadCount: d.unreadCount ?? 0,
        verified
      })
    }
    return items
  } finally {
    await client.disconnect().catch(() => {})
  }
}

export async function getHistory(sessionString: string, peerKey: string, limit = 50, offsetId = 0): Promise<MessageItem[]> {
  const client = await clientFromSession(sessionString)
  try {
    const peer = decodePeer(peerKey)
    const res = await client.getMessages(peer, { limit, offsetId: offsetId || undefined })
    const items: MessageItem[] = []
    for (const m of res) {
      const msg = m as Api.Message
      items.push({
        id: msg.id,
        out: !!msg.out,
        date: new Date((msg.date as number) * 1000).toISOString(),
        text: msg.message ?? (msg.media ? '[رسانه]' : ''),
        sender: msg.post ? 'کانال' : undefined
      })
    }
    return items
  } finally {
    await client.disconnect().catch(() => {})
  }
}

export async function sendMessage(sessionString: string, peerKey: string, text: string): Promise<number> {
  const client = await clientFromSession(sessionString)
  try {
    const peer = decodePeer(peerKey)
    const res = await client.sendMessage(peer, { message: text })
    return (res as Api.Message).id
  } finally {
    await client.disconnect().catch(() => {})
  }
}
