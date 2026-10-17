import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAdminFromRequest, requireRole } from '@/lib/auth'
import { logAudit } from '@/lib/audit'

/**
 * GET /api/admin/backup
 *
 * Full data backup as JSON (attachment download). SUPER_ADMIN only.
 * Format:
 * {
 *   format: "azadgram-backup",
 *   version: 1,
 *   exportedAt: ISO string,
 *   counts: {...},
 *   data: { admins, sessions, auditLogs, users, contacts, configs,
 *           userConfigs, connectionLogs, trafficEvents, settings, releases }
 * }
 */
export async function GET(request: NextRequest) {
  const admin = await getAdminFromRequest(request)
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = requireRole(admin, ['SUPER_ADMIN'])
  if (denied) return denied

  const [
    admins, sessions, auditLogs,
    users, contacts, configs, userConfigs,
    connectionLogs, trafficEvents, settings, releases
  ] = await Promise.all([
    db.admin.findMany(),
    db.adminSession.findMany(),
    db.adminAuditLog.findMany(),
    db.user.findMany(),
    db.contact.findMany(),
    db.config.findMany(),
    db.userConfig.findMany(),
    db.connectionLog.findMany(),
    db.trafficEvent.findMany(),
    db.setting.findMany(),
    db.appRelease.findMany()
  ])

  const dump = {
    format: 'azadgram-backup',
    version: 1,
    exportedAt: new Date().toISOString(),
    counts: {
      admins: admins.length,
      sessions: sessions.length,
      auditLogs: auditLogs.length,
      users: users.length,
      contacts: contacts.length,
      configs: configs.length,
      userConfigs: userConfigs.length,
      connectionLogs: connectionLogs.length,
      trafficEvents: trafficEvents.length,
      settings: settings.length,
      releases: releases.length
    },
    data: {
      admins,
      sessions,
      auditLogs,
      users,
      contacts,
      configs,
      userConfigs,
      connectionLogs,
      trafficEvents,
      settings,
      releases
    }
  }

  await logAudit(request, admin.id, 'admin.backup', 'SYSTEM', null, dump.counts)

  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  const filename = `azadgram-backup-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.json`

  // BigInt (bytesIn/bytesOut) → string, so JSON.stringify works
  const body = JSON.stringify(dump, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))

  return new NextResponse(body, {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store'
    }
  })
}
