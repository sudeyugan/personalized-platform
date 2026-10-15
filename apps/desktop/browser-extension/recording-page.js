// Injected only into the selected top-level authorised page. No input values,
// HTML, screenshots, coordinates or arbitrary text are returned or stored.
export function maintainRecordingPage(lease) {
  const key = '__yiyuRecording', previous = globalThis[key]
  if (!lease) { previous?.close(); return { ready: false } }
  if (previous?.id === lease.id) return { ready: previous.renew(lease) }
  previous?.close()
  const state = { id: lease.id, phase: lease.phase, expires: 0, timer: undefined }
  const send = payload => { if (Date.now() >= state.expires) return; void chrome.runtime.sendMessage({ type: 'recording_page', recordingId: state.id, ...payload }).catch(() => {}) }
  const host = document.createElement('div'); host.setAttribute('data-yiyu-recording', '')
  Object.assign(host.style, { all: 'initial', position: 'fixed', right: '16px', bottom: '16px', zIndex: '2147483647' })
  const shadow = host.attachShadow({ mode: 'closed' }), panel = document.createElement('div'), label = document.createElement('span')
  Object.assign(panel.style, { font: '12px "Microsoft YaHei",sans-serif', color: '#f7f0e7', background: '#675549', padding: '11px 13px', borderRadius: '12px', boxShadow: '0 4px 18px #0003', display: 'flex', alignItems: 'center', gap: '8px' })
  panel.append(label)
  const pause = document.createElement('button')
  for (const [button,action,text] of [[pause,'pause','暂停'],[document.createElement('button'),'stop','停止'],[document.createElement('button'),'cancel','取消']]) {
    button.textContent = text
    Object.assign(button.style, { font: 'inherit', color: 'inherit', background: '#ffffff18', border: '1px solid #ffffff35', borderRadius: '6px', padding: '4px 7px', cursor: 'pointer' })
    button.addEventListener('click', event => { if (event.isTrusted) send({ action: action === 'pause' && state.phase === 'paused' ? 'resume' : action }) })
    panel.append(button)
  }
  shadow.append(panel); document.documentElement.append(host)
  const visiblePanel = () => { const style = getComputedStyle(host); return host.isConnected && host.getClientRects().length > 0 && style.display !== 'none' && style.visibility !== 'hidden' && style.visibility !== 'collapse' && style.opacity !== '0' }
  const visible = node => !node.closest('[hidden],[aria-hidden="true"],[data-private]') && node.getClientRects().length > 0
  const name = node => {
    const label = node.getAttribute('aria-label') || node.getAttribute('title')
    if (label) return label.slice(0, 64)
    // Small control labels only; never serialize this text or traverse a row.
    return [...node.childNodes].slice(0, 4).filter(child => child.nodeType === 3).map(child => child.data.slice(0, 48)).join('').slice(0, 64)
  }
  const cue = node => {
    const label = name(node).replace(/\s+/g, '').toLowerCase()
    if (/发送|删除|支付|付款|购买|转账|send|delete|pay|purchase/i.test(label)) return null
    const labels = [['inbox','收件箱','inbox'],['unread','未读','unread'],['all','全部','all'],['notifications','通知','notifications'],['updates','动态','updates'],['following','我的关注','following'],['next','下一页','next'],['previous','上一页','previous'],['refresh','刷新','refresh'],['search','搜索','search']]
    for (const [value,...names] of labels) if (names.some(text => label === text || label.startsWith(text) && /^[\d()（）]+$/.test(label.slice(text.length)))) return value
    return node.getAttribute('role') === 'tab' ? 'unknown_tab' : 'unknown_button'
  }
  let lastFormClick
  const formEvent = (type, cue) => {
    // A submit-button click followed by its submit is one action. Do not
    // collapse real repeated navigation (e.g. two successive next-page clicks).
    if (type === 'submit' && lastFormClick?.cue === cue && Date.now() - lastFormClick.at < 500) { lastFormClick = undefined; return }
    if (type === 'click') lastFormClick = { cue, at: Date.now() }
    send({ action: 'event', cue })
  }
  const record = event => {
    if (!visiblePanel()) { send({ action: 'stop' }); close(); return }
    if (!event.isTrusted || state.phase !== 'recording' || Date.now() >= state.expires || event.composedPath().includes(host)) return
    const node = event.target instanceof Element ? event.target.closest('button,a[href],[role="button"],[role="tab"]') : null
    if (event.type === 'submit') {
      const form = event.target
      if (!(form instanceof HTMLFormElement) || !visible(form)) return
      if (form.querySelector('input[type="password"]')) formEvent('submit', 'manual_auth')
      else if (form.method.toLowerCase() === 'get' && form.querySelector('input[type="search"],input[name="q"],input[name="query"]')) formEvent('submit', 'search')
      return
    }
    if (!node || !visible(node)) return
    const form = node.closest('form')
    if (form) {
      if (form.querySelector('input[type="password"]')) formEvent('click', 'manual_auth')
      else if (form.method.toLowerCase() === 'get' && form.querySelector('input[type="search"],input[name="q"],input[name="query"]')) formEvent('click', 'search')
      return // No send/delete/payment/unknown form controls recorded.
    }
    const value=cue(node)
    if(value)send({ action: 'event', cue: value });else send({ action: 'pause' })
  }
  const close = () => { clearTimeout(state.timer); document.removeEventListener('click', record, true); document.removeEventListener('submit', record, true); host.remove(); if (globalThis[key] === state) delete globalThis[key] }
  state.close = close
  state.renew = next => { if (!visiblePanel()) { send({ action: 'stop' }); close(); return false } state.phase = next.phase; state.expires = Date.now() + Math.min(4500, next.ttlMs); clearTimeout(state.timer); state.timer = setTimeout(close, Math.min(4500, next.ttlMs)); label.textContent = state.phase === 'paused' ? '示范已暂停' : '正在示范 · 不录屏'; pause.textContent = state.phase === 'paused' ? '继续' : '暂停'; return true }
  globalThis[key] = state; if (!state.renew(lease)) return { ready: false }
  document.addEventListener('click', record, true); document.addEventListener('submit', record, true)
  return { ready: true }
}
