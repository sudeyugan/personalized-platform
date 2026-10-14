import { permitted } from './policy.js'
import { inspectLoginForm } from './login-form.js'

export async function hasTrustedLoginClick() {
  return Boolean(chrome.debugger && await chrome.permissions.contains({ permissions: ['debugger'] }))
}
// Fixed command surface, not a general CDP transport. No Runtime/DOM/Network
// reads, credentials, model-selected coordinates, frames or debugger events.
export async function clickTrustedLogin(job, expectedUrl, assertActive) {
  if (job.cachedLogin !== true) throw new Error('permission')
  const target = { tabId: job.tabId }, deadline = Date.now() + 6000
  let attached = false, stopped = false, closed = false
  const bounded = async promise => {
    let timer
    try {
      return await Promise.race([promise, new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('page_pending')), Math.max(0, deadline - Date.now()))
      })])
    } finally { clearTimeout(timer) }
  }
  const changed = (id, change) => { if (id === job.tabId && (change.url || change.status === 'loading')) stopped = true }
  const removed = () => { stopped = true }
  const detached = source => { if (source.tabId === job.tabId) stopped = true }
  const check = async () => {
    if (stopped || Date.now() > deadline) throw new Error('tab_changed')
    await bounded(assertActive(job))
    if (!await bounded(hasTrustedLoginClick()) || !await bounded(permitted(job.origin))) throw new Error('permission')
    const tab = await bounded(chrome.tabs.get(job.tabId))
    if (stopped || Date.now() > deadline || tab.incognito || tab.url !== expectedUrl || new URL(tab.url).origin !== job.origin) throw new Error('tab_changed')
  }
  const inspect = async mode => {
    const result = await bounded(chrome.scripting.executeScript({ target: { tabId: job.tabId, allFrames: false }, world: 'ISOLATED', func: inspectLoginForm, args: [mode, expectedUrl, deadline] }))
    const value = result[0]?.result, point = value?.point
    if (value?.status !== 'ready' || !point || !Number.isFinite(point.x) || !Number.isFinite(point.y) || point.x < 0 || point.y < 0) throw new Error('tab_changed')
    return point
  }
  chrome.tabs.onUpdated.addListener(changed)
  chrome.permissions.onRemoved.addListener(removed)
  chrome.debugger.onDetach.addListener(detached)
  try {
    await check()
    // Attach conflicts fail closed; never detach another debugger/session.
    await bounded(chrome.debugger.attach(target, '1.3').then(async () => {
      attached = true
      if (closed) await chrome.debugger.detach(target).catch(() => undefined)
    }))
    await check()
    const point = await inspect('target')
    await check()
    await inspect('validate_target')
    if (stopped || Date.now() > deadline) throw new Error('tab_changed')
    await bounded(chrome.debugger.sendCommand(target, 'Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', buttons: 1, clickCount: 1 }))
    await check()
    await inspect('validate_target')
    if (stopped || Date.now() > deadline) throw new Error('tab_changed')
    await bounded(chrome.debugger.sendCommand(target, 'Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', buttons: 0, clickCount: 1 }))
    return 'submitted'
  } finally {
    closed = true
    if (attached) {
      // Request cleanup even at expiry; do not let a hung detach block the job.
      let cleanupTimer
      await Promise.race([chrome.debugger.detach(target).catch(() => undefined), new Promise(resolve => { cleanupTimer = setTimeout(resolve, 1000) })])
      clearTimeout(cleanupTimer)
    }
    chrome.tabs.onUpdated.removeListener(changed)
    chrome.permissions.onRemoved.removeListener(removed)
    chrome.debugger.onDetach.removeListener(detached)
  }
}
