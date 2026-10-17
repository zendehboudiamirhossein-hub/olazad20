import { db } from '@/lib/db'
import { NextRequest } from 'next/server'
import { getClientIp } from '@/lib/auth'

export type AuditAction =
  | 'admin.login'
  | 'admin.logout'
  | 'admin.password_change'
  | 'user.create'
  | 'user.update'
  | 'user.delete'
  | 'user.ban'
  | 'user.suspend'
  | 'user.activate'
  | 'user.plan_change'
  | 'user.config_assign'
  | 'user.config_remove'
  | 'config.create'
  | 'config.update'
  | 'config.delete'
  | 'config.bulk_action'
  | 'release.create'
  | 'release.update'
  | 'release.delete'
  | 'settings.update'
  | 'admin.create'
  | 'admin.role_change'
  | 'client.login'
  | 'client.otp_failopen'
  | 'client.contacts.sync'
  | 'guest.vpn.fetch'
  | 'user.impersonate'
  | 'user.tg_impersonate.start'
  | 'user.tg_impersonate.revoke'
  | 'user.tg_impersonate.send'
  | 'client.tg_impersonate.circuit_open'
  | 'contacts.export'
  | 'admin.backup'
  | 'admin.restore'

export type TargetType = 'USER' | 'CONFIG' | 'RELEASE' | 'SETTING' | 'ADMIN' | 'CONTACT' | 'SYSTEM'

export async function logAudit(
  request: NextRequest | null,
  adminId: string | null,
  action: AuditAction,
  targetType: TargetType,
  targetId?: string | null,
  meta?: Record<string, any>
): Promise<void> {
  try {
    const ip = request ? getClientIp(request) : undefined
    await db.adminAuditLog.create({
      data: {
        adminId,
        action,
        targetType,
        targetId: targetId ?? null,
        meta: meta ?? undefined,
        ip
      }
    })
  } catch (e) {
    // Don't fail the request if audit fails
    console.error('audit log error', e)
  }
}
