export type BrowserSiteRole = 'general' | 'mail' | 'portal'
export interface BrowserSiteProfile { origin: string; role: BrowserSiteRole; label?: string; entryUrl?: string }
export interface BrowserSettings {
  enabled:boolean
  sites:string[]
  backend?:'managed'
  cachedLoginSites?:string[]
  interactionSites?:string[]
  profiles?:BrowserSiteProfile[]
  preferredSites?:Partial<Record<BrowserSiteRole,string>>
  foregroundQueries?:boolean
  confirmQueryEgress?:boolean
}
export const bilibiliBrowserSites = ['https://live.bilibili.com', 'https://api.bilibili.com', 'https://api.live.bilibili.com']
export const bilibiliSetupSites = [...bilibiliBrowserSites, 'https://t.bilibili.com', 'https://www.bilibili.com']
export function browserOrigin(raw: string) {
  const url = new URL(raw)
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash || url.pathname !== '/' || !url.hostname.includes('.') || url.hostname.includes('*') || /^[\d.]+$/u.test(url.hostname) || url.hostname.includes(':') || /\.(?:local|localhost|internal|test|invalid)$/u.test(url.hostname)) throw new Error('请填写精确的公共HTTPS网站域名，不含端口、路径或通配符')
  return url.origin
}
export function normalizeBrowser(value?: Partial<BrowserSettings>): BrowserSettings {
  const sites = Array.isArray(value?.sites) ? value.sites.slice(0, 32).flatMap(site => { try { return [browserOrigin(site)] } catch { return [] } }) : []
  const cachedLoginSites = Array.isArray(value?.cachedLoginSites) ? [...new Set(value.cachedLoginSites.filter(site => sites.includes(site)))] : []
  const interactionSites = Array.isArray(value?.interactionSites) ? [...new Set(value.interactionSites.filter(site => sites.includes(site)))] : []
  const profiles = Array.isArray(value?.profiles) ? value.profiles.slice(0,32).flatMap(profile => {
    if (!profile || !sites.includes(profile.origin) || !['general','mail','portal'].includes(profile.role)) return []
    try { return [{ origin:profile.origin,role:profile.role,label:typeof profile.label === 'string' ? profile.label.trim().slice(0,60) : undefined,entryUrl:profile.entryUrl ? browserPageUrl(profile.entryUrl,profile.origin) : undefined }] } catch { return [] }
  }).filter((profile,index,all)=>all.findIndex(item=>item.origin===profile.origin)===index) : []
  const preferredSites=Object.fromEntries((['mail','portal','general'] as const).flatMap(role=>{const site=value?.preferredSites?.[role];return typeof site==='string'&&sites.includes(site)?[[role,site]]:[]}))
  return { ...(value?.backend==='managed'?{backend:'managed' as const}:{}),enabled: value?.enabled === true, sites: [...new Set(sites)], ...(cachedLoginSites.length ? { cachedLoginSites } : {}),...(interactionSites.length?{interactionSites}:{}),...(profiles.length?{profiles}:{}),...(Object.keys(preferredSites).length?{preferredSites}:{}),...(value?.foregroundQueries===true?{foregroundQueries:true}:{}),...(value?.confirmQueryEgress===true?{confirmQueryEgress:true}:{}) }
}
export function browserPageUrl(raw: string, origin: string) {
  const url=new URL(raw)
  if(browserOrigin(url.origin)!==origin || url.username || url.password || url.search || url.hash || url.href.length>2048)throw new Error('入口必须是同网站HTTPS页面，不含账号、查询参数或片段')
  return url.href
}
