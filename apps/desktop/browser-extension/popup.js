import { authorisedSites, bridgeCall } from './policy.js'
import { bindTrustedLoginPermission, connectTrustedHelper } from './trusted-login-permission.js'
const status = document.getElementById('status')
const wake = () => chrome.runtime.sendMessage({ type: 'wake' })
async function render() {
  const { connectionCode, connectionError } = await chrome.storage.local.get(['connectionCode', 'connectionError'])
  status.textContent = connectionError || (connectionCode ? '已配对；请保持一隅运行。' : '尚未连接一隅。')
  const container = document.getElementById('sites'); container.replaceChildren()
  for (const site of await authorisedSites()) {
    const row = document.createElement('div'); row.className = 'site-row'; const name = document.createElement('span'); name.textContent = new URL(site).hostname
    const button = document.createElement('button'); button.textContent = '撤销'; button.addEventListener('click', async () => { await chrome.permissions.remove({ origins: [`${site}/*`] }); await wake(); await render() })
    row.append(name, button); container.append(row)
  }
}
function action(id, run) { document.getElementById(id).addEventListener('click', async event => { const button = event.currentTarget; button.disabled = true; try { await run(); await render() } catch (error) { status.textContent = error instanceof Error ? error.message : '操作失败' } finally { button.disabled = false } }) }
action('connect', async () => { const code = document.getElementById('code').value.trim(); if (!/^[a-f0-9]{64}$/.test(code)) throw new Error('请输入一隅生成的完整连接码'); await bridgeCall('/pair', { code }); await chrome.storage.local.set({ connectionCode: code, connectionError: '' }); document.getElementById('code').value = ''; await wake() })
action('disconnect', async () => { await chrome.storage.local.remove(['connectionCode', 'connectionError']); status.textContent = '已忘记连接；也可在一隅中断开以撤销旧连接。' })
action('pending', async()=>{const {pendingSetup}=await chrome.storage.local.get('pendingSetup');if(!pendingSetup||pendingSetup.expiresAt<=Date.now())throw new Error('暂无待确认连接，请在一隅添加网站或点击连接');await chrome.tabs.create({url:chrome.runtime.getURL('setup.html')})})
action('connectTrusted', connectTrustedHelper)
bindTrustedLoginPermission(document.getElementById('trustedLogin'), document.getElementById('trustedLoginStatus'))
void render()
