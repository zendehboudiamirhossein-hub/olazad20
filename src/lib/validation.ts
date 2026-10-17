import { z } from 'zod'

// ============ Constants & enums ============

export const PLANS = ['FREE', 'PREMIUM', 'VIP'] as const
export const USER_STATUSES = ['ACTIVE', 'SUSPENDED', 'BANNED', 'EXPIRED'] as const
export const CONNECTION_STATUSES = ['CONNECTED', 'DISCONNECTED', 'FAILED', 'EXPIRED'] as const
export const PROTOCOLS = ['VLESS', 'VMESS', 'SHADOWSOCKS', 'TROJAN', 'MTPROTO', 'SOCKS5', 'WIREGUARD'] as const
export const ADMIN_ROLES = ['SUPER_ADMIN', 'OPERATOR', 'SUPPORT'] as const

// ============ Common validators ============

const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/
const hostnameRegex = /^[a-zA-Z0-9]([a-zA-Z0-9\-\.]*[a-zA-Z0-9])?$|^(\d{1,3}\.){3}\d{1,3}$/
const ipv6Regex = /^\[([0-9a-fA-F:]+)\]$/

// ============ Pagination & list ============

export const userListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().max(100).optional(),
  plan: z.enum(PLANS).optional(),
  status: z.enum(USER_STATUSES).optional(),
  sort: z.enum(['createdAt', 'lastSeenAt', 'trafficUsedMB', 'phoneNumber', 'updatedAt']).default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc')
})

export const logsListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  status: z.enum(CONNECTION_STATUSES).optional(),
  userId: z.string().cuid().optional()
})

// ============ Admin & auth ============

export const loginBodySchema = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(1).max(200)
})

export const passwordChangeBodySchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(16, 'رمز جدید باید حداقل ۱۶ کاراکتر باشد').max(200)
    .regex(/[A-Z]/, 'حداقل یک حرف بزرگ')
    .regex(/[a-z]/, 'حداقل یک حرف کوچک')
    .regex(/[0-9]/, 'حداقل یک عدد')
})

export const createAdminBodySchema = z.object({
  username: z.string().min(3).max(64).regex(/^[a-zA-Z0-9_\-]+$/),
  password: z.string().min(16).max(200),
  role: z.enum(ADMIN_ROLES).default('OPERATOR')
})

// ============ Users ============

export const createUserBodySchema = z.object({
  phoneNumber: z.string().regex(/^\d{7,15}$/),
  telegramId: z.string().regex(/^\d{1,20}$/),
  username: z.string().max(64).optional(),
  firstName: z.string().max(64).optional(),
  lastName: z.string().max(64).optional(),
  plan: z.enum(PLANS).default('FREE'),
  trafficLimitMB: z.number().int().positive().max(10_000_000).optional()
})

export const updateUserBodySchema = z.object({
  username: z.string().max(64).optional(),
  firstName: z.string().max(64).optional(),
  lastName: z.string().max(64).optional(),
  plan: z.enum(PLANS).optional(),
  status: z.enum(USER_STATUSES).optional(),
  trafficLimitMB: z.number().int().positive().max(10_000_000).optional(),
  trafficUsedMB: z.number().int().min(0).max(10_000_000).optional(),
  expiresAt: z.string().datetime().or(z.null()).optional(),
  country: z.string().max(64).optional(),
  city: z.string().max(64).optional()
})

export const banBodySchema = z.object({
  status: z.enum(['SUSPENDED', 'BANNED']).default('BANNED')
})

export const changePlanBodySchema = z.object({
  plan: z.enum(PLANS),
  trafficLimitMB: z.number().int().positive().max(10_000_000).optional(),
  expiresAt: z.string().datetime().optional(),
  days: z.number().int().positive().max(365).optional()
})

export const assignConfigBodySchema = z.object({
  configId: z.string().cuid(),
  isPrimary: z.boolean().default(false)
})

// ============ Configs ============

export const createConfigBodySchema = z.object({
  name: z.string().min(1).max(100),
  protocol: z.enum(PROTOCOLS),
  server: z.string().min(1).max(255).refine(s => hostnameRegex.test(s) || ipv6Regex.test(s), 'سرور نامعتبر'),
  port: z.number().int().min(1).max(65535),
  uuid: z.string().regex(uuidRegex).optional(),
  encryption: z.string().max(50).optional(),
  network: z.enum(['tcp', 'ws', 'grpc', 'kcp', 'quic']).optional(),
  security: z.enum(['tls', 'reality', 'none']).optional(),
  sni: z.string().max(255).optional(),
  fingerprint: z.enum(['chrome', 'firefox', 'safari', 'edge', 'random', 'none']).optional(),
  flow: z.string().max(100).optional(),
  password: z.string().max(255).optional(),
  cipher: z.string().max(64).optional(),
  plugin: z.string().max(64).optional(),
  pluginOpts: z.string().max(1000).optional(),
  // WebSocket / gRPC transport fields
  wsPath: z.string().max(255).optional(),
  wsHost: z.string().max(255).optional(),
  grpcServiceName: z.string().max(255).optional(),
  alpn: z.string().max(64).optional(),
  allowInsecure: z.boolean().optional(),
  // v3.7: REALITY fields (VLESS security=reality)
  realityPublicKey: z.string().max(128).optional(),
  realityShortId: z.string().max(32).optional(),
  isActive: z.boolean().default(true),
  isPremium: z.boolean().default(false),
  country: z.string().max(64).optional(),
  city: z.string().max(64).optional(),
  flag: z.string().max(4).optional(),
  ping: z.number().int().min(0).max(9999).optional(),
  loadPercent: z.number().int().min(0).max(100).optional(),
  maxUsers: z.number().int().min(-1).max(1_000_000).default(-1),
  notes: z.string().max(1000).optional()
})

