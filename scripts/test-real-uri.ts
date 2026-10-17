import { parseShareUri } from '../src/lib/parse-share-uri'

const REAL_URI = 'vless://070c11ff-f888-498a-8935-c90133e54926@69.46.46.57:443?path=%2Fws&security=tls&alpn=http%2F1.1&encryption=none&insecure=0&host=kiri.up.railway.app&fp=chrome&type=ws&allowInsecure=0&sni=kiri.up.railway.app#%D9%86%D8%A7%D9%85%D8%AD%D8%AF%D9%88%D8%AF'

const result = parseShareUri(REAL_URI)
console.log('=== Parsed result ===')
console.log(JSON.stringify(result, null, 2))

console.log('\n=== Missing fields (path, host, alpn) ===')
if (result) {
  console.log('path:', (result as any).path || 'MISSING')
  console.log('host:', (result as any).host || 'MISSING')
  console.log('alpn:', (result as any).alpn || 'MISSING')
  console.log('insecure:', (result as any).insecure || 'MISSING')
  console.log('name (Persian):', result.name)
}
