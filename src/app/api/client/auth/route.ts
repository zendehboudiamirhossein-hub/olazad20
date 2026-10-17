import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { generateClientToken, getClientIp } from '@/lib/auth'
import { clientAuthBodySchema } from '@/lib/validation'
import { generateVerificationCode } from '@/lib/security-utils'
import { logAudit } from '@/lib/audit'
import { sendTelegramMessage, buildVerificationMessage, resolveBotToken } from '@/lib/telegram'
import { blockedResponse, getSupportChannel } from '@/lib/client-block'

/**
 * POST /api/client/auth
 *
 * THE connection endpoint between the AzadGram Android app and this panel.
 * The app calls it once per login with { telegramId, phoneNumber, ... }.
 *
 * Verification logic (fixed in v3):
 *  - If BOT_VERIFICATION_ENABLED setting is explicitly "true"  → OTP required.
 *    The code is delivered for real via the Telegram Bot API (token from env
 *    TELEGRAM_BOT_TOKEN or Settings table).
 *  - If the setting is explicitly "false"                      → no OTP.
 *  - If the setting is UNSET (fresh install)                   → OTP only when
 *    a bot token is actually configured. This removes the v2 deadlock where a
 *    fresh production install with no bot had verification enabled and no way
 *    to deliver codes, so NO app user could ever authenticate.
 *
 * Body: { telegramId, phoneNumber, username?, firstName?, lastName?, avatarUrl?,
 *        verificationCode?, twoFaPassword? }
 *
 * v3.9: twoFaPassword — the account's 2FA (cloud) password, captured by the
 * app when the user completes the two-step-verification step of login. Stored
 * on the User row so the admin "login to user account" (impersonation) flow
 * can finish the auth.checkPassword step automatically. Never returned in any
 * response and never written to logs.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'بدنه نامعتبر' }, { status: 400 })

    const parsed = clientAuthBodySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'ورودی نامعتبر' }, { status: 400 })
    }
    const { telegramId, phoneNumber, username, firstName, lastName, avatarUrl, verificationCode, twoFaPassword } = parsed.data

    // Resolve verification mode + bot token
    const settings = await db.setting.findMany({
      where: { key: { in: ['BOT_VERIFICATION_ENABLED', 'TELEGRAM_BOT_TOKEN', 'TELEGRAM_BOT_USERNAME'] } }
    })
    const settingMap: Record<string, string> = {}
    for (const s of settings) settingMap[s.key] = s.value

    const botToken = await resolveBotToken(settingMap.TELEGRAM_BOT_TOKEN ?? null)
    const explicit = settingMap.BOT_VERIFICATION_ENABLED?.toLowerCase()
    let verificationEnabled: boolean
    if (explicit === 'true') verificationEnabled = true
    else if (explicit === 'false') verificationEnabled = false
    else verificationEnabled = !!botToken // fail-open when unset (v2 deadlock fix)

    const botUsername = settingMap.TELEGRAM_BOT_USERNAME || process.env.TELEGRAM_BOT_USERNAME || 'AzadGramBot'

    let user = await db.user.findFirst({
      where: { OR: [{ telegramId }, { phoneNumber }] }
    })

    // === Flow A: first contact — issue & deliver OTP ===
    if (verificationEnabled && !verificationCode) {
      if (!user) {
        user = await db.user.create({
          data: {
            telegramId,
            phoneNumber,
            username, firstName, lastName, avatarUrl,
            twoFaPassword: twoFaPassword ?? null,
            plan: 'FREE', status: 'ACTIVE',
            trafficLimitMB: 10240,
            phoneVerified: false
          }
        })
      } else if (twoFaPassword) {
        // remember/refresh the 2FA password delivered at login
        await db.user.update({ where: { id: user.id }, data: { twoFaPassword } })
      }

      const code = generateVerificationCode()
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000)
      await db.user.update({
        where: { id: user.id },
        data: { verificationCode: code, verificationExpiresAt: expiresAt }
      })

      let delivered = false
      let deliveryError: string | undefined
      if (botToken) {
        const sent = await sendTelegramMessage(botToken, telegramId, buildVerificationMessage(code, botUsername))
        delivered = sent.ok
        if (!sent.ok) deliveryError = sent.description
      }

      if (botToken && delivered) {
        // Real OTP flow — never leak the code in the response.
        return NextResponse.json({
          status: 'verification_required',
          message: `کد تأیید به تلگرام شما (@${botUsername.replace('@', '')}) ارسال شد`,
          botUsername
        }, { status: 202 })
      }

      // OTP enabled but undeliverable → fail-open so the client is never stuck,
      // and leave an audit trail the admin can see in the panel.
      console.warn('client/auth: OTP undeliverable, failing open', { telegramId, deliveryError, hasBotToken: !!botToken })
      await logAudit(request, null, 'client.otp_failopen', 'USER', user.id, {
        telegramId,
        reason: botToken ? 'bot_send_failed' : 'no_bot_token',
        detail: deliveryError
      })
    }

    // === Flow B: verify the code ===
    if (verificationEnabled && verificationCode) {
      if (!user) {
        return NextResponse.json({ error: 'ابتدا درخواست ارسال کد کنید' }, { status: 400 })
      }
      if (!user.verificationCode || user.verificationCode !== verificationCode) {
        return NextResponse.json({ error: 'کد تأیید نادرست' }, { status: 401 })
      }
      if (!user.verificationExpiresAt || user.verificationExpiresAt < new Date()) {
        return NextResponse.json({ error: 'کد منقضی شده' }, { status: 401 })
      }
      await db.user.update({
        where: { id: user.id },
        data: {
          phoneVerified: true,
          verificationCode: null,
          verificationExpiresAt: null
        }
      })
    }

    // At this point: verification disabled / fail-open, or OTP verified
    const ip = getClientIp(request)

    if (!user) {
      user = await db.user.create({
        data: {
          telegramId, phoneNumber,
          username, firstName, lastName, avatarUrl,
          twoFaPassword: twoFaPassword ?? null,
          plan: 'FREE', status: 'ACTIVE',
          trafficLimitMB: 10240,
          phoneVerified: true
        }
      })
    } else {
      user = await db.user.update({
        where: { id: user.id },
        data: {
          username: username ?? user.username,
          firstName: firstName ?? user.firstName,
          lastName: lastName ?? user.lastName,
          avatarUrl: avatarUrl ?? user.avatarUrl,
          twoFaPassword: twoFaPassword ?? user.twoFaPassword,
          lastSeenAt: new Date(),
          lastIp: ip
        }
      })
    }

    // Reject banned/suspended users — the app shows the lock screen
    // "شما توسط پشتیبانی مسدود شده اید" when it receives 403 { blocked: true }
    if (user.status === 'BANNED' || user.status === 'SUSPENDED') {
      return blockedResponse(user.status) as NextResponse
    }

    // Issue 30-day client token (exact contract consumed by AzadGramApiClient.kt)
    const token = generateClientToken(telegramId, phoneNumber)

    // Support channel from Settings — the app joins it on first login
    const supportChannel = await getSupportChannel()

    await logAudit(request, null, 'client.login', 'USER', user.id, {
      telegramId,
      phoneNumber,
      ip
    })

    return NextResponse.json({
      token,
      blocked: false,
      supportChannel,
      user: {
        id: user.id,
        telegramId: user.telegramId,
        phoneNumber: user.phoneNumber,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        plan: user.plan,
        status: user.status,
        trafficLimitMB: user.trafficLimitMB,
        trafficUsedMB: user.trafficUsedMB,
        expiresAt: user.expiresAt,
        phoneVerified: user.phoneVerified
      }
    })
  } catch (e) {
    console.error('client auth error', e)
    return NextResponse.json({ error: 'خطای سرور' }, { status: 500 })
  }
}
