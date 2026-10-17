// Only code-owned diagnostics may cross the native error boundary. Never echo
// an arbitrary rejection body, which could contain account or secret data.
const messages: Record<string, string> = {
  BROWSER_MANAGED_INSTALL:'专用浏览器运行组件未就绪或找不到已安装的Edge，请检查Edge安装并更新一隅。无需另装Node.js。',
  BROWSER_MANAGED_FAILED:'专用浏览器未完成这一步，可能是网页限制、会话过期或控件变化；没有确认查询结果。需要登录时请在设置中打开专用登录窗口。',
  BROWSER_MANAGED_LOGIN:'小鱼专用浏览器的账号尚未登录或已失效。请在浏览器设置中点对应网站“登录”，完成后点“结束登录”。日常Edge账号不会自动继承。',
  BROWSER_LOGIN_ACTIVE:'专用浏览器正在手动登录。请完成登录后回到设置点“结束登录”，再查询；不会自动切走你的登录窗口。',
  BROWSER_RUNTIME_INTEGRITY:'专用浏览器运行文件校验未通过，已停止执行。请更新或重新安装一隅，不会继续运行被改变的文件。',
  BROWSER_STALE:'页面或控件已经变化，旧操作引用已作废；需要重新观察后再操作。',
  BROWSER_ACTION_BLOCKED:'控件尚不能安全点击，没有派发操作；可重新观察当前页面。',
  BROWSER_ACTION_UNKNOWN:'已经尝试操作，但页面结果尚未确认；只允许重新观察和核验，本轮不会重复操作。',
  BROWSER_UPDATE_REQUIRED:'扩展需要更新。旧扩展本次需在Edge重新加载一次，之后自动维护；请在连接设置中核对扩展版本和加载目录。',
  BROWSER_NOT_CONNECTED: '尚未连接Edge扩展。请到「设置 → AI伙伴 → 权限与记录 → Edge浏览器连接」准备扩展文件，在Edge加载扩展并输入连接码。浏览器已登录不代表小鱼已连接。',
  BROWSER_OFFLINE: '已配对的Edge扩展当前不在线。请打开安装该扩展的Edge配置，检查扩展已启用并显示连接正常，再重试。',
  BROWSER_SITE_PERMISSION: '本次网站尚未完成Edge确认，或授权已撤销。请在「Edge浏览器连接」连接已添加的网站，再在Edge确认页授权，不必重复填写域名。',
  BROWSER_LOGIN: 'Edge当前B站账号未登录或登录已失效。请在安装该扩展的同一个Edge配置中手动登录B站，再重试。',
  BROWSER_DISABLED: '浏览器读取尚未开启。请在「设置 → AI伙伴 → 权限与记录 → Edge浏览器连接」开启读取，并核对联网与外部AI授权。',
  BROWSER_TIMEOUT: 'Edge扩展或网站读取超时。请检查连接和目标页面后重试；本次查询结果未知。',
  BROWSER_READ_FAILED: '目标网页或只读接口没有返回可用结果；本次查询结果未知，不代表没有邮件、更新或开播。',
  BROWSER_PAGE_PENDING: '目标页面尚未加载完成。已停止本次读取，没有重复打开或操作；页面加载后可再查询。',
  BROWSER_PAGE_OPEN: '未能准备好查询页面，本次尚未读取到结果。请稍后重试；这不代表没有邮件或更新。',
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

const managedMessages:Record<string,string>={
  BROWSER_LOGIN_ACTIVE:'专用浏览器正在登录或示范，查询不会打断它。请先结束登录，或保存/丢弃示范；当前未取得查询结果。',
  BROWSER_BUSY:'专用浏览器正被另一项操作使用。请先结束当前登录、示范或查询；没有关闭或替换当前窗口。',
  BROWSER_SITE_PERMISSION:'本次网站尚未在专用浏览器授权，或页面操作未开启。请在浏览器连接设置核对精确网站与操作范围；不会改查其他账号或Edge扩展。',
  BROWSER_DISABLED:'小鱼专用浏览器尚未开启，请在浏览器设置开启，并核对联网与外部AI处理权限。',
  BROWSER_TIMEOUT:'专用浏览器或网站响应超时，已停止本次操作；结果未知，不代表没有邮件或更新。',
  BROWSER_TAB_CHANGED:'后台页面发生跳转或已关闭，旧页面引用不可用；需要重新准备并观察，不必手动保持日常Edge标签页。',
  BROWSER_RESULT:'专用浏览器结果未通过页面身份或字段校验，不能确认查询结果；没有继续使用可疑结果。',
}
export function browserNativeError(reason: unknown,command=''): Error & {browserCode?:string} {
  const raw = typeof reason === 'string' ? reason : reason instanceof Error ? reason.message : ''
  const code = /^\s*(BROWSER_[A-Z_]+):/u.exec(raw)?.[1]
  const message=command.startsWith('managed_browser_')&&code&&Object.hasOwn(managedMessages,code)?managedMessages[code]:code&&Object.hasOwn(messages,code)?messages[code]:'本机浏览器连接调用失败，请在Edge浏览器连接设置中检查连接状态，必要时重启一隅。查询结果未知。'
  return Object.assign(new Error(message),code&&Object.hasOwn(messages,code)?{browserCode:code}:{})
}
