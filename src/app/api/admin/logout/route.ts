import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { clearSessionCookie, getAdminFromRequest, getClientIp } from '@/lib/auth'
import { logAudit } from '@/lib/audit'

export async function POST(request: NextRequest) {
  const admin = await getAdminFromRequest(request)
  if (admin) {
    // Delete all sessions for this admin
    await db.adminSession.deleteMany({ where: { adminId: admin.id } })
    await logAudit(request, admin.id, 'admin.logout', 'ADMIN', admin.id)
  }
  const res = NextResponse.json({ ok: true })
  clearSessionCookie(res)
  return res
}
