/**
 * Build shareable URIs for various VPN protocols.
 * The AzadGram Android client can parse these and feed them into
 * V2Ray/xray core.
 */

export interface VlessConfig {
  protocol: 'VLESS'
  server: string
  port: number
  uuid: string
  encryption?: string
  network?: string
  security?: string
  sni?: string
  fingerprint?: string
  flow?: string
  path?: string        // WebSocket path
  host?: string        // WebSocket Host header
  grpcServiceName?: string
  alpn?: string
  allowInsecure?: boolean
  // v3.7: REALITY
  realityPublicKey?: string
  realityShortId?: string
}

export function buildVlessUri(c: VlessConfig): string {
  const params = new URLSearchParams()
  if (c.encryption) params.set('encryption', c.encryption)
  if (c.network) params.set('type', c.network)
  if (c.security) params.set('security', c.security)
  if (c.sni) params.set('sni', c.sni)
  if (c.fingerprint) params.set('fp', c.fingerprint)
  if (c.flow) params.set('flow', c.flow)
  if (c.path) params.set('path', c.path)
  if (c.host) params.set('host', c.host)
  if (c.grpcServiceName) params.set('serviceName', c.grpcServiceName)
  if (c.alpn) params.set('alpn', c.alpn)
  if (c.allowInsecure) {
    params.set('allowInsecure', '1')
    params.set('insecure', '1')
  }
  // v3.7: REALITY params (pbk/sid) — emitted only for security=reality
  if (c.security === 'reality') {
    if (c.realityPublicKey) params.set('pbk', c.realityPublicKey)
    if (c.realityShortId) params.set('sid', c.realityShortId)
    // sensible defaults so the client parser can rely on them
    if (!c.fingerprint) params.set('fp', 'chrome')
  }
  const frag = c.host || 'AzadGram'
  return `vless://${c.uuid}@${c.server}:${c.port}?${params.toString()}#${encodeURIComponent(frag)}`
}

export interface VmessConfig {
  protocol: 'VMESS'
  server: string
  port: number
  uuid: string
  alterId?: number
  network?: string
  security?: string
  sni?: string
  path?: string
  host?: string
}

export function buildVmessUri(c: VmessConfig): string {
  // vmess://base64(json)
  const obj = {
    v: '2',
    ps: 'AzadGram',
    add: c.server,
    port: String(c.port),
    id: c.uuid,
    aid: String(c.alterId ?? 0),
    scy: 'auto',
    net: c.network ?? 'tcp',
    type: 'none',
    host: c.host ?? '',
    path: c.path ?? '',
    tls: c.security ?? '',
    sni: c.sni ?? '',
    alpn: ''
  }
  return 'vmess://' + Buffer.from(JSON.stringify(obj)).toString('base64')
}

export interface ShadowsocksConfig {
  protocol: 'SHADOWSOCKS'
  server: string
  port: number
  password: string
  cipher: string
  plugin?: string
  pluginOpts?: string
}

export function buildShadowsocksUri(c: ShadowsocksConfig): string {
  const userinfo = `${c.cipher}:${c.password}`
  const b64 = Buffer.from(userinfo).toString('base64')
  let uri = `ss://${b64}@${c.server}:${c.port}`
  const params = new URLSearchParams()
  if (c.plugin) params.set('plugin', `${c.plugin}${c.pluginOpts ? ';' + c.pluginOpts : ''}`)
  if (params.toString()) uri += `?${params.toString()}`
  uri += `#AzadGram`
  return uri
}

export interface TrojanConfig {
  protocol: 'TROJAN'
  server: string
  port: number
  password: string
  sni?: string
  network?: string
  path?: string
  security?: string
}

export function buildTrojanUri(c: TrojanConfig): string {
  const params = new URLSearchParams()
  if (c.sni) params.set('sni', c.sni)
  if (c.network) params.set('type', c.network)
  if (c.path) params.set('path', c.path)
  if (c.security) params.set('security', c.security)
  return `trojan://${encodeURIComponent(c.password)}@${c.server}:${c.port}?${params.toString()}#AzadGram`
}

export interface MtprotoConfig {
  protocol: 'MTPROTO'
  server: string
  port: number
  secret: string
}

export function buildMtprotoUri(c: MtprotoConfig): string {
  return `tg://proxy?server=${c.server}&port=${c.port}&secret=${c.secret}`
}

/**
 * Build a shareable URI for any config from DB row.
 */
export function buildShareUri(config: any): string | null {
  try {
    switch (config.protocol) {
      case 'VLESS':
        return buildVlessUri({
          protocol: 'VLESS',
          server: config.server.split(':')[0],
          port: config.port,
          uuid: config.uuid ?? '',
          encryption: config.encryption ?? undefined,
          network: config.network ?? undefined,
          security: config.security ?? undefined,
          sni: config.sni ?? undefined,
          fingerprint: config.fingerprint ?? undefined,
          flow: config.flow ?? undefined,
          path: config.wsPath ?? undefined,
          host: config.wsHost ?? undefined,
          grpcServiceName: config.grpcServiceName ?? undefined,
          alpn: config.alpn ?? undefined,
          allowInsecure: config.allowInsecure ?? undefined,
          realityPublicKey: config.realityPublicKey ?? undefined,
          realityShortId: config.realityShortId ?? undefined
        })
      case 'VMESS':
        return buildVmessUri({
          protocol: 'VMESS',
          server: config.server.split(':')[0],
          port: config.port,
          uuid: config.uuid ?? '',
          network: config.network ?? undefined,
          security: config.security ?? undefined,
          sni: config.sni ?? undefined
        })
      case 'SHADOWSOCKS':
        return buildShadowsocksUri({
          protocol: 'SHADOWSOCKS',
          server: config.server.split(':')[0],
          port: config.port,
          password: config.password ?? '',
          cipher: config.cipher ?? 'aes-256-gcm',
          plugin: config.plugin ?? undefined,
          pluginOpts: config.pluginOpts ?? undefined
        })
      case 'TROJAN':
        return buildTrojanUri({
          protocol: 'TROJAN',
          server: config.server.split(':')[0],
          port: config.port,
          password: config.password ?? '',
          sni: config.sni ?? undefined,
          network: config.network ?? undefined,
          path: undefined,
          security: config.security ?? undefined
        })
      case 'MTPROTO':
        return buildMtprotoUri({
          protocol: 'MTPROTO',
          server: config.server.split(':')[0],
          port: config.port,
          secret: config.password ?? ''
        })
      default:
        return null
    }
  } catch (e) {
    console.error('buildShareUri error', e)
    return null
  }
}
