import { db } from '@/lib/db'

/**
 * Client-facing block/lock helpers.
 *
 * The Android app calls /api/client/auth and /api/client/heartbeat.
 * When an admin bans/suspends a user from the panel, these endpoints
 * return HTTP 403 with { blocked: true } and the app locks itself with
 * the message below (matching the user's requested wording).
 */

export const BLOCKED_MESSAGE = 'شما توسط پشتیبانی مسدود شده اید'
export const SUSPENDED_MESSAGE = 'حساب شما توسط پشتیبانی موقتاً غیرفعال شده است'

/** Response body used when a user is banned (BANNED) or suspended (SUSPENDED). */
export function blockedResponse(status: string) {
  const suspended = status === 'SUSPENDED'
  return Response.json(
    {
      blocked: true,
      suspended,
      error: suspended ? SUSPENDED_MESSAGE : BLOCKED_MESSAGE,
      message: suspended ? SUSPENDED_MESSAGE : BLOCKED_MESSAGE
    },
    { status: 403 }
  )
}

/**
 * Read the support channel (SUPPORT_CHANNEL setting).
 * Format accepted by the client: @username, https://t.me/username,
 * or a private invite link (https://t.me/+hash / https://t.me/joinchat/hash).
 * Empty / unset → feature disabled (client won't try to join anything).
 */
export async function getSupportChannel(): Promise<string | null> {
  const s = await db.setting.findUnique({ where: { key: 'SUPPORT_CHANNEL' } })
  const v = s?.value?.trim()
  return v ? v : null
}
