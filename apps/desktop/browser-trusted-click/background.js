import { trustedClick } from './login-engine.js'
import { TRUSTED_HELPER_REVISION } from './revision.js'
let running
chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' })
chrome.runtime.onMessageExternal.addListener((message, sender, reply) => {
  if (!sender.id || sender.id === chrome.runtime.id) return
  void (async () => {
    const { reader } = await chrome.storage.local.get('reader'), allowed = reader === sender.id
    if (message?.type === 'status') return reply({ installed: true, connected: allowed, revision: TRUSTED_HELPER_REVISION })
    if (!allowed) return reply({ error: 'permission' })
    if (message.type === 'refresh') {
      const text = await fetch(chrome.runtime.getURL('revision.js'), { cache: 'no-store' }).then(r => r.text())
      const revision = text.match(/^export const TRUSTED_HELPER_REVISION = '([a-f0-9]{64})';?\s*$/)?.[1]
      reply({ updating: revision === message.revision && revision !== TRUSTED_HELPER_REVISION })
      if (revision === message.revision && revision !== TRUSTED_HELPER_REVISION) chrome.runtime.reload()
      return
    }
    if (message.type === 'stop') { if (running?.cap === message.cap && running.reader === reader) running.stop?.(); return reply({ stopped: true }) }
    if (message.type !== 'login' || running || !Number.isSafeInteger(message.tabId) || message.tabId < 0 || !/^[a-f0-9-]{36}$/.test(message.cap) || typeof message.url !== 'string' || message.url.length > 2048) return reply({ error: 'permission' })
    const url = new URL(message.url)
    if (url.protocol !== 'https:' || url.origin !== message.origin || url.username || url.password || url.port) return reply({ error: 'permission' })
    const job = { cap: message.cap, tabId: message.tabId, origin: message.origin, url: message.url, reader }
    running = job
    try { reply(await trustedClick(job, reader, mode => chrome.runtime.sendMessage(reader, { type: 'trusted_login_validate', cap: job.cap, mode }))) }
    catch (error) { reply({ error: error?.message === 'permission' ? 'permission' : 'tab_changed' }) }
    finally { if (running === job) running = undefined }
  })().catch(() => reply({ error: 'permission' }))
  return true
})
