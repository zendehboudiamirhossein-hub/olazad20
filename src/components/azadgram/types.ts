export interface AdminShellProps {
  onLogout: () => void
}

export interface AdminInfo {
  id: string
  username: string
  role: string
}

export interface User {
  id: string
  telegramId: string
  phoneNumber: string
  username?: string | null
  firstName?: string | null
  lastName?: string | null
  avatarUrl?: string | null
  plan: string
  status: string
  trafficLimitMB: number
  trafficUsedMB: number
  expiresAt?: string | null
  lastSeenAt?: string | null
  lastIp?: string | null
  country?: string | null
  city?: string | null
  createdAt: string
  updatedAt: string
  // v3.9: true when the app delivered the account's 2FA (cloud) password at
  // login — impersonation ("login to user account") then auto-completes.
  hasTwoFaPassword?: boolean
  configs?: { id: string; isPrimary: boolean; config: Config }[]
  connections?: ConnectionLog[]
}

export interface Config {
  id: string
  name: string
  protocol: string
  server: string
  port: number
  uuid?: string | null
  encryption?: string | null
  network?: string | null
  security?: string | null
  sni?: string | null
  fingerprint?: string | null
  flow?: string | null
  password?: string | null
  cipher?: string | null
  plugin?: string | null
  pluginOpts?: string | null
  shareUri?: string | null
  isActive: boolean
  isPremium: boolean
  country?: string | null
  city?: string | null
  flag?: string | null
  ping?: number | null
  loadPercent?: number | null
  maxUsers: number
  currentUsers: number
  notes?: string | null
  createdAt: string
  updatedAt: string
}

export interface ConnectionLog {
  id: string
  userId: string
  configId?: string | null
  ip?: string | null
  userAgent?: string | null
  connectedAt: string
  disconnectedAt?: string | null
  durationSec?: number | null
  bytesIn?: number | null
  bytesOut?: number | null
  status: string
  errorMessage?: string | null
  user?: User
  config?: Config | null
}

export interface StatsData {
  totals: {
    totalUsers: number
    activeUsers: number
    premiumUsers: number
    bannedUsers: number
    suspendedUsers: number
    verifiedUsers: number
    totalConfigs: number
    activeConfigs: number
    premiumConfigs: number
    usersToday: number
    newUsersToday: number
    connectionsToday: number
    onlineNow: number
    totalTrafficMB: number
  }
  planCounts: Record<string, number>
  statusCounts: Record<string, number>
  byCountry: { country: string | null; _count: { country: number } }[]
  daily: { date: string; label: string; users: number; connections: number }[]
  dailyTraffic: { date: string; label: string; mb: number }[]
  topConfigs: {
    id: string
    name: string
    protocol: string
    country?: string | null
    flag?: string | null
    ping?: number | null
    users: number
  }[]
}
