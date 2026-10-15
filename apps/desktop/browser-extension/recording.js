import { permitted, siteOrigin, bridgeCall } from './policy.js'
import { maintainRecordingPage } from './recording-page.js'
const cues = new Set(['inbox','unread','all','notifications','updates','following','next','previous','refresh','search','manual_auth','navigation','unknown_button','unknown_tab'])
let current, queue = Promise.resolve()
async function sameTab(lease) {
  if (!await permitted(lease.origin)) throw new Error('permission')
  const tab = await chrome.tabs.get(lease.tabId)
  if (tab.incognito || !tab.url || new URL(tab.url).origin !== lease.origin) throw new Error('tab_changed')
  return tab
}
export async function clearRecording() {
  const old = current; current = undefined
  if (old) { try { await sameTab(old); await chrome.scripting.executeScript({ target: { tabId: old.tabId, allFrames: false }, world: 'ISOLATED', func: maintainRecordingPage, args: [null] }) } catch { /* injected lease self-expires */ } }
}
async function post(lease, action, cue) {
  const { connectionCode } = await chrome.storage.local.get('connectionCode')
  if (!connectionCode || current?.id !== lease.id || Date.now() >= lease.expires) throw new Error('permission')
  await sameTab(lease)
  return bridgeCall('/record', { recordingId: lease.id, action, ...(cue ? { cue } : {}) }, connectionCode)
}
export async function maintainRecording(raw) {
  if (!raw) { await clearRecording(); return }
  if (!/^[a-f0-9]{64}$/.test(raw.id) || !Number.isSafeInteger(raw.tabId) || raw.tabId < 0 || !['recording','paused'].includes(raw.phase) || raw.ttlMs !== 4500 || siteOrigin(raw.origin) !== raw.origin || Object.keys(raw).some(key => !['id','origin','tabId','phase','ttlMs'].includes(key))) throw new Error('failed')
  if (current && (current.id !== raw.id || current.tabId !== raw.tabId || current.origin !== raw.origin)) await clearRecording()
  const old = current, lease = { ...raw, expires: Date.now() + 4500 }; current = lease
  try {
    const before = await sameTab(lease)
    const replies = await chrome.scripting.executeScript({ target: { tabId: lease.tabId, allFrames: false }, world: 'ISOLATED', func: maintainRecordingPage, args: [raw] })
    await sameTab(lease)
    if (current !== lease) return
    if (replies[0]?.result?.ready !== true) throw new Error('page_access')
    lease.documentId = replies[0].documentId
    if (old?.id === lease.id && old.documentId && lease.documentId && old.documentId !== lease.documentId && lease.phase === 'recording') await post(lease, 'event', 'navigation')
    if (before.status === 'loading') return
    chrome.action.setBadgeText({ text: lease.phase === 'recording' ? '录' : '停' })
  } catch {
    // Keep earlier safe steps for review, not another page/account capture.
    const { connectionCode } = await chrome.storage.local.get('connectionCode')
    if (connectionCode && current === lease) await bridgeCall('/record', { recordingId: lease.id, action: 'stop' }, connectionCode).catch(() => undefined)
    await clearRecording()
  }
}
export function handleRecordingMessage(message, sender, reply) {
  if (message?.type !== 'recording_page') return false
  const lease = current
  let senderOrigin
  try { senderOrigin = new URL(sender.url).origin } catch { /* malformed or missing sender is rejected */ }
  if (!lease || sender.id !== chrome.runtime.id || sender.frameId !== 0 || sender.tab?.id !== lease.tabId || senderOrigin !== lease.origin || message.recordingId !== lease.id || lease.documentId && sender.documentId !== lease.documentId || Object.keys(message).some(key => !['type','recordingId','action','cue'].includes(key)) || !['event','pause','resume','stop','cancel'].includes(message.action) || message.action === 'event' && !cues.has(message.cue) || message.action !== 'event' && message.cue !== undefined) { reply({ accepted: false }); return true }
  queue = queue.catch(() => undefined).then(async () => { await post(lease, message.action, message.cue); reply({ accepted: true }) }).catch(() => reply({ accepted: false }))
  return true
}
