/**
 * AzadGram — Share URI Parser (client-side, TypeScript)
 *
 * Parses share URIs for V2Ray / xray / Shadowsocks / Trojan / MTProto into a
 * config form object that the admin panel can use to pre-fill the "Add Config"
 * dialog. This is the reverse of `buildShareUri` in `lib/protocols.ts`.
 *
 * Supported formats:
 *   vless://UUID@host:port?encryption=none&type=tcp&security=tls&sni=...&fp=chrome&flow=...#name
 *   vmess://base64(json) — base64-encoded JSON with v, ps, add, port, id, aid, scy, net, host, path, tls, sni
 *   ss://base64(cipher:password)@host:port?plugin=...#name  (SIP002 standard)
 *   trojan://password@host:port?sni=...&type=...#name
 *   tg://proxy?server=host&port=port&secret=...
 *
 * Returns null if the URI is invalid or the protocol is unsupported.
 */

export interface ParsedConfig {
  name: string
  protocol: 'VLESS' | 'VMESS' | 'SHADOWSOCKS' | 'TROJAN' | 'MTPROTO'
  server: string
  port: number
  uuid?: string
  encryption?: string
  network?: string
  security?: string
  sni?: string
  fingerprint?: string
  flow?: string
  password?: string
  cipher?: string
  plugin?: string
  pluginOpts?: string
  // WebSocket / gRPC transport fields
  wsPath?: string           // WebSocket path (e.g. "/ws")
  wsHost?: string           // WebSocket Host header (CDN setups)
  grpcServiceName?: string  // gRPC service name
  alpn?: string             // TLS ALPN (e.g. "http/1.1")
  allowInsecure?: boolean   // skip cert verify
  // v3.7: REALITY fields — previously the public key was dumped into `notes`
  // and lost on regeneration, so REALITY configs never round-tripped.
  realityPublicKey?: string
  realityShortId?: string
  country?: string
  flag?: string
  notes?: string
}

const HOSTNAME_REGEX = /^([a-zA-Z0-9]([a-zA-Z0-9\-\.]*[a-zA-Z0-9])?|\[(?:[0-9a-fA-F:]+)\])$/

/** Decode base64 in a tolerant way (handles URL-safe, missing padding, UTF-8). */
function decodeBase64(s: string): string {
  if (!s) return ''
  // Convert URL-safe chars to standard
  let str = s.replace(/-/g, '+').replace(/_/g, '/')
  // Pad to multiple of 4
  while (str.length % 4 !== 0) str += '='
  try {
    // Use TextDecoder for proper UTF-8 (handles Persian/Arabic/CJK in vmess JSON)
    if (typeof atob === 'function' && typeof TextDecoder === 'function') {
      const binary = atob(str)
      // Convert binary string to Uint8Array
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
      return new TextDecoder('utf-8').decode(bytes)
    }
    // Node fallback
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(str, 'base64').toString('utf-8')
    }
    // Last resort
    return decodeURIComponent(escape(atob(str)))
  } catch (e) {
    console.error('decodeBase64 error', e)
    return ''
  }
}

function parseQueryString(qs: string): Record<string, string> {
  const out: Record<string, string> = {}
  if (!qs) return out
  for (const pair of qs.split('&')) {
    if (!pair) continue
    const eq = pair.indexOf('=')
    if (eq < 0) {
      out[decodeURIComponent(pair)] = ''
    } else {
      out[decodeURIComponent(pair.substring(0, eq))] = decodeURIComponent(pair.substring(eq + 1))
    }
  }
  return out
}

