// Sole privileged surface: fixed Input events. No Runtime/DOM/Network reads.
export async function trustedClick(job, readerId, validate) {
  const target = { tabId: job.tabId }, deadline = Date.now() + 6000
  let attached = false, stopped = false, closed = false
  const bounded = async promise => {
    let timer
    try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('page_pending')), Math.max(0, deadline - Date.now())) })]) }
    finally { clearTimeout(timer) }
  }
  const check = async mode => {
    if (stopped || Date.now() > deadline) throw new Error('tab_changed')
    const { reader } = await bounded(chrome.storage.local.get('reader'))
    if (reader !== readerId || !await bounded(chrome.permissions.contains({ permissions: ['debugger'] }))) throw new Error('permission')
    const tab = await bounded(chrome.tabs.get(job.tabId))
    // This component has no tabs/host permission: Edge deliberately withholds
    // tab.url here. The reader revalidates exact URL/origin on every callback.
    // Do not add broad page access just to duplicate that check.
    if (tab.incognito || tab.id !== job.tabId) throw new Error('tab_changed')
    const reply = await bounded(validate(mode))
    if (stopped || Date.now() > deadline || reply?.active !== true) throw new Error('permission')
    return reply.point
  }
  const changed = (id, change) => { if (id === job.tabId && (change.url || change.status === 'loading')) stopped = true }
  const detached = source => { if (source.tabId === job.tabId) stopped = true }
  chrome.tabs.onUpdated.addListener(changed); chrome.debugger.onDetach.addListener(detached)
  job.stop = () => { stopped = true }
  try {
    await check('assert')
    await bounded(chrome.debugger.attach(target, '1.3').then(async () => { attached = true; if (closed) await chrome.debugger.detach(target).catch(() => undefined) }))
    const point = await check('target')
    if (!Number.isFinite(point?.x) || !Number.isFinite(point?.y) || point.x < 0 || point.y < 0) throw new Error('tab_changed')
    for (const type of ['mousePressed','mouseReleased']) {
      const current = await check('validate_target')
      if (current?.x !== point.x || current?.y !== point.y) throw new Error('tab_changed')
      await bounded(chrome.debugger.sendCommand(target, 'Input.dispatchMouseEvent', { type, ...point, button: 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1 }))
    }
    return { status: 'submitted' }
  } finally {
    closed = true; delete job.stop
    if (attached) {
      let timer
      await Promise.race([chrome.debugger.detach(target).catch(() => undefined), new Promise(resolve => { timer = setTimeout(resolve, 1000) })])
      clearTimeout(timer)
    }
    chrome.tabs.onUpdated.removeListener(changed); chrome.debugger.onDetach.removeListener(detached)
  }
}
