const parameters = new URLSearchParams(location.hash.slice(1)), reader = parameters.get('reader'), nonce = parameters.get('nonce')
const status = document.getElementById('status'), confirm = document.getElementById('confirm')
document.getElementById('reader').textContent = reader && /^[a-p]{32}$/.test(reader) ? `原只读扩展：${reader}` : '请先在原小鱼扩展弹窗点击「连接可信点击组件」。'
confirm.disabled = !/^[a-p]{32}$/.test(reader ?? '') || !/^[a-f0-9-]{36}$/.test(nonce ?? '')
confirm.addEventListener('click', async () => {
  confirm.disabled = true
  try {
    const reply = await chrome.runtime.sendMessage(reader, { type: 'trusted_login_pair', nonce })
    if (reply?.accepted !== true) throw new Error('expired')
    await chrome.storage.local.set({ reader })
    status.textContent = '已连接，仅允许这个只读扩展的当前授权登录任务。'
    history.replaceState(null, '', location.pathname)
  } catch { status.textContent = '连接请求已过期或来源无法核验，请从原扩展重新发起。'; confirm.disabled = false }
})
document.getElementById('disconnect').addEventListener('click', async () => { await chrome.storage.local.remove('reader'); status.textContent = '已解除连接，不再接受登录任务。'; confirm.disabled = true })
