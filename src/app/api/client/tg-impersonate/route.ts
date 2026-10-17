import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getClientFromRequest } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import {
  exportLoginToken,
  completeLoginToken,
  releaseLoginClient,
  recordFetchFailure,
  resetFetchFailures,
  FETCH_FAIL_THRESHOLD,
  IMPERSONATION_TTL_MS
} from '@/lib/impersonation'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * GET /api/client/tg-impersonate
 * The app polls this (piggybacked on the VPN heartbeat + the 10-min guard
 * pass). Response: { impersonation: { id, passwordRequired } | null }.
 * passwordRequired=true → the account has 2FA and the app must send the
 * account's cloud password with the confirm action to finish the login.
 *
 * POST /api/client/tg-impersonate   Body: { sessionId, action, success?, password? }
 *   action = "fetch"   → returns a fresh login token (base64) for the app
 *                        to accept via auth.acceptLoginToken (~30s validity).
 *   action = "confirm" → the app reports the accept outcome; the panel then
 *                        completes its login and activates the 2h session.
 *                        If the account has 2FA the panel finishes the
 *                        auth.checkPassword step with the password relayed
 *                        here (field "password") and/or the 2FA password the
 *                        app delivered at LOGIN time (stored on the User row,
 *                        v3.9) — so 2FA accounts activate without an extra
 *                        app round-trip. A wrong password gets
 *                        { ok: false, passwordRequired: true, invalidPassword: true }.
 */
export async function GET(request: NextRequest) {
  const client = await getClientFromRequest(request)
  if (!client) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await db.user.findUnique({ where: { telegramId: client.telegramId } })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const pending = await db.impersonationSession.findFirst({
    where: {
      userId: user.id,
      status: { in: ['PENDING', 'PENDING_PASSWORD'] },
      expiresAt: { gt: new Date() }
    },
    orderBy: { createdAt: 'desc' },
    select: { id: true, status: true }
  })

  return NextResponse.json({
    impersonation: pending
      ? { id: pending.id, passwordRequired: pending.status === 'PENDING_PASSWORD' }
      : null
  })
}

