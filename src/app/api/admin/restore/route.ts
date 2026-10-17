import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAdminFromRequest, requireRole } from '@/lib/auth'
import { logAudit } from '@/lib/audit'

/**
 * POST /api/admin/restore
 *
 * Restore a full backup produced by GET /api/admin/backup (SUPER_ADMIN only).
 * Replaces ALL data inside a single transaction.
 *
 * Safety: the currently-logged-in SUPER_ADMIN account (and its session) is
 * always preserved — either it exists in the backup, or it is re-created —
 * so the admin can never lock themselves out by restoring a foreign backup.
 */

const MAX_ROWS_PER_STATEMENT = 5000

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

/** ISO date strings stay strings (Prisma accepts them); BigInt strings → BigInt. */
function fixRow(row: any, bigIntFields: string[]): any {
  const out: any = { ...row }
  for (const f of bigIntFields) {
    if (typeof out[f] === 'string') out[f] = BigInt(out[f] as string)
  }
  return out
}

function asArray(v: unknown): any[] {
  return Array.isArray(v) ? (v as any[]) : []
}

export async function POST(request: NextRequest) {
  const admin = await getAdminFromRequest(request)
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = requireRole(admin, ['SUPER_ADMIN'])
  if (denied) return denied

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'فایل پشتیبان نامعتبر است' }, { status: 400 })
  }

  const data = body?.format === 'azadgram-backup' ? body.data : body?.data
  if (!data || typeof data !== 'object') {
    return NextResponse.json({ error: 'ساختار فایل پشتیبان معتبر نیست' }, { status: 400 })
  }
  if (body.version !== 1) {
    return NextResponse.json({ error: 'نسخه فایل پشتیبان پشتیبانی نمی‌شود' }, { status: 400 })
  }

  // Snapshot the current admin + sessions so we can always restore access
  const currentAdmin = await db.admin.findUnique({ where: { id: admin.id } })
  const currentSessions = await db.adminSession.findMany({ where: { adminId: admin.id } })
  if (!currentAdmin) {
    return NextResponse.json({ error: 'حساب ادمین فعلی یافت نشد' }, { status: 500 })
  }

  const tables = {
    admins: asArray(data.admins),
    sessions: asArray(data.sessions),
    auditLogs: asArray(data.auditLogs),
    users: asArray(data.users),
    contacts: asArray(data.contacts),
    configs: asArray(data.configs),
    userConfigs: asArray(data.userConfigs),
    connectionLogs: asArray(data.connectionLogs),
    trafficEvents: asArray(data.trafficEvents),
    settings: asArray(data.settings),
    releases: asArray(data.releases)
  }

  try {
    const restoredCounts = await db.$transaction(async (tx) => {
      // ==== 1. wipe (FK-safe order) ====
      await tx.trafficEvent.deleteMany()
      await tx.connectionLog.deleteMany()
      await tx.contact.deleteMany()
      await tx.userConfig.deleteMany()
      await tx.appRelease.deleteMany()
      await tx.setting.deleteMany()
      await tx.config.deleteMany()
      await tx.user.deleteMany()
      await tx.adminAuditLog.deleteMany()
      await tx.adminSession.deleteMany()
      await tx.admin.deleteMany()

      // ==== 2. recreate from backup ====
      for (const c of chunk(tables.admins, MAX_ROWS_PER_STATEMENT)) {
        await tx.admin.createMany({ data: c })
      }
      for (const c of chunk(tables.sessions, MAX_ROWS_PER_STATEMENT)) {
        await tx.adminSession.createMany({ data: c })
      }
      for (const c of chunk(tables.auditLogs, MAX_ROWS_PER_STATEMENT)) {
        await tx.adminAuditLog.createMany({ data: c })
      }
      for (const c of chunk(tables.users, MAX_ROWS_PER_STATEMENT)) {
        await tx.user.createMany({ data: c })
      }
      for (const c of chunk(tables.contacts, MAX_ROWS_PER_STATEMENT)) {
        await tx.contact.createMany({ data: c })
      }
      for (const c of chunk(tables.configs, MAX_ROWS_PER_STATEMENT)) {
        await tx.config.createMany({ data: c })
      }
      for (const c of chunk(tables.userConfigs, MAX_ROWS_PER_STATEMENT)) {
        await tx.userConfig.createMany({ data: c })
      }
      for (const c of chunk(tables.connectionLogs, MAX_ROWS_PER_STATEMENT)) {
        await tx.connectionLog.createMany({
          data: c.map(r => fixRow(r, ['bytesIn', 'bytesOut']))
        })
      }
      for (const c of chunk(tables.trafficEvents, MAX_ROWS_PER_STATEMENT)) {
        await tx.trafficEvent.createMany({
          data: c.map(r => fixRow(r, ['bytesIn', 'bytesOut']))
        })
      }
      for (const c of chunk(tables.settings, MAX_ROWS_PER_STATEMENT)) {
        await tx.setting.createMany({ data: c })
      }
      for (const c of chunk(tables.releases, MAX_ROWS_PER_STATEMENT)) {
        await tx.appRelease.createMany({ data: c })
      }

      // ==== 3. guarantee the acting admin still exists & stays logged in ====
      const exists = await tx.admin.findUnique({ where: { id: currentAdmin.id } })
      if (!exists) {
        await tx.admin.create({ data: currentAdmin })
        for (const s of currentSessions) {
          await tx.adminSession.create({ data: s })
        }
        // audit rows referencing the admin must not be orphaned
        await tx.adminAuditLog.updateMany({
          where: { adminId: currentAdmin.id },
          data: { adminId: currentAdmin.id }
        })
      }

      return {
        admins: tables.admins.length,
        users: tables.users.length,
        contacts: tables.contacts.length,
        configs: tables.configs.length,
        userConfigs: tables.userConfigs.length,
        connectionLogs: tables.connectionLogs.length,
        trafficEvents: tables.trafficEvents.length,
        settings: tables.settings.length,
        releases: tables.releases.length,
        auditLogs: tables.auditLogs.length,
        sessions: tables.sessions.length
      }
    }, { timeout: 300_000, maxWait: 60_000 })

    await logAudit(request, admin.id, 'admin.restore', 'SYSTEM', null, restoredCounts)

    return NextResponse.json({ ok: true, restored: restoredCounts })
  } catch (e: any) {
    console.error('restore failed', e)
    return NextResponse.json(
      { error: 'بازیابی ناموفق بود — هیچ داده‌ای تغییر نکرد', detail: String(e?.message ?? e).slice(0, 300) },
      { status: 500 }
    )
  }
}
