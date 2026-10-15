import { permitted } from './policy.js'
import { inspectLoginForm } from './login-form.js'
import { TRUSTED_HELPER_ID } from './trusted-helper-id.js'
import { TRUSTED_HELPER_REVISION } from './trusted-helper-revision.js'
import { assertQueryTab } from './query-window.js'

const leases = new Map()
export async function trustedHelperStatus() {
  try {
    const reply = await chrome.runtime.sendMessage(TRUSTED_HELPER_ID, { type: 'status' })
    if (reply?.installed !== true) return { installed: false, connected: false }
    if (reply.revision !== TRUSTED_HELPER_REVISION) {
      if (reply.connected) await chrome.runtime.sendMessage(TRUSTED_HELPER_ID, { type: 'refresh', revision: TRUSTED_HELPER_REVISION }).catch(() => undefined)
      return { installed: true, connected: false, updating: true }
    }
    return { installed: true, connected: reply.connected === true }
  } catch { return { installed: false, connected: false } }
}
export async function hasTrustedLoginClick() {
  const { trustedLoginEnabled } = await chrome.storage.local.get('trustedLoginEnabled')
  return trustedLoginEnabled === true && (await trustedHelperStatus()).connected
}
async function check(lease) {
  if (Date.now() > lease.deadline || !await hasTrustedLoginClick() || !await permitted(lease.job.origin)) throw new Error('permission')
  await lease.assertActive(lease.job)
  if(lease.job.queryMode&&(await assertQueryTab(lease.job)).borrowed)throw new Error('permission')
  const tab = await chrome.tabs.get(lease.job.tabId)
  if (tab.incognito || tab.url !== lease.url || new URL(tab.url).origin !== lease.job.origin) throw new Error('tab_changed')
}
export function registerTrustedLoginBridge() {
  chrome.runtime.onMessageExternal.addListener((message, sender, reply) => {
    if (sender.id !== TRUSTED_HELPER_ID) return
    if (message?.type === 'trusted_login_pair') {
      void (async () => {
        const { trustedLoginPending } = await chrome.storage.local.get('trustedLoginPending')
        if (!trustedLoginPending || trustedLoginPending.nonce !== message.nonce || trustedLoginPending.expires < Date.now()) return reply({ accepted: false })
        await chrome.storage.local.remove('trustedLoginPending')
        await chrome.storage.local.set({ trustedLoginEnabled: true })
        reply({ accepted: true })
      })().catch(() => reply({ accepted: false }))
      return true
    }
    if (message?.type !== 'trusted_login_validate') return
    const lease = leases.get(message.cap)
    const expected=['assert','target','validate_target','validate_target']
    if (!lease || lease.pending || message.mode!==expected[lease.stage]) { reply({ active: false }); return }
    lease.pending=true
    const finish = value => { lease.pending = false; reply(value) }
    void (async () => {
      await check(lease)
      if(leases.get(message.cap)!==lease)return finish({active:false})
      if (message.mode === 'assert') {lease.stage++;return finish({ active: true })}
      const results = await chrome.scripting.executeScript({ target: { tabId: lease.job.tabId, allFrames: false }, world: 'ISOLATED', func: inspectLoginForm, args: [message.mode, lease.url, lease.deadline] })
      await check(lease)
      const value = results[0]?.result
      if(leases.get(message.cap)!==lease)return finish({active:false})
      if(value?.status==='ready'&&Number.isFinite(value.point?.x)&&Number.isFinite(value.point?.y)){lease.stage++;finish({active:true,point:value.point})}else finish({active:false})
    })().catch(() => finish({ active: false }))
    return true
  })
}
export async function clickTrustedLogin(job, expectedUrl, assertActive) {
  if (job.cachedLogin !== true) throw new Error('permission')
  const cap = crypto.randomUUID(), lease = { job, url: expectedUrl, assertActive, deadline: Date.now() + 6000,stage:0,pending:false }
  await check(lease)
  leases.set(cap, lease)
  let timer
  try {
    const reply = await Promise.race([
      chrome.runtime.sendMessage(TRUSTED_HELPER_ID, { type: 'login', cap, tabId: job.tabId, origin: job.origin, url: expectedUrl }),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('page_pending')), 6500) }),
    ])
    if (reply?.status !== 'submitted'||lease.stage!==4) throw new Error(reply?.error === 'permission' ? 'permission' : 'tab_changed')
    return 'submitted'
  } finally {
    clearTimeout(timer); leases.delete(cap)
    void chrome.runtime.sendMessage(TRUSTED_HELPER_ID, { type: 'stop', cap }).catch(() => undefined)
  }
}
