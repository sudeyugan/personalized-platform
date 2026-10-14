import { permitted } from './policy.js'
import { inspectLoginForm } from './login-form.js'
import { clickTrustedLogin, hasTrustedLoginClick } from './trusted-login.js'

const known = new Set(['none','ready','unfilled','needs_user','changed','submitted','rejected'])
export async function continueCachedLogin(job, assertActive) {
  const check = async () => {
    if (!await permitted(job.origin)) throw new Error('permission')
    const tab = await chrome.tabs.get(job.tabId)
    if (tab.incognito || !tab.url || new URL(tab.url).origin !== job.origin) throw new Error('tab_changed')
    return tab
  }
  const inspect = async (args = []) => {
    const replies = await chrome.scripting.executeScript({ target:{tabId:job.tabId,allFrames:false}, world:'ISOLATED', func:inspectLoginForm, args })
    const status = replies[0]?.result?.status
    if (!known.has(status)) throw new Error('failed')
    return status
  }
  const before = await check()
  let status = await inspect()
  if (status === 'none') return
  if (!job.cachedLogin) return 'not_allowed'
  // Let an asynchronous browser/password-manager fill settle, without
  // querying its credentials or submitting again. Recheck task and URL each time.
  for (let attempt = 0; status === 'unfilled' && attempt < 6; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 500))
    await assertActive(job)
    if ((await check()).url !== before.url) throw new Error('tab_changed')
    status = await inspect()
    if (status === 'none') return
  }
  if (status !== 'ready') return status === 'unfilled' ? 'unfilled' : 'needs_user'
  // Native checks task id, epoch, expiry and opt-in immediately before the
  // sole possible click. No auth token is injected into or returned by pages.
  await assertActive(job)
  if ((await check()).url !== before.url) throw new Error('tab_changed')
  if (await hasTrustedLoginClick()) {
    try { status = await clickTrustedLogin(job, before.url, assertActive) }
    catch (error) {
      if (['permission','tab_changed','page_pending'].includes(error?.message)) throw error
      // A debugger conflict/policy restriction is not missing mail. Do not
      // silently fall back or issue another login attempt.
      return 'needs_user'
    }
  } else status = await inspect([true, before.url, Date.now() + 1000])
  if (status === 'changed') throw new Error('tab_changed')
  if (status !== 'submitted') return status === 'unfilled' ? 'unfilled' : 'needs_user'
  // Never click a second time. Disappearing form is only a continuation hint,
  // not proof of authenticated inbox/absence of unread messages.
  for (let attempt = 0; attempt < 16; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 500))
    await assertActive(job)
    const tab = await check()
    try { status = await inspect(['submitted_check']) } catch { if (tab.status === 'loading') continue; throw new Error('failed') }
    if (status === 'rejected') return 'submit_rejected'
    if (status === 'none' && tab.status !== 'loading') return 'continued'
    if (status === 'needs_user') return 'needs_user'
  }
  return 'pending'
}