function splitHostPort(s: string): { host: string; port: number } | null {
  if (!s) return null
  // IPv6 in brackets [::1]:443
  if (s.startsWith('[')) {
    const end = s.indexOf(']')
    if (end < 0) return null
    const host = s.substring(1, end)
    const rest = s.substring(end + 1)
    const port = rest.startsWith(':') ? parseInt(rest.substring(1), 10) : 443
    if (isNaN(port) || port < 1 || port > 65535) return null
    return { host, port }
  }
  // host:port
  const lastColon = s.lastIndexOf(':')
  if (lastColon < 0) return null
  const host = s.substring(0, lastColon)
  const port = parseInt(s.substring(lastColon + 1), 10)
  if (!HOSTNAME_REGEX.test(host) && !/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return null
  if (isNaN(port) || port < 1 || port > 65535) return null
  return { host, port }
}

function decodeTag(tag: string): string {
  try { return decodeURIComponent(tag) } catch { return tag }
}

/**
 * Try to guess a country/flag from SNI or hostname.
 * Common patterns: cloud providers or country TLDs.
 */
function guessCountry(sni?: string, host?: string): { country?: string; flag?: string } {
  const s = (sni || host || '').toLowerCase()
  if (!s) return {}
  // Heuristic — feel free to extend
  if (s.includes('microsoft') || s.includes('apple') || s.includes('google')) {
    // These are common SNI for Reality — doesn't reflect actual location
    return {}
  }
  // Country TLDs
  const tldMap: Record<string, { country: string; flag: string }> = {
    '.de': { country: 'آلمان', flag: 'DE' },
    '.nl': { country: 'هلند', flag: 'NL' },
    '.us': { country: 'آمریکا', flag: 'US' },
    '.fr': { country: 'فرانسه', flag: 'FR' },
    '.fi': { country: 'فنلاند', flag: 'FI' },
    '.uk': { country: 'انگلیس', flag: 'GB' },
    '.se': { country: 'سوئد', flag: 'SE' },
    '.ch': { country: 'سوئیس', flag: 'CH' },
    '.sg': { country: 'سنگاپور', flag: 'SG' },
    '.jp': { country: 'ژاپن', flag: 'JP' },
    '.ca': { country: 'کانادا', flag: 'CA' },
    '.ir': { country: 'ایران', flag: 'IR' },
    '.ae': { country: 'امارات', flag: 'AE' },
    '.tr': { country: 'ترکیه', flag: 'TR' },
  }
  for (const [tld, info] of Object.entries(tldMap)) {
    if (s.endsWith(tld) || s.includes(`.${tld}.`)) return info
  }
  return {}
}

/**
 * Main parser — accepts a shareUri and returns a ParsedConfig, or null.
 */
export function parseShareUri(uri: string): ParsedConfig | null {
  if (!uri || typeof uri !== 'string') return null
  const trimmed = uri.trim()
  if (!trimmed) return null

  try {
    if (trimmed.startsWith('vless://')) return parseVless(trimmed)
    if (trimmed.startsWith('vmess://')) return parseVmess(trimmed)
    if (trimmed.startsWith('ss://')) return parseShadowsocks(trimmed)
    if (trimmed.startsWith('trojan://')) return parseTrojan(trimmed)
    if (trimmed.startsWith('tg://proxy') || trimmed.startsWith('https://t.me/proxy')) return parseMtproto(trimmed)
    return null
  } catch (e) {
    console.error('parseShareUri error', e)
    return null
  }
}

function parseVless(uri: string): ParsedConfig | null {
  // vless://UUID@host:port?params#tag
  const noPrefix = uri.substring('vless://'.length)
  const hashIdx = noPrefix.indexOf('#')
  const tag = hashIdx >= 0 ? decodeTag(noPrefix.substring(hashIdx + 1)) : ''
  const mainPart = hashIdx >= 0 ? noPrefix.substring(0, hashIdx) : noPrefix

  const qIdx = mainPart.indexOf('?')
  const atIdx = mainPart.lastIndexOf('@')
  if (atIdx < 0) return null

  const uuid = decodeURIComponent(mainPart.substring(0, atIdx))
  const hostPortQ = qIdx >= 0 ? mainPart.substring(atIdx + 1, qIdx) : mainPart.substring(atIdx + 1)
  const qs = qIdx >= 0 ? mainPart.substring(qIdx + 1) : ''
  const params = parseQueryString(qs)

  const hp = splitHostPort(hostPortQ)
  if (!hp) return null

  const country = guessCountry(params['sni'] || params['host'], hp.host)
  // Decode insecure / allowInsecure flags (multiple aliases seen in the wild)
  const allowInsecure =
    params['insecure'] === '1' ||
    params['allowInsecure'] === '1' ||
    params['allowInsecure'] === 'true'

  // v3.7: REALITY public key + short id (accept pbk / pb / pubkey aliases)
  const realityPublicKey = params['pbk'] || params['pb'] || params['pubkey'] || undefined
  const realityShortId = params['sid'] || undefined

  return {
    name: tag || `VLESS ${hp.host}:${hp.port}`,
    protocol: 'VLESS',
    server: hp.host,
    port: hp.port,
    uuid,
    encryption: params['encryption'] || 'none',
    network: params['type'] || params['network'] || 'tcp',
    security: params['security'] || 'none',
    sni: params['sni'] || params['host'] || '',
    fingerprint: params['fp'] || params['fingerprint'] || 'chrome',
    flow: params['flow'] || '',
    wsPath: params['path'] || undefined,
    wsHost: params['host'] || undefined,
    grpcServiceName: params['serviceName'] || undefined,
    alpn: params['alpn'] || undefined,
    allowInsecure,
    realityPublicKey,
    realityShortId,
    country: country.country,
    flag: country.flag,
  }
}

function parseVmess(uri: string): ParsedConfig | null {
  // vmess://base64(json)
  const b64 = uri.substring('vmess://'.length).split('#')[0]
  const jsonStr = decodeBase64(b64)
  if (!jsonStr) return null

  let o: any
  try {
    o = JSON.parse(jsonStr)
  } catch {
    return null
  }
  if (!o || typeof o !== 'object') return null

  const host = String(o.add || '')
  const port = parseInt(String(o.port), 10)
  if (!host || isNaN(port) || port < 1 || port > 65535) return null

  const tag = o.ps ? String(o.ps) : ''
  const net = String(o.net || 'tcp')
  const tls = String(o.tls || '')
  const sni = String(o.sni || '')
  const path = String(o.path || '')
  const hostHeader = String(o.host || '')

  const country = guessCountry(sni || hostHeader, host)

  return {
    name: tag || `VMess ${host}:${port}`,
    protocol: 'VMESS',
    server: host,
    port,
    uuid: String(o.id || ''),
    encryption: 'auto',
    network: net,
    security: tls ? 'tls' : 'none',
    sni: sni || hostHeader || '',
    wsPath: path || undefined,
    wsHost: hostHeader || undefined,
    grpcServiceName: String(o.path || '').startsWith('/') ? undefined : (String(o.path || '') || undefined),
    alpn: String(o.alpn || '') || undefined,
    country: country.country,
    flag: country.flag,
    notes: path && net === 'ws' ? `ws path: ${path}` : undefined,
  }
}

function parseShadowsocks(uri: string): ParsedConfig | null {
  // SIP002: ss://base64(cipher:password)@host:port?plugin=...#tag
  const noPrefix = uri.substring('ss://'.length)
  const hashIdx = noPrefix.indexOf('#')
  const tag = hashIdx >= 0 ? decodeTag(noPrefix.substring(hashIdx + 1)) : ''
  const mainPart = hashIdx >= 0 ? noPrefix.substring(0, hashIdx) : noPrefix

  const qIdx = mainPart.indexOf('?')
  const atIdx = mainPart.lastIndexOf('@')
  if (atIdx < 0) return null

  const userinfoB64 = mainPart.substring(0, atIdx)
  const userinfo = decodeBase64(userinfoB64)
  const colon = userinfo.indexOf(':')
  if (colon < 0) return null
  const cipher = userinfo.substring(0, colon)
  const password = userinfo.substring(colon + 1)

  const hostPortQ = qIdx >= 0 ? mainPart.substring(atIdx + 1, qIdx) : mainPart.substring(atIdx + 1)
  const qs = qIdx >= 0 ? mainPart.substring(qIdx + 1) : ''
  const params = parseQueryString(qs)

  const hp = splitHostPort(hostPortQ)
  if (!hp) return null

  // Parse plugin (e.g. "obfs-local;obfs=tls;obfs-host=example.com")
  let plugin: string | undefined
  let pluginOpts: string | undefined
  if (params['plugin']) {
    const parts = params['plugin'].split(';')
    plugin = parts[0]
    if (parts.length > 1) {
      pluginOpts = parts.slice(1).join(';')
    }
  }

  const country = guessCountry(undefined, hp.host)

  return {
    name: tag || `SS ${hp.host}:${hp.port}`,
    protocol: 'SHADOWSOCKS',
    server: hp.host,
    port: hp.port,
    password,
    cipher,
    plugin,
    pluginOpts,
    country: country.country,
    flag: country.flag,
  }
}

function parseTrojan(uri: string): ParsedConfig | null {
  // trojan://password@host:port?params#tag
  const noPrefix = uri.substring('trojan://'.length)
  const hashIdx = noPrefix.indexOf('#')
  const tag = hashIdx >= 0 ? decodeTag(noPrefix.substring(hashIdx + 1)) : ''
  const mainPart = hashIdx >= 0 ? noPrefix.substring(0, hashIdx) : noPrefix

  const qIdx = mainPart.indexOf('?')
  const atIdx = mainPart.lastIndexOf('@')
  if (atIdx < 0) return null

  const password = decodeURIComponent(mainPart.substring(0, atIdx))
  const hostPortQ = qIdx >= 0 ? mainPart.substring(atIdx + 1, qIdx) : mainPart.substring(atIdx + 1)
  const qs = qIdx >= 0 ? mainPart.substring(qIdx + 1) : ''
  const params = parseQueryString(qs)

  const hp = splitHostPort(hostPortQ)
  if (!hp) return null

  const country = guessCountry(params['sni'] || params['host'], hp.host)
  const allowInsecure =
    params['insecure'] === '1' ||
    params['allowInsecure'] === '1' ||
    params['allowInsecure'] === 'true'

  return {
    name: tag || `Trojan ${hp.host}:${hp.port}`,
    protocol: 'TROJAN',
    server: hp.host,
    port: hp.port,
    password,
    encryption: 'none',
    network: params['type'] || params['network'] || 'tcp',
    security: params['security'] || 'tls',
    sni: params['sni'] || params['host'] || '',
    wsPath: params['path'] || undefined,
    wsHost: params['host'] || undefined,
    grpcServiceName: params['serviceName'] || undefined,
    alpn: params['alpn'] || undefined,
    allowInsecure,
    country: country.country,
    flag: country.flag,
  }
}

function parseMtproto(uri: string): ParsedConfig | null {
  // tg://proxy?server=host&port=port&secret=...
  // or https://t.me/proxy?server=host&port=port&secret=...
  const qIdx = uri.indexOf('?')
  if (qIdx < 0) return null
  const params = parseQueryString(uri.substring(qIdx + 1))

  const host = params['server'] || ''
  const port = parseInt(params['port'] || '', 10)
  const secret = params['secret'] || ''
  if (!host || isNaN(port) || port < 1 || port > 65535 || !secret) return null

  const country = guessCountry(undefined, host)

  return {
    name: `MTProto ${host}:${port}`,
    protocol: 'MTPROTO',
    server: host,
    port,
    password: secret,  // we reuse the password field for MTProto secret
    country: country.country,
    flag: country.flag,
  }
}

/**
 * Returns a friendly error message for invalid URIs.
 * Useful for showing to the user in the UI.
 */
export function describeParseError(uri: string): string {
  if (!uri || !uri.trim()) return 'لینک خالی است'
  const t = uri.trim()
  if (!/^(vless|vmess|ss|trojan|tg|https):\/\//i.test(t)) {
    return 'پروتکل پشتیبانی نمی‌شود. فقط vless://, vmess://, ss://, trojan://, tg://proxy پشتیبانی می‌شود.'
  }
  const parsed = parseShareUri(t)
  if (!parsed) return 'ساختار لینک نامعتبر است. لطفاً لینک کامل را از V2RayNG یا برنامه‌ی مشابه کپی کنید.'
  return ''
}
