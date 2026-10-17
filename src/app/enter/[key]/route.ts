import { NextRequest, NextResponse } from 'next/server'
import { GATE_COOKIE, gateCookieValue, getAccessKey, isGateEnabled } from '@/lib/gate'

/**
 * GET /enter/<PANEL_ACCESS_KEY>
 *
 * Stealth entry point: validates the secret key, sets an HttpOnly gate cookie
 * (30 days) and redirects to `/` where the admin panel lives. Any other key
 * just redirects to `/` which renders the neutral decoy page.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params
  const expected = getAccessKey()

  // Relative Location — never bounce the browser to a different host
  // (an absolute URL built from request.url can resolve to 0.0.0.0 behind
  // some proxies, which would orphan the host-scoped cookie).
  const res = new NextResponse(null, { status: 307, headers: { Location: '/' } })

  if (isGateEnabled() && expected && key === expected) {
    // Secure only when the request actually arrived over HTTPS (Railway sets
    // x-forwarded-proto). Over plain HTTP (local test), Secure cookies are
    // dropped by the browser and the gate would never unlock.
    const proto = request.headers.get('x-forwarded-proto') ?? request.nextUrl.protocol.replace(':', '')
    const isHttps = proto === 'https'
    res.cookies.set(GATE_COOKIE, await gateCookieValue(), {
      httpOnly: true,
      secure: isHttps,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30
    })
    res.headers.set('Cache-Control', 'no-store')
  }
  return res
}