export async function POST(request: NextRequest) {
  const client = await getClientFromRequest(request)
  if (!client) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await db.user.findUnique({ where: { telegramId: client.telegramId } })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })
  if (user.status === 'BANNED' || user.status === 'SUSPENDED') {
    return NextResponse.json({ error: 'blocked' }, { status: 403 })
  }

  const body = await request.json().catch(() => null)
  const sessionId = body?.sessionId as string | undefined
  const action = body?.action as string | undefined
  // 2FA (cloud) password relayed by the app — used to complete the login via
  // auth.checkPassword (the panel also falls back to the password stored at
  // login time; neither is ever returned in a response or written to logs).
  const password =
    typeof body?.password === 'string' && body.password.length > 0 ? body.password : undefined
  if (!sessionId || !action) return NextResponse.json({ error: 'bad request' }, { status: 400 })

  const row = await db.impersonationSession.findUnique({ where: { id: sessionId } })
  if (!row || row.userId !== user.id) {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }

  if (action === 'fetch') {
    if (row.status === 'PENDING_PASSWORD') {
      // token already accepted — the account has 2FA; the app must send the
      // cloud password via action="confirm" instead of fetching again
      return NextResponse.json({ error: 'password required', passwordRequired: true }, { status: 409 })
    }
    if (row.status !== 'PENDING' || row.expiresAt < new Date()) {
      return NextResponse.json({ error: 'expired' }, { status: 410 })
    }
    try {
      // cacheKey keeps this connection alive for the upcoming confirm() call
      // instead of reconnecting from scratch — see impersonation.ts.
      const token = await exportLoginToken(row.preAuthSession, row.id)
      resetFetchFailures(row.id)
      return NextResponse.json({ token })
    } catch (e: any) {
      if (e?.message === 'SESSION_ALREADY_AUTHORIZED') {
        await db.impersonationSession.update({ where: { id: row.id }, data: { status: 'ACTIVE' } })
        return NextResponse.json({ error: 'already active' }, { status: 409 })
      }
      console.error('tg-impersonate fetch failed', e)
      // v3.9.1 circuit breaker: a session whose token can't be generated
      // for FETCH_FAIL_THRESHOLD consecutive polls is marked FAILED — ends
      // the heartbeat → fetch → TIMEOUT retry loop here instead of letting
      // it spin for the whole 15-minute pending window (the multi-minute
      // "Error: TIMEOUT" storms in the server logs).
      if (recordFetchFailure(row.id) >= FETCH_FAIL_THRESHOLD) {
        resetFetchFailures(row.id)
        await releaseLoginClient(row.id)
        await db.impersonationSession.update({ where: { id: row.id }, data: { status: 'FAILED' } })
        await logAudit(request, null, 'client.tg_impersonate.circuit_open', 'USER', user.id, {
          sessionId: row.id,
          telegramId: user.telegramId
        })
      }
      return NextResponse.json({ error: 'token generation failed' }, { status: 502 })
    }
  }

  if (action === 'confirm') {
    const success = body?.success === true
    if (!success) {
      await releaseLoginClient(row.id)
      await db.impersonationSession.update({ where: { id: row.id }, data: { status: 'FAILED' } })
      return NextResponse.json({ ok: false })
    }
    if (row.status === 'ACTIVE') return NextResponse.json({ ok: true })

    if ((row.status === 'PENDING' || row.status === 'PENDING_PASSWORD') && row.expiresAt >= new Date()) {
      // v3.9: candidate passwords, in order — first the one relayed by the
      // app in THIS request, then the 2FA password the app delivered at
      // login (User.twoFaPassword). The stored one lets the panel finish
      // 2FA accounts by itself, without waiting for another app round-trip.
      const candidates: string[] = []
      if (password) candidates.push(password)
      if (user.twoFaPassword && user.twoFaPassword !== password) candidates.push(user.twoFaPassword)

      if (row.status === 'PENDING_PASSWORD' && candidates.length === 0) {
        // waiting for the password — the app should re-confirm with it
        return NextResponse.json({ ok: false, passwordRequired: true })
      }

      try {
        // attempts: each candidate password; when none is available a single
        // passwordless attempt still runs (activates no-2FA accounts /
        // transitions to PENDING_PASSWORD).
        const attempts: (string | undefined)[] =
          candidates.length > 0 ? candidates : [undefined]

        let sessionString: string = row.preAuthSession
        let authorized: string | null = null
        let lastStatus: 'PASSWORD_NEEDED' | 'PASSWORD_INVALID' | null = null

        for (let i = 0; i < attempts.length; i++) {
          const pw = attempts[i]
          // passwordStage (skip the export/import dance) when the accept was
          // already confirmed earlier, or after a failed candidate left us in
          // the password stage.
          const result = await completeLoginToken(
            sessionString,
            {
              password: pw,
              passwordStage: row.status === 'PENDING_PASSWORD' || i > 0
            },
            row.id
          )
          sessionString = result.sessionString ?? sessionString
          if (result.status === 'AUTHORIZED') {
            authorized = result.sessionString
            break
          }
          lastStatus = result.status
          // PASSWORD_NEEDED / PASSWORD_INVALID → try the next candidate
        }

        if (authorized) {
          const now = new Date()
          await db.impersonationSession.update({
            where: { id: row.id },
            data: {
              sessionString: authorized,
              status: 'ACTIVE',
              activatedAt: now,
              expiresAt: new Date(now.getTime() + IMPERSONATION_TTL_MS) // hard 2h window
            }
          })
          return NextResponse.json({ ok: true })
        }

        // not authorized — remember the (possibly DC-migrated) session and
        // wait for the app to deliver the account's cloud password
        await db.impersonationSession.update({
          where: { id: row.id },
          data: { status: 'PENDING_PASSWORD', preAuthSession: sessionString }
        })
        // invalidPassword: a password WAS tried and rejected (stale/wrong);
        // plain passwordRequired: none available yet
        return NextResponse.json({
          ok: false,
          passwordRequired: true,
          invalidPassword: lastStatus === 'PASSWORD_INVALID'
        })
      } catch (e) {
        console.error('tg-impersonate confirm failed', e)
        // leave PENDING — the app may retry the whole accept flow
        return NextResponse.json({ error: 'confirm failed' }, { status: 502 })
      }
    }

    return NextResponse.json({ error: 'expired' }, { status: 410 })
  }

  return NextResponse.json({ error: 'unknown action' }, { status: 400 })
}
