import type { AgentToolCall, AgentToolResult } from '../companion/agent/types'
import type { BrowserTaskGoal } from './taskGoal'
import { browserObjective } from './taskGoal'

export function browserPurposeBlock(message: string, call: AgentToolCall, task?: BrowserTaskGoal) {
  if (call.name !== 'browser.followed_live') return
  if ((task?.objective ?? browserObjective(message)) !== 'followed_live') return '关注直播工具只能回答当前关注主播的开播情况，不能回答视频更新、邮件或普通网页问题；本次没有请求这个用途。'
}
// Program-owned bounded query sequence. The page service may separately
// continue an opted-in cached login; page instructions cannot grant actions.
export class BrowserQueryFlow {
  readonly task: BrowserTaskGoal
  private readonly message: string
  private prepared=false
  requiresVerification=false
  private checkedUncertainAction=false
  constructor(task: BrowserTaskGoal, message: string) { this.task = task; this.message = message }
  get initialCall(): AgentToolCall | undefined {
    if (this.task.clarification || this.task.objective === 'followed_live' || this.task.origins.length !== 1) return
    return this.call('browser.tabs', { origin: this.task.origins[0] })
  }
  advance(call: AgentToolCall, result: AgentToolResult): { nextCall?: AgentToolCall; reply?: string } | undefined {
    if(call.name==='browser.collect'){this.requiresVerification=true;return}
    if (!['browser.tabs','browser.ensure_page','browser.read_page','browser.observe','browser.act'].includes(call.name)) return
    if(call.name==='browser.act'&&!result.success&&!this.checkedUncertainAction&&result.error?.code!=='PermissionDenied'&&!/授权|权限|取消|停止|不在线|失效/u.test(result.error?.message??'')){
      this.checkedUncertainAction=true
      return {nextCall:this.call('browser.observe',{origin:this.task.origins[0],tabId:(call.arguments as {tabId:number}).tabId})}
    }
    if (!result.success) return { reply: '目标网页没有读到，不能据此回答本次查询。请按上面的连接或授权提示处理后再试；没有继续遍历其他网站。' }
    const envelope = result.data as { data?: unknown; verified?: boolean }
    if (envelope?.verified !== true) return { reply: '页面回执无法核验，暂时不能判断本次查询结果。' }
    if(call.name==='browser.act'){
      if((envelope.data as {actionStatus?:string})?.actionStatus!=='dispatched')return {reply:'页面控件已变化或动作不符合安全范围；没有重复执行，请重新发起并观察。'}
      return {nextCall:this.call('browser.observe',{origin:this.task.origins[0],tabId:(call.arguments as {tabId:number}).tabId})}
    }
    if (['browser.read_page','browser.observe'].includes(call.name)) {
      const page = envelope.data as { loginState?: string;observationId?:string } | undefined
      this.requiresVerification=typeof page?.observationId==='string'
      const loginReply = browserLoginReply(page?.loginState)
      return loginReply ? {reply:loginReply} : undefined
    }
    const tabs = Array.isArray(envelope.data) ? envelope.data as Array<{ tabId?: number; title?: string; url?: string }> : []
    if(!tabs.length){
      if(!this.prepared){this.prepared=true;return {nextCall:this.call('browser.ensure_page',{origin:this.task.origins[0]})}}
      return {reply:'已经尝试准备本次授权页面，但没有取得可用标签页；目标结果仍未知，没有换账号或其他网站。'}
    }
    let selected = tabs.length === 1 ? tabs[0] : undefined
    if (!selected) {
      const matching = tabs.filter(tab => {
        if (typeof tab.url !== 'string') return false
        try {
          const url = new URL(tab.url)
          return this.message.includes(tab.url) || (this.task.objective === 'updates' && /\/dynamic(?:\/|$)/u.test(url.pathname))
        } catch { return false }
      })
      if (matching.length === 1) selected = matching[0]
    }
    if (!selected || !Number.isSafeInteger(selected.tabId) || selected.tabId! < 0) return { reply: '这个网站打开了多个页面或账号，暂时不能确定目标。请提供要查看的页面链接，或只保留目标页面后重试；不会任选一个账号读取。' }
    return { nextCall: this.call('browser.read_page', { origin: this.task.origins[0], tabId: selected.tabId! }) }
  }
  private call(name: string, args: Record<string, unknown>): AgentToolCall { return { id: `browser-goal-${crypto.randomUUID()}`, name, arguments: args } }
}
export function browserLoginReply(state?: string) {
  if(state==='managed_login')return '专用浏览器需要登录，尚未查到账号内容。可在网站选项开启“允许用已填凭据登录”，符合条件时只尝试一次；也可点“登录”直接用密码登录。完成后点“结束登录”，5分钟内自动续查当前问题。日常Edge账号不会自动继承。'
  if(state==='managed_unfilled')return '专用浏览器尚未确认账号和密码均已填好，没有点击登录。保存过密码不代表后台页面一定会自动填入；请在设置中点该网站的“登录”完成一次，或处理网站要求的验证。完成后点“结束登录”，5分钟内自动续查当前问题。不读取密码。'
  if(state==='managed_needs_user')return '这个登录页面需要你接手，可能涉及验证码、多账号、跨域认证或不支持的表单。小鱼没有继续自动提交；请在设置中点该网站的“登录”处理。完成后点“结束登录”，5分钟内会自动续查当前问题；不读取密码。'
  if(state==='managed_pending')return '本次已尝试一次登录，但还未确认进入账号页面，没有重复提交。请在设置中点该网站的“登录”查看提示，完成后点“结束登录”，5分钟内会自动续查当前问题；当前不能判断查询结果。'
  if (state === 'not_allowed') return '目标网页仍需登录，尚未检查到账号内容。可在设置 → Edge浏览器连接 → 该网站，勾选「允许用已填凭据登录」，之后小鱼会尝试提交已经填好的表单；不读取密码。'
  if (state === 'unfilled') return '目标网页仍需登录，暂未确认表单的账号和密码均已填入，因此没有点击登录。若页面已经显示填好的内容，也可能是该表单不支持安全检测；请在Edge完成一次登录，再让我检查。不读取密码，也不会猜测或选取账号。'
  if (state === 'needs_user') return '登录页面需要你处理：可能有验证码、二次验证、多账号、不支持的表单，或可信点击被浏览器策略/其他调试器阻止。请关闭该页的开发者工具或手动完成登录后再查询。已停止自动登录，没有重复提交或读取其他网站。'
  if (state === 'pending') return '已尝试提交一次登录，但尚未确认进入账号页面。没有重复点击；请查看Edge里的登录提示，完成后再让我检查。不能据此判断是否有未读邮件。'
  if (state === 'submit_rejected') return '网页拒绝了这次登录，提示密码未输入；这不代表浏览器没有保存或显示密码。浏览器可能需要一次真实点击才能将已填凭据交给网页。可在设置中准备并安装独立「可信点击组件」，连接后启用，或手动点一次登录后再查询。没有重试、读取密码，也不能据此判断有没有新邮件。'
}
