export const BRIDGE = 'http://127.0.0.1:38471'
export const BILIBILI_SITES = ['https://live.bilibili.com', 'https://api.bilibili.com', 'https://api.live.bilibili.com']
export function siteOrigin(raw) {
  const url = new URL(raw)
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash || url.pathname !== '/' || !url.hostname.includes('.') || url.hostname.includes('*') || /^[\d.]+$/.test(url.hostname) || url.hostname.includes(':') || /\.(?:local|localhost|internal|test|invalid)$/.test(url.hostname)) throw new Error('只支持精确的公共HTTPS域名，不接受通配符、端口或私网')
  return url.origin
}
export function publicUrl(raw) {
  const url = new URL(raw); siteOrigin(url.origin); if (url.username || url.password) throw new Error('credential URL')
  url.search = ''; url.hash = ''; return url.href
}
export async function permitted(site) { return chrome.permissions.contains({ origins: [`${siteOrigin(site)}/*`] }) }
export async function authorisedSites() {
  const permissions = await chrome.permissions.getAll()
  return [...new Set((permissions.origins ?? []).flatMap(pattern => { try { return [siteOrigin(pattern.replace(/\/\*$/, ''))] } catch { return [] } }))].slice(0, 32)
}
export async function bridgeCall(path, body, code) {
  const response = await fetch(`${BRIDGE}${path}`, { method: 'POST', credentials: 'omit', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(6000), headers: { 'Content-Type': 'application/json', 'X-Yiyu-Extension': chrome.runtime.getURL('').replace(/\/$/, ''), ...(code ? { Authorization: `Bearer ${code}` } : {}) }, body: JSON.stringify(body) })
  if (!response.ok) throw new Error('连接已失效，请在一隅中重新连接')
  return response.json()
}
