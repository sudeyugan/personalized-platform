// Only code-owned diagnostics may cross the native error boundary. Never echo
// an arbitrary rejection body, which could contain account or secret data.
const messages: Record<string, string> = {
  BROWSER_UPDATE_REQUIRED:'扩展需要更新。旧扩展本次需在Edge重新加载一次，之后自动维护；请在连接设置中核对扩展版本和加载目录。',
  BROWSER_NOT_CONNECTED: '尚未连接Edge扩展。请到「设置 → AI伙伴 → 权限与记录 → Edge浏览器连接」准备扩展文件，在Edge加载扩展并输入连接码。浏览器已登录不代表小鱼已连接。',
  BROWSER_OFFLINE: '已配对的Edge扩展当前不在线。请打开安装该扩展的Edge配置，检查扩展已启用并显示连接正常，再重试。',
  BROWSER_SITE_PERMISSION: '本次网站尚未完成Edge确认，或授权已撤销。请在「Edge浏览器连接」连接已添加的网站，再在Edge确认页授权，不必重复填写域名。',
  BROWSER_LOGIN: 'Edge当前B站账号未登录或登录已失效。请在安装该扩展的同一个Edge配置中手动登录B站，再重试。',
  BROWSER_DISABLED: '浏览器读取尚未开启。请在「设置 → AI伙伴 → 权限与记录 → Edge浏览器连接」开启读取，并核对联网与外部AI授权。',
  BROWSER_TIMEOUT: 'Edge扩展或网站读取超时。请检查连接和目标页面后重试；本次查询结果未知。',
  BROWSER_READ_FAILED: '目标网页或只读接口没有返回可用结果；本次查询结果未知，不代表没有邮件、更新或开播。',
  BROWSER_PAGE_PENDING: '目标页面尚未加载完成。已停止本次读取，没有重复打开或操作；页面加载后可再查询。',
  BROWSER_PAGE_OPEN: '未能在已连接的Edge打开目标页面。请检查这个Edge配置能否正常打开该网站，再重试。',
  BROWSER_PAGE_ACCESS: 'Edge未允许读取当前页面，可能是浏览器错误页或受限页面。请先检查该标签页；不能据此判断账号里的查询结果。',
  BROWSER_RESULT: '浏览器返回的数据未通过校验，不能确认查询结果。请更新扩展文件并在Edge扩展管理页重新加载，再重试。',
  BROWSER_AUTH: 'Edge连接已失效。请在小鱼中断开配对，重新生成连接码并在扩展中连接。',
  BROWSER_PAIR: 'Edge配对未完成、连接码已到期或已有配对。请核对连接状态；需要重新配对时先断开，再生成新的连接码。',
  BROWSER_PORT: '本机浏览器连接端口被其他程序占用，无法建立连接。不会连接该程序；请关闭占用后重试。',
  BROWSER_BUSY: '另一项浏览器读取还未结束。请等待完成，或在浏览器连接设置中停止读取后重试。',
  BROWSER_CANCELLED: '本次浏览器读取已停止或授权发生变化。旧结果不会继续使用；请核对设置后重新发起查询。',
  BROWSER_TAB_CHANGED: '读取时标签页已切换或跳转。请保持目标页面打开，再重新查询。',
  BROWSER_SITE: '网站地址无效。只接受公共HTTPS网站的精确域名，不接受端口、私网地址或通配符。',
  BROWSER_ARGUMENT: '浏览器读取参数不符合要求。本次没有执行，请重新发起查询。',
  BROWSER_WINDOW: '浏览器连接仅可由一隅主窗口执行，请重启一隅后重试。',
  BROWSER_STATE: '本机浏览器连接状态暂不可用，请重启一隅后重试。',
  BROWSER_RUNTIME: '本机浏览器任务中断，请重启一隅后重试。',
  BROWSER_EXPORT: '无法准备或更新Edge扩展文件。请关闭扩展弹窗后重试，并检查应用目录的写入权限。',
}

export function browserNativeError(reason: unknown): Error {
  const raw = typeof reason === 'string' ? reason : reason instanceof Error ? reason.message : ''
  const code = /^\s*(BROWSER_[A-Z_]+):/u.exec(raw)?.[1]
  return new Error(code && Object.hasOwn(messages, code) ? messages[code] : '本机浏览器连接调用失败，请在Edge浏览器连接设置中检查连接状态，必要时重启一隅。查询结果未知。')
}
