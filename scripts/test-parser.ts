/* Quick parser test — run with: bun run scripts/test-parser.ts */
import { parseShareUri, describeParseError } from '../src/lib/parse-share-uri'

const TESTS: { name: string; uri: string; expected: any }[] = [
  {
    name: 'VLESS + Reality',
    uri: 'vless://a1b2c3d4-e5f6-7890-abcd-ef1234567890@5.78.123.45:443?type=tcp&security=reality&sni=www.microsoft.com&fp=chrome&flow=xtls-rprx-vision#Test1',
    expected: { protocol: 'VLESS', server: '5.78.123.45', port: 443, uuid: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', security: 'reality', sni: 'www.microsoft.com', fingerprint: 'chrome', flow: 'xtls-rprx-vision', name: 'Test1' }
  },
  {
    name: 'VMESS with Persian name',
    uri: 'vmess://' + Buffer.from(JSON.stringify({
      v: '2', ps: 'هلند-۲', add: '45.67.89.10', port: '443',
      id: '12345678-1234-1234-1234-1234567890ab', aid: '0',
      scy: 'auto', net: 'ws', type: 'none', host: 'cdn.example.com',
      path: '/azadgram', tls: 'tls', sni: 'cdn.example.com', alpn: ''
    })).toString('base64'),
    expected: { protocol: 'VMESS', server: '45.67.89.10', port: 443, uuid: '12345678-1234-1234-1234-1234567890ab', name: 'هلند-۲', network: 'ws', sni: 'cdn.example.com' }
  },
  {
    name: 'Shadowsocks SIP002',
    uri: 'ss://' + Buffer.from('aes-256-gcm:MySecretPass123').toString('base64') + '@1.2.3.4:8388#Finland-Test',
    expected: { protocol: 'SHADOWSOCKS', server: '1.2.3.4', port: 8388, password: 'MySecretPass123', cipher: 'aes-256-gcm', name: 'Finland-Test' }
  },
  {
    name: 'Trojan',
    uri: 'trojan://MyTrojanPass@5.6.7.8:443?type=tcp&security=tls&sni=cdn.example.com#Trojan-Test',
    expected: { protocol: 'TROJAN', server: '5.6.7.8', port: 443, password: 'MyTrojanPass', sni: 'cdn.example.com', name: 'Trojan-Test' }
  },
  {
    name: 'MTProto',
    uri: 'tg://proxy?server=1.2.3.4&port=443&secret=dd' + 'a'.repeat(30),
    expected: { protocol: 'MTPROTO', server: '1.2.3.4', port: 443, password: 'dd' + 'a'.repeat(30) }
  },
  {
    name: 'Invalid protocol',
    uri: 'https://example.com/not-a-config',
    expected: null
  },
  {
    name: 'Empty',
    uri: '',
    expected: null
  },
  {
    name: 'VLESS with IPv6',
    uri: 'vless://a1b2c3d4-e5f6-7890-abcd-ef1234567890@[2001:db8::1]:443?type=tcp&security=tls&sni=cdn.example.com#Test',
    expected: { protocol: 'VLESS', server: '2001:db8::1', port: 443, name: 'Test' }
  },
  {
    name: 'VLESS + WS + TLS + CDN (real-world Railway config — Persian name)',
    uri: 'vless://070c11ff-f888-498a-8935-c90133e54926@69.46.46.57:443?path=%2Fws&security=tls&alpn=http%2F1.1&encryption=none&insecure=0&host=kiri.up.railway.app&fp=chrome&type=ws&allowInsecure=0&sni=kiri.up.railway.app#%D9%86%D8%A7%D9%85%D8%AD%D8%AF%D9%88%D8%AF',
    expected: {
      protocol: 'VLESS', server: '69.46.46.57', port: 443,
      uuid: '070c11ff-f888-498a-8935-c90133e54926',
      network: 'ws', security: 'tls', sni: 'kiri.up.railway.app',
      fingerprint: 'chrome',
      wsPath: '/ws', wsHost: 'kiri.up.railway.app', alpn: 'http/1.1',
      allowInsecure: false, name: 'نامحدود',
    }
  },
]

let pass = 0, fail = 0
for (const t of TESTS) {
  const result = parseShareUri(t.uri)
  let ok = true
  for (const [k, v] of Object.entries(t.expected || {})) {
    if (!result || result[k as keyof typeof result] !== v) {
      ok = false
      console.log(`✗ ${t.name}: field "${k}" expected="${v}" got="${result ? (result as any)[k] : 'null'}"`)
      break
    }
  }
  if (t.expected === null && result !== null) {
    ok = false
    console.log(`✗ ${t.name}: expected null, got ${result.protocol}`)
  }
  if (ok) {
    pass++
    console.log(`✓ ${t.name}`)
  } else {
    fail++
  }
}

console.log(`\n${pass}/${pass + fail} tests passed`)
process.exit(fail > 0 ? 1 : 0)
