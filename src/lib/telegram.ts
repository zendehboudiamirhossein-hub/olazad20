/**
 * Telegram Bot API helper — delivers the 6-digit verification code to the
 * user's Telegram chat when phone verification is enabled.
 *
 * Without a bot token the panel automatically runs in "open" mode (no OTP)
 * so the AzadGram client can connect out of the box.
 */

const BOT_API_BASE = 'https://api.telegram.org'

export interface BotSendResult {
  ok: boolean
  description?: string
}

export async function sendTelegramMessage(botToken: string, chatId: string, text: string): Promise<BotSendResult> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)
    const res = await fetch(`${BOT_API_BASE}/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        disable_web_page_preview: true
      }),
      signal: controller.signal
    })
    clearTimeout(timeout)
    const json: any = await res.json().catch(() => null)
    if (json?.ok) return { ok: true }
    return { ok: false, description: json?.description ?? `HTTP ${res.status}` }
  } catch (e: any) {
    return { ok: false, description: e?.message ?? 'network error' }
  }
}

export function buildVerificationMessage(code: string, botUsername?: string): string {
  const lines = [
    '🔐 آزادگرام',
    '',
    `کد تأیید شما: <code>${code}</code>`,
    '',
    'این کد تا ۵ دقیقه اعتبار دارد.',
    'اگر شما این درخواست را نداده‌اید، این پیام را نادیده بگیرید.'
  ]
  if (botUsername) lines.push('', `ربات: @${botUsername.replace('@', '')}`)
  return lines.join('\n')
}

/**
 * Resolve the effective bot token: env var first, then Settings table value.
 * Returns null when no token is configured.
 */
export async function resolveBotToken(dbSettingValue?: string | null): Promise<string | null> {
  const envToken = process.env.TELEGRAM_BOT_TOKEN?.trim()
  if (envToken) return envToken
  const settingToken = dbSettingValue?.trim()
  if (settingToken) return settingToken
  return null
}
