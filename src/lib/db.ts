import { PrismaClient } from '@prisma/client'

// Prisma returns BigInt for ConnectionLog/TrafficEvent bytesIn/bytesOut.
// JSON.stringify (used by NextResponse.json) throws "Do not know how to
// serialize a BigInt" unless BigInt has a toJSON. Byte counters are capped at
// Number.MAX_SAFE_INTEGER by validation, so converting to Number is lossless.
// This file is imported by every route, so the patch is always applied.
declare global {
  interface BigInt {
    toJSON(): number | string
  }
}
if (!(BigInt.prototype as any).toJSON) {
  ;(BigInt.prototype as any).toJSON = function (this: bigint) {
    return this <= BigInt(Number.MAX_SAFE_INTEGER) && this >= BigInt(-Number.MAX_SAFE_INTEGER)
      ? Number(this)
      : this.toString()
  }
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// Only log queries in development — keeps production fast and quiet.
const logLevel: any[] = process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error', 'warn']

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: logLevel,
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
