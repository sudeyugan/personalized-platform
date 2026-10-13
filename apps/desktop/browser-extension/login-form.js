// Self-contained ISOLATED-world function. Never access input.value, cookies,
// browser credentials, storage, page JS or credential-bearing HTML.
export function inspectLoginForm(commit = false, expectedUrl = '', deadline = 0) {
  const state = status => ({ status })
  if (commit && (location.href !== expectedUrl || Date.now() > deadline)) return state('changed')
  const visible = node => Boolean(node?.isConnected && !node.closest('[hidden],[aria-hidden="true"],[data-private]') && node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden')
  const challenges = document.querySelectorAll('input[autocomplete="one-time-code"],input[name*="captcha" i],input[name*="verify" i],input[name*="otp" i],input[name*="code" i],iframe[src*="captcha" i],img[src*="captcha" i],[class*="second-auth"],[id*="captcha" i]')
  if ([...challenges].some(visible)) return state('needs_user')
  const passwords = [...document.querySelectorAll('input[type="password"]')].filter(visible)
  if (!passwords.length) {
    // Frame login/SSO is not a top-level form we can safely submit. Do not
    // mistake a readable embedded login page for an authenticated account.
    for (const frame of [...document.querySelectorAll('iframe,frame')].slice(0,4)) {
      if (!visible(frame)) continue
      try { if (frame.contentDocument?.querySelector('input[type="password"],input[autocomplete="one-time-code"]')) return state('needs_user') } catch { /* SOP enforced */ }
    }
    return state('none')
  }
  if (passwords.length !== 1) return state('needs_user')
  const password = passwords[0], form = password.form
  if (!form || password.disabled || password.readOnly || password.autocomplete === 'new-password') return state('needs_user')
  const accounts = [...form.querySelectorAll('input')].filter(node => visible(node) && ['text','email'].includes(node.type))
  if (accounts.length !== 1 || accounts[0].disabled || accounts[0].readOnly) return state('needs_user')
  const extra = [...form.querySelectorAll('input,select,textarea')].some(node => visible(node) && ![password,accounts[0]].includes(node) && !['hidden','checkbox','submit','button'].includes(node.type))
  if (extra) return state('needs_user')
  // Only boolean browser state, never the value or value attribute. Some
  // password managers/sites fill controls without Chromium's autofill marker.
  // :placeholder-shown is meaningful only if the control has a placeholder;
  // required validity is the fallback for controls without one. Otherwise stop.
  const filled = node => {
    try { if (node.matches(':autofill') || node.matches(':-webkit-autofill')) return true } catch { /* try other native state */ }
    try { if (node.hasAttribute('placeholder') && node.getAttribute('placeholder')?.trim()) return !node.matches(':placeholder-shown') } catch { /* unsupported selector */ }
    return node.required && node.willValidate && !node.validity.valueMissing
  }
  if (!filled(password) || !filled(accounts[0])) return state('unfilled')
  const buttons = [...form.querySelectorAll('button')].filter(node => visible(node) && !node.disabled && node.getAttribute('aria-disabled') !== 'true' && /^(?:登\s*[录入]|sign\s*in|log\s*in)$/i.test((node.textContent ?? '').trim()))
  if (buttons.length !== 1) return state('needs_user')
  const button = buttons[0]
  try {
    const target = new URL(button.getAttribute('formaction') ?? form.getAttribute('action') ?? location.href, document.baseURI)
    const method = (button.getAttribute('formmethod') ?? form.getAttribute('method') ?? 'get').toLowerCase()
    const destination = button.getAttribute('formtarget') ?? form.getAttribute('target') ?? ''
    if (method !== 'post' || target.protocol !== 'https:' || target.origin !== location.origin || target.username || target.password || target.port || !['','_self'].includes(destination)) return state('needs_user')
  } catch { return state('needs_user') }
  // Re-evaluated in this same synchronous invocation, not a replayed selector.
  if (!commit) return state('ready')
  if (Date.now() > deadline) return state('changed')
  button.click()
  return state('submitted')
}
