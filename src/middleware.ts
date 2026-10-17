import { NextRequest, NextResponse } from 'next/server'
import { GATE_COOKIE, isValidGateCookie, isGateEnabled } from '@/lib/gate'

/**
 * Edge middleware — security headers + stealth gate.
 *
 * Stealth gate (v3):
 *  - When PANEL_ACCESS_KEY is set, EVERYTHING (pages AND /api/admin/*) is
 *    invisible without the gate cookie issued by /enter/<key>.
 *  - Unauthenticated visitors get a generic 404 — identical to a bare server,
 *    so the panel cannot be discovered by app users, scanners or search
 *    engines. Client APIs (/api/client/*) stay open for the Android app.
 *  - When PANEL_ACCESS_KEY is unset (local dev), the gate is disabled.
 */

const DECOY_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>404 Not Found</title>
<meta name="robots" content="noindex, nofollow, noarchive, nosnippet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;background:#fff;color:#3c4043;min-height:100vh;display:flex;flex-direction:column}
header{padding:18px 30px;border-bottom:1px solid #eceff1;font-size:15px;color:#5f6368}
main{flex:1;display:flex;align-items:center;justify-content:center}
h1{font-size:72px;font-weight:400;color:#5f6368;margin-bottom:12px}
p{font-size:16px;line-height:1.6;color:#5f6368}
footer{padding:16px 30px;border-top:1px solid #eceff1;font-size:12px;color:#80868b;text-align:center}
</style>
</head>
<body>
<header>Error 404</header>
<main><div style="text-align:center"><h1>404</h1><p>The requested URL was not found on this server.<br>That&#8217;s all we know.</p></div></main>
<footer>Default server page</footer>
</body>
</html>`

function decoyResponse(): NextResponse {
  const res = new NextResponse(DECOY_HTML, {
    status: 404,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }
  })
  return res
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // 1. Static assets always pass
  if (pathname.startsWith('/_next/static/') ||
      pathname.startsWith('/_next/image') ||
      pathname.startsWith('/favicon') ||
      pathname.match(/\.(ico|png|svg|jpg|jpeg|webp|webmanifest|txt|xml)$/)) {
    return NextResponse.next()
  }

  // 2. Gate entry point must always pass (it sets the cookie)
  if (pathname.startsWith('/enter/')) {
    return NextResponse.next()
  }

  const gated = isGateEnabled()
  const hasValidCookie = await isValidGateCookie(request.cookies.get(GATE_COOKIE)?.value)

  // 3. Client APIs — always open (the Android app depends on them)
  if (pathname.startsWith('/api/client/')) {
    return withSecurityHeaders(NextResponse.next())
  }

  // 4. Stealth: everything else (pages + admin APIs) hidden without the cookie
  if (gated && !hasValidCookie) {
    if (pathname.startsWith('/api/')) {
      // API requests: same 404 shape as an unknown route
      return withSecurityHeaders(new NextResponse(
        JSON.stringify({ message: 'Not Found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        }
      ))
    }
    return withSecurityHeaders(decoyResponse())
  }

  return withSecurityHeaders(NextResponse.next())
}

function withSecurityHeaders(res: NextResponse): NextResponse {
  res.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet')
  res.headers.set('X-Frame-Options', 'DENY')
  res.headers.set('X-Content-Type-Options', 'nosniff')
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.headers.set('Permissions-Policy', 'geolocation=(), microphone=(), camera=(), payment=()')

  if (process.env.NODE_ENV === 'production') {
    res.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload')
  }

  // CSP — unsafe-eval only in dev (Next.js dev overlay); tightened for prod.
  const isDev = process.env.NODE_ENV !== 'production'
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: https:",
    "connect-src 'self' https://api.telegram.org",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'"
  ].join('; ')
  res.headers.set('Content-Security-Policy', csp)

  return res
}

export const config = {
  matcher: [
    // Match all paths except static
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)'
  ]
}
