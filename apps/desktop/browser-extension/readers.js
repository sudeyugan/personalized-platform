import { BILIBILI_SITES, permitted, publicUrl, siteOrigin } from './policy.js'
import { snapshotPage } from './page.js'
import { continueCachedLogin } from './login.js'
import { ensureTaskPage,waitTaskPage,taskControls,performTaskAction } from './task-driver.js'

function failure(code) { throw new Error(code) }
async function requireSites(sites) { for (const site of sites) if (!await permitted(site)) failure('permission') }
export function decodeFollowPage(body) {
  if (body?.code === -101) failure('login')
  if (body?.code !== 0 || !body.data || !Array.isArray(body.data.rooms ?? body.data.list)) failure('failed')
  const raw = body.data.rooms ?? body.data.list
  if (raw.length > 5000) failure('failed')
  const rooms = raw.slice(0, 90).map(item => {
    const uid = item.uid, roomId = item.room_id ?? item.roomid, liveStatus = item.live_status
    if (!Number.isSafeInteger(uid) || uid <= 0 || !Number.isSafeInteger(roomId) || roomId <= 0 || ![0, 1, 2].includes(liveStatus) || typeof item.uname !== 'string' || !item.uname.trim()) failure('failed')
    return { uid, roomId, name: item.uname.trim().slice(0, 80), title: typeof item.title === 'string' ? item.title.slice(0, 200) : '', liveStatus }
  })
  const total = body.data.count ?? body.data.total
  return { rooms, total: Number.isSafeInteger(total) && total >= 0 ? total : null }
}
async function officialJson(url, signal) {
  const response = await fetch(url, { method: 'GET', credentials: 'include', redirect: 'error', cache: 'no-store', signal })
  if (!response.ok || !response.headers.get('content-type')?.includes('json')) failure('failed')
  const reader = response.body?.getReader(); if (!reader) failure('failed')
  const chunks = []; let size = 0
  while (true) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength; if (size > 131072) { await reader.cancel(); failure('failed') } chunks.push(part.value) }
  const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) } catch { failure('failed') }
}
async function followedLive() {
  await requireSites(BILIBILI_SITES)
  const signal = AbortSignal.timeout(18000)
  // Fixed read-only official endpoints, never accept URLs/headers/scripts from a model.
  const nav = await officialJson('https://api.bilibili.com/x/web-interface/nav', signal)
  if (nav.code === -101 || nav.data?.isLogin === false) failure('login')
  if (nav.code !== 0 || nav.data?.isLogin !== true) failure('failed')
  await requireSites(BILIBILI_SITES)
  // Official navbar uses hit_ab=true: a live follow list, not paginated follows.
  // Never infer completeness merely from a short or empty returned list.
  const result = decodeFollowPage(await officialJson('https://api.live.bilibili.com/xlive/web-ucenter/v1/xfetter/GetWebList?hit_ab=true', signal))
  const seen = new Set(), rooms = result.rooms.filter(room => { const key = `${room.uid}:${room.roomId}`; if (seen.has(key)) return false; seen.add(key); return true })
  const total = result.total, complete = total !== null && rooms.length === total
  await requireSites(BILIBILI_SITES)
  return { loggedIn: true, rooms, checked: rooms.length, total, complete }
}
export async function readJob(job, assertActive = async () => { throw new Error('failed') }) {
  if (!job || !['tabs', 'page', 'followed_live','ensure','observe','act'].includes(job.kind)) failure('failed')
  if (job.cachedLogin && (!['page','observe'].includes(job.kind) || job.cachedLogin !== true)) failure('failed')
  const site = siteOrigin(job.origin); await requireSites([site])
  if(job.kind==='ensure')return ensureTaskPage(job,assertActive)
  if (job.kind === 'followed_live') { if (site !== BILIBILI_SITES[0] || job.tabId != null) failure('failed'); return followedLive() }
  if (job.kind === 'tabs') {
    const tabs = await chrome.tabs.query({ url: `${site}/*` })
    await requireSites([site])
    return tabs.filter(tab => !tab.incognito && tab.url && new URL(tab.url).origin === site).slice(0, 20).map(tab => ({ tabId: tab.id, origin: site, title: (tab.title ?? '').slice(0, 200), url: publicUrl(tab.url) }))
  }
  if (!Number.isSafeInteger(job.tabId) || job.tabId < 0) failure('failed')
  if(job.kind==='act')return performTaskAction(job,assertActive)
  await waitTaskPage(job,assertActive)
  const loginState = await continueCachedLogin(job, assertActive)
  const before = await chrome.tabs.get(job.tabId)
  if (before.incognito || !before.url || new URL(before.url).origin !== site) failure('tab_changed')
  let results
  try{results=await chrome.scripting.executeScript({ target: { tabId: job.tabId, allFrames: false }, world: 'ISOLATED', func: snapshotPage })}catch{failure('page_access')}
  const after = await chrome.tabs.get(job.tabId); await requireSites([site])
  const result = results[0]?.result
  if (after.url !== before.url || result?.origin !== site || result?.url !== publicUrl(before.url)) failure('tab_changed')
  const controls=await taskControls(job)
  if((await chrome.tabs.get(job.tabId)).url!==before.url)failure('tab_changed')
  return { tabId: job.tabId, ...result, ...controls, ...(loginState ? { loginState } : {}) }
}
