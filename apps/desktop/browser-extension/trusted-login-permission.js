// Must request from an explicit extension UI gesture, never a task/page/model.
export function bindTrustedLoginPermission(checkbox, status) {
  const refresh = async () => {
    checkbox.checked = await chrome.permissions.contains({ permissions: ['debugger'] })
    status.textContent = checkbox.checked ? '已授权；仅在允许自动登录的网站短暂点击。可随时关闭。' : '默认关闭。需要真实点击的登录页可在这里授权。'
  }
  checkbox.addEventListener('change', async () => {
    const enabling = checkbox.checked
    checkbox.disabled = true
    try {
      // Start request synchronously inside this user gesture.
      const granted = enabling ? await chrome.permissions.request({ permissions: ['debugger'] }) : await chrome.permissions.remove({ permissions: ['debugger'] })
      await refresh()
      if (enabling && !granted) status.textContent = '未授权，仍使用原登录方式；也可手动登录。'
    } catch {
      checkbox.checked = !enabling
      status.textContent = '权限变更未完成，请重试或检查 Edge 的扩展权限。'
    } finally { checkbox.disabled = false }
  })
  void refresh().catch(() => { status.textContent = '无法读取权限状态。'; checkbox.disabled = true })
}
