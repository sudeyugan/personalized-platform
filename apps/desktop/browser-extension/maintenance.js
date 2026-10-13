import { authorisedSites, siteOrigin } from './policy.js'
import { EXTENSION_REVISION } from './revision.js'

export function maintenanceData(raw) {
  if (!raw || typeof raw !== 'object' || typeof raw.version !== 'string' || !/^\d+(?:\.\d+){1,3}$/.test(raw.version) || raw.version.length > 32 || typeof raw.ready !== 'boolean' || typeof raw.enabled !== 'boolean' || !Number.isSafeInteger(raw.epoch) || raw.epoch < 0) throw new Error('无效维护回执')
  const sites = checkedSites(raw.sites)
  if(typeof raw.revision!=='string'||!/^[a-f0-9]{64}$/.test(raw.revision))throw new Error('无效扩展内容标记')
  let setup = null
  if (raw.setup != null) {
    const value = raw.setup, targets = checkedSites(value.sites)
    if (!/^[a-f0-9]{64}$/.test(value.id) || value.epoch !== raw.epoch || !targets.length || targets.some(site => !sites.includes(site)) || (value.openOrigin != null && !targets.includes(value.openOrigin))) throw new Error('无效网站确认请求')
    setup = { id: value.id, sites: targets, openOrigin: value.openOrigin ?? null, epoch: value.epoch }
  }
  return { version:raw.version, revision:raw.revision, ready:raw.ready, enabled:raw.enabled, sites, epoch:raw.epoch, setup }
}
function checkedSites(raw) {
  if (!Array.isArray(raw) || raw.length > 32 || raw.some(site => typeof site !== 'string' || siteOrigin(site) !== site)) throw new Error('无效网站清单')
  return [...new Set(raw)]
}
// Only the authenticated native reply may request these fixed maintenance
// operations. Never fetch code, evaluate text or request permissions here.
export async function maintainConnection(raw, hasJob=false) {
  const config = maintenanceData(raw), currentVersion = chrome.runtime.getManifest().version
  if (config.version !== currentVersion || config.revision !== EXTENSION_REVISION) {
    if (!config.ready || hasJob) return { stop:true, error:'扩展更新尚未完成，暂不读取网站' }
    const { reloadTarget } = await chrome.storage.local.get('reloadTarget')
    const target=`${config.version}@${config.revision}`
    if (reloadTarget === target) return { stop:true, error:'扩展未从一隅的原目录更新，请在Edge检查加载目录并重新加载一次' }
    await chrome.storage.local.set({ reloadTarget:target, pendingSetup:null })
    chrome.runtime.reload()
    return { stop:true, error:'扩展正在自动更新' }
  }
  const { pendingSetup } = await chrome.storage.local.get('pendingSetup')
  const pending = pendingSetup?.epoch === config.epoch && pendingSetup.expiresAt > Date.now() && config.enabled && Array.isArray(pendingSetup.sites) && pendingSetup.sites.every(site => config.sites.includes(site)) ? pendingSetup : null
  const removed = (await authorisedSites()).filter(site => !config.sites.includes(site))
  if (removed.length) await chrome.permissions.remove({ origins:removed.map(site=>`${site}/*`) })
  await chrome.storage.local.set({ browserConfig:config, pendingSetup:pending })
  if (config.setup && config.enabled) {
    const request = { ...config.setup, expiresAt:Date.now()+180000 }
    await chrome.storage.local.set({ pendingSetup:request })
    await chrome.tabs.create({ url:chrome.runtime.getURL('setup.html') })
  }
  return { stop:false }
}
