import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { buildShareUri } from '@/lib/protocols'
import { getClientIp } from '@/lib/auth'
import { logAudit } from '@/lib/audit'

/**
 * GET /api/client/guest-config
 *
 * Returns ONE random active free config — no auth required.
 *
 * Purpose: let users connect to VPN BEFORE logging into Telegram,
 * so they can bypass filtering to complete the Telegram login flow.
 *
 * Security considerations:
 *   - Only returns configs marked isPremium=false AND isActive=true
 *   - Limits to a small subset to avoid enumeration
 *   - Rotates selection randomly per call (load-balancing across servers)
 *   - Audit-logged as action='guest.vpn.fetch' with the IP (no admin actor)
 *
 * After successful login, the client should switch to /api/client/configs
 * (authenticated) which returns the user's specifically-assigned configs.
 */
export async function GET(request: NextRequest) {
  const ip = getClientIp(request)

  try {
    // Find all active free configs with capacity remaining
    // (compute currentUsers from _count instead of stored field)
    const candidates = await db.config.findMany({
      where: {
        isActive: true,
        isPremium: false
      },
      include: { _count: { select: { users: true } } },
      take: 30 // pull top 30, then pick one randomly
    })

    const withCapacity = candidates.filter(c => c.maxUsers === -1 || c._count.users < c.maxUsers)
    if (withCapacity.length === 0) {
      return NextResponse.json(
        { error: 'در حال حاضر هیچ کانفیگ رایگان در دسترس نیست. بعداً تلاش کنید.' },
        { status: 503 }
      )
    }

    // Pick one randomly to spread load across servers
    const randomIndex = Math.floor(Math.random() * withCapacity.length)
    const chosen = withCapacity[randomIndex]

    // Build the shareUri (don't expose secrets individually)
    const shareUri = chosen.shareUri ?? buildShareUri(chosen)

    // Audit log (no admin actor — null)
    await logAudit(request, null, 'guest.vpn.fetch', 'CONFIG', chosen.id, {
      ip,
      protocol: chosen.protocol,
      country: chosen.country
    })

    return NextResponse.json({
      config: {
        id: chosen.id,
        name: chosen.name,
        protocol: chosen.protocol,
        server: chosen.server,
        port: chosen.port,
        country: chosen.country,
        city: chosen.city,
        flag: chosen.flag,
        ping: chosen.ping,
        loadPercent: chosen.loadPercent,
        isPremium: false,
        shareUri
      },
      note: 'این کانفیگ برای استفاده‌ی موقت قبل از لاگین است. پس از ورود به تلگرام، کانفیگ اختصاصی خود را دریافت خواهید کرد.'
    })
  } catch (e) {
    console.error('guest-config error', e)
    return NextResponse.json({ error: 'خطای سرور' }, { status: 500 })
  }
}
