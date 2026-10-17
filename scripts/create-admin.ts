#!/usr/bin/env bun
/**
 * AzadGram — Create or update an admin user from the terminal.
 *
 * Usage:
 *   bun run scripts/create-admin.ts <username> <password> [role]
 *
 *   role: SUPER_ADMIN (default), OPERATOR, or SUPPORT
 *
 * Example:
 *   bun run scripts/create-admin.ts admin 'Str0ngP@ssword!Min16' SUPER_ADMIN
 *
 * This script should be run once on Railway via the shell:
 *   railway shell
 *   bun run scripts/create-admin.ts myadmin 'MyVeryStrongPassword123'
 *
 * NEVER commit secrets to git. Use env vars or pass via terminal input only.
 */

import { db } from '../src/lib/db'
import { hashPassword } from '../src/lib/auth'

async function main() {
  const username = process.argv[2]
  const password = process.argv[3]
  let role = process.argv[4] ?? 'SUPER_ADMIN'

  if (!username || !password) {
    console.error('Usage: bun run scripts/create-admin.ts <username> <password> [role]')
    console.error('  role: SUPER_ADMIN (default), OPERATOR, or SUPPORT')
    process.exit(1)
  }

  if (password.length < 16) {
    console.error('Password must be at least 16 characters.')
    process.exit(1)
  }

  const VALID_ROLES = ['SUPER_ADMIN', 'OPERATOR', 'SUPPORT']
  if (!VALID_ROLES.includes(role)) {
    console.error(`Invalid role: ${role}. Must be one of: ${VALID_ROLES.join(', ')}`)
    process.exit(1)
  }

  // Check if admin exists
  const existing = await db.admin.findUnique({ where: { username } })
  if (existing) {
    // Update password and role
    const passwordHash = await hashPassword(password)
    await db.admin.update({
      where: { id: existing.id },
      data: { passwordHash, role }
    })
    console.log(`✓ Admin "${username}" updated. Role: ${role}`)
    // Delete all sessions to force re-login
    await db.adminSession.deleteMany({ where: { adminId: existing.id } })
    console.log('  All sessions deleted.')
  } else {
    const passwordHash = await hashPassword(password)
    await db.admin.create({
      data: { username, passwordHash, role }
    })
    console.log(`✓ Admin "${username}" created. Role: ${role}`)
  }

  // Make sure env has DISABLE_SEED=1
  console.log('\n⚠ Reminder: set DISABLE_SEED=1 in your environment variables.')
  await db.$disconnect()
}

main().catch((e) => {
  console.error('Error:', e)
  process.exit(1)
})
