import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

export function origin(raw) {
  const url = new URL(raw)
  if (url.protocol !== 'https:' || url.port || url.username || url.password || isIP(url.hostname) || !url.hostname.includes('.') || /\.(local|localhost|internal|test|invalid)$/i.test(url.hostname)) throw new Error('BROWSER_SITE')
  return url.origin
}
export function pageUrl(raw, site) {
  const url = new URL(raw)
  if (origin(raw) !== site || url.search || url.hash || raw.length > 2048) throw new Error('BROWSER_SITE')
  return url.href
}
export function publicAddress(address) {
  if (isIP(address) === 4) {
    const [a,b] = address.split('.').map(Number)
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || a === 169 && b === 254 || a === 172 && b >= 16 && b <= 31 || a === 192 && (b === 168 || b === 0) || a === 100 && b >= 64 && b <= 127 || a === 198 && [18,19].includes(b))
  }
  // Only global-unicast IPv6, excluding documentation and IPv4 mappings.
  return isIP(address) === 6 && /^[23]/i.test(address) && !/^2001:db8:/i.test(address)
}
export function networkPolicy(sites) {
  const cache = new Map()
  return async route => {
    try {
      const request = route.request(), url = new URL(request.url())
      origin(url.href)
      if (request.isNavigationRequest() && !sites.includes(url.origin)) return await route.abort('blockedbyclient')
      let record = cache.get(url.hostname)
      if (!record || record.until < Date.now()) {
        const addresses = await lookup(url.hostname, { all:true })
        record = { ok:addresses.length > 0 && addresses.every(item => publicAddress(item.address)), until:Date.now()+30000 }
        cache.set(url.hostname, record)
      }
      if (!record.ok) return await route.abort('blockedbyclient')
      await route.continue()
    } catch { await route.abort('blockedbyclient').catch(()=>{}) }
  }
}
export const operations = ['invoke','search','fill','select','scroll']
export function interaction(value) {
  if (!value || !/^[a-f\d-]{36}$/i.test(value.observationId) || !/^[a-f\d-]{36}$/i.test(value.elementId) || !operations.includes(value.operation)) throw new Error('BROWSER_ARGUMENT')
  if (['search','fill','select'].includes(value.operation) && (typeof value.query !== 'string' || !value.query.trim() || value.query.length > 200 || /[\r\n\0]|(?:password|密码|验证码|Bearer\s|sk-)/i.test(value.query))) throw new Error('BROWSER_ARGUMENT')
  return value
}
