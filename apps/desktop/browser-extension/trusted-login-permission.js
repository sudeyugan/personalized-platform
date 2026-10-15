import { trustedHelperStatus } from './trusted-login.js'
import { TRUSTED_HELPER_ID } from './trusted-helper-id.js'
// Browser debugger cannot be optional. The separate component is installed
// explicitly; this switch only opts into its use, not a browser permission.
export function bindTrustedLoginPermission(checkbox, status) {
  const refresh = async () => {
    const helper = await trustedHelperStatus(), { trustedLoginEnabled } = await chrome.storage.local.get('trustedLoginEnabled')
    checkbox.checked = helper.connected && trustedLoginEnabled === true
    status.textContent = helper.updating ? '组件正在自动更新，请稍后重试。' : !helper.installed ? '未安装可选组件；在一隅「扩展管理」准备组件后，到Edge加载一次。' : !helper.connected ? '组件已安装，请点击下方按钮连接。' : checkbox.checked ? '已启用，仅用于当前允许自动登录的网站；关闭可停止使用。' : '已连接，当前不使用可信点击。'
  }
  checkbox.addEventListener('change', async () => {
    const enabling = checkbox.checked
    checkbox.disabled = true
    try {
      if (enabling && !(await trustedHelperStatus()).connected) throw new Error('unconnected')
      await chrome.storage.local.set({ trustedLoginEnabled: enabling })
      await refresh()
    } catch {
      checkbox.checked = !enabling
      status.textContent = '尚未连接可选组件，没有启用可信点击；请先安装并连接。'
    } finally { checkbox.disabled = false }
  })
  void refresh().catch(() => { status.textContent = '无法读取权限状态。'; checkbox.disabled = true })
}
export async function connectTrustedHelper() {
  if (!(await trustedHelperStatus()).installed) throw new Error('请先在一隅准备可信点击组件，再到Edge加载这个独立目录。')
  const nonce = crypto.randomUUID()
  await chrome.storage.local.set({ trustedLoginPending: { nonce, expires: Date.now() + 180000 } })
  await chrome.tabs.create({ url: `chrome-extension://${TRUSTED_HELPER_ID}/connect.html#reader=${chrome.runtime.id}&nonce=${nonce}` })
}