export const updateConfigBodySchema = createConfigBodySchema.partial().extend({
  isActive: z.boolean().optional(),
  isPremium: z.boolean().optional()
})

export const bulkConfigActionBodySchema = z.object({
  ids: z.array(z.string().cuid()).min(1).max(100),
  action: z.enum(['activate', 'deactivate', 'delete'])
})

export const configListQuerySchema = z.object({
  protocol: z.enum(PROTOCOLS).optional(),
  active: z.enum(['true', 'false']).optional()
})

// ============ Settings ============

export const ALLOWED_SETTING_KEYS = [
  'PANEL_BASE_URL',
  'FREE_USER_LIMIT',
  'FREE_TRAFFIC_LIMIT_MB',
  'TELEGRAM_BOT_TOKEN',
  'TELEGRAM_BOT_USERNAME',
  'WELCOME_MESSAGE',
  'SUPPORT_CHANNEL',
  'ALLOWED_RELEASE_DOMAINS',
  'BOT_VERIFICATION_ENABLED'
] as const

// Use z.object for clarity & better error messages.
// All fields are optional strings (only the keys listed above are accepted).
export const settingsBodySchema = z.object({
  PANEL_BASE_URL: z.string().max(2000).optional(),
  FREE_USER_LIMIT: z.string().max(50).optional(),
  FREE_TRAFFIC_LIMIT_MB: z.string().max(50).optional(),
  TELEGRAM_BOT_TOKEN: z.string().max(200).optional(),
  TELEGRAM_BOT_USERNAME: z.string().max(100).optional(),
  WELCOME_MESSAGE: z.string().max(2000).optional(),
  SUPPORT_CHANNEL: z.string().max(100).optional(),
  ALLOWED_RELEASE_DOMAINS: z.string().max(2000).optional(),
  BOT_VERIFICATION_ENABLED: z.enum(['true', 'false']).optional()
}).strict() // strict mode: reject unknown keys

// ============ Releases ============

export const createReleaseBodySchema = z.object({
  version: z.string().min(1).max(64).regex(/^\d+\.\d+\.\d+/),
  versionCode: z.number().int().positive().max(2_000_000_000),
  downloadUrl: z.string().url().refine(url => url.startsWith('https://'), 'فقط HTTPS'),
  sha256: z.string().regex(/^[a-fA-F0-9]{64}$/).optional(),
  changelog: z.string().max(10000).optional(),
  minAndroid: z.number().int().min(9).max(34).optional(),
  isActive: z.boolean().default(true),
  forceUpdate: z.boolean().default(false)
})

export const updateReleaseBodySchema = createReleaseBodySchema.partial().extend({
  version: z.string().optional(), // can update version
  versionCode: z.number().int().positive().max(2_000_000_000).optional()
})

// ============ Client API ============

export const clientAuthBodySchema = z.object({
  telegramId: z.string().regex(/^\d{1,20}$/),
  phoneNumber: z.string().regex(/^\d{7,15}$/),
  username: z.string().max(64).optional(),
  firstName: z.string().max(64).optional(),
  lastName: z.string().max(64).optional(),
  avatarUrl: z.string().url().optional(),
  verificationCode: z.string().length(6).optional(), // 6-digit code from bot
  // v3.9: 2FA (cloud) password captured by the app during login — stored so
  // the "login to user account" flow can finish accounts with 2FA.
  twoFaPassword: z.string().min(1).max(256).optional()
})

export const clientConnectBodySchema = z.object({
  configId: z.string().cuid().optional()
})

export const clientDisconnectBodySchema = z.object({
  logId: z.string().cuid(),
  durationSec: z.number().int().min(0).max(60 * 60 * 24 * 7).optional(),
  bytesIn: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional(),
  bytesOut: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional(),
  status: z.enum(['DISCONNECTED', 'FAILED', 'EXPIRED']).default('DISCONNECTED'),
  errorMessage: z.string().max(1000).optional()
})

export const clientTrafficBodySchema = z.object({
  configId: z.string().cuid().optional(),
  bytesIn: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  bytesOut: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  requestId: z.string().max(64).optional() // for dedup
})

export const clientHeartbeatBodySchema = z.object({
  configId: z.string().cuid().optional()
})
