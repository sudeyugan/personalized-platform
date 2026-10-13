import type { ReplyDocument, ToolReceipt } from './types'
import { object, safeError, text, safeReplyUrl } from './safety'
import { queryPresentation } from './queryPresentation'
import { liveStatusReply } from '../agent/liveStatusReply'
import { localRitualReply, localRitualTools } from '../agent/ritualTools'
import { publicReadTools } from '../agent/publicReadTools'
import { assignmentAcknowledged, pendingAcknowledged } from './writeAcknowledgement'

const labels: Record<string, string> = {
  'todo.create': '创建待办', 'todo.update': '修改待办', 'todo.set_completed': '更新待办完成状态', 'todo.set_holiday': '调整待办休假', 'todo.list': '待办查询',
  'assignment.list': '作业查询', 'assignment.create': '添加作业', 'assignment.set_submitted': '更新作业本期已交标记', 'assignment.set_period': '调整本期作业',
  'calendar.list_events': '日历查询', 'calendar.create_event': '创建日历事务', 'calendar.update_event': '修改日历事务', 'course.list': '课表查询',
  'diary.get': '查看日记', 'diary.search': '日记查询', 'diary.write': '保存日记', 'diary.append': '追加日记',
  'work.get_current': '当前作品', 'chapter.get': '章节内容', 'chapter.search': '章节查询', 'character.search': '人物查询', 'place.search': '地点查询', 'timeline.search': '时间线查询', 'record.get': '查看资料',
  'experience.list': '经历册查询', 'experience.get': '查看经历', 'asset.list': '素材查询', 'music.get_current': '当前音乐', 'memory.search': '记忆查询',
  'daily_question.list': '每日问题', 'answer_book.list_favorites': '答案收藏', 'mood.get_day': '当日情绪', 'mood.get_summary': '情绪统计',
  'web.search': '公开搜索', 'web.read_page': '读取公开网页', 'web.read_json': '读取公开数据', 'web.live_status': '查询实时开播状态',
  'browser.followed_live': '关注直播查询', 'browser.tabs': '已授权网页', 'browser.read_page': '读取已授权页面', 'browser.status': '浏览器连接检查',
  'browser.ensure_page':'准备授权页面','browser.observe':'观察当前页面','browser.act':'页面导航与检索','browser.verify':'核验任务证据',
  'task.create': '任务已创建，等待执行结果', 'computer.takeover': '接管面板已准备，尚未开始操作',
  'operation.prepare': '方法面板已准备，尚未执行', 'operation.propose': '方法草稿已准备，尚未保存',
  'system.open': '已交给系统打开', 'app.open': '页面切换', 'music.control': '音乐控制',
  'screen.record_start': '录制已开始，尚未完成视频', 'screen.record_stop': '结束录制',
  'fortune.draw': '抽签结果', 'truth.draw': '真心话抽取', 'answer_book.draw': '答案之书',
}
const pendingTools = new Set(['task.create','computer.takeover','operation.prepare','operation.propose','system.open','screen.record_start'])
const hiddenTools = new Set(['companion.set_state'])
export function visibleReceipt(receipt: ToolReceipt) { return !hiddenTools.has(receipt.call.name) || !receipt.result.success }
export function toolPresentation(receipt: ToolReceipt): ReplyDocument {
  const { call, result, definition } = receipt
  const label = labels[call.name] ?? text(definition?.description.split(/[，。；;]/)[0], 36) ?? '工具调用'
  const data = object(result.data)
  if (!result.success) {
    const cancelled = result.error?.code === 'AgentCancelled' || /取消|已停止/.test(result.error?.message ?? '')
    return { state: cancelled ? 'cancelled' : 'failed', title: label, blocks: [{ type: 'text', text: safeError(result.error?.message) }], notes: call.name === 'browser.followed_live' ? ['不能据此判断你关注的主播都未开播。'] : ['未把失败当作已完成；之前已执行的其他步骤不会自动撤销。'] }
  }
  if (data.success === false || data.ok === false || data.opened === false || data.created === false || (data.saved === false && !(call.name === 'operation.propose' && data.prepared === true)) || data.status === 'failed') return { state: 'unknown', title: label, blocks: [], notes: ['工具没有提供可核验的完成结果。'] }
  if (data.timedOut === true) return { state: 'unknown', title: label, blocks: [], notes: ['执行超时，结束状态尚未确认。'] }
  if (typeof data.exitCode === 'number' && data.exitCode !== 0) return { state: 'failed', title: label, blocks: [], notes: [`程序返回退出码 ${data.exitCode}，没有把它当作成功完成。`] }
  if (call.name === 'system.open' && (data.opened !== true || data.status !== 'submitted_to_default_handler' || !text(data.target))) return { state: 'unknown', title: '打开结果尚未确认', blocks: [], notes: ['没有可核验的系统提交回执，不能声称已打开。'] }
  if (call.name === 'process.run' && (data.detached === true || (data.started === true && data.exitCode === undefined))) return { state: 'pending', title: '程序已启动，结束状态尚未确认', blocks: [], notes: ['启动不等于运行完成。'] }
  if (pendingTools.has(call.name)) {
    if (!pendingAcknowledged(receipt)) return { state: 'unknown', title: '操作准备结果尚未确认', blocks: [], notes: ['没有可核验的准备或启动回执，不能声称已开始。'] }
    const url = call.name === 'system.open' && data.opened === true && data.target === object(call.arguments).target ? safeReplyUrl(data.target) : undefined
    return { state: 'pending', title: label, blocks: url ? [{ type: 'list', items: [{ title: '目标网页', link: { label: '打开网页', url } }] }] : [], notes: [call.name === 'system.open' ? '仅表示已交给默认程序，不代表页面已加载或主播已开播。' : '请在对应面板核对并继续；准备或创建不等于执行完成。'] }
  }
  if (localRitualTools.has(call.name)) return { state: text(data.text) ? 'completed' : 'unknown', title: label, blocks: [{ type: 'text', text: localRitualReply(result) }], notes: [] }
  if (call.name === 'web.live_status') {
    const args = object(call.arguments), target = safeReplyUrl(args.roomUrl)
    const body = liveStatusReply(result, String(args.expectedName ?? ''), target ?? '')
    const verified = typeof data.fetchedAtEpochMs === 'number' && Date.now() - data.fetchedAtEpochMs <= 60000 && Date.now() - data.fetchedAtEpochMs >= -5000 && data.anchorName === args.expectedName && ['live','offline','replay'].includes(String(data.status))
    return { state: verified ? 'completed' : 'unknown', title: label, blocks: [{ type: 'text', text: body.replace(/\n\[直播间\]\([^\n]*\)/g,'') }, ...(target ? [{ type: 'list' as const, items: [{ title: '官方直播间', link: { label: '进入直播间', url: target } }] }] : [])], notes: [] }
  }
  const readOnly = definition?.risk === 'read_only' || definition?.capability === 'read' || ['browser.read_page','browser.ensure_page','browser.act'].includes(call.name) && definition?.risk === 'low' || call.name === 'web.search' || publicReadTools.has(call.name)
  if (readOnly) {
    const query = queryPresentation(receipt, label)
    if (query) {
      if (data.cached === true) query.notes.push('这是缓存结果，并非本次新获取。')
      if (data.truncated === true && query.state === 'completed') { query.state = 'partial'; query.notes.push('本次返回不完整。') }
      return query
    }
    const body = text(result.data, 1800)
    return { state: 'completed', title: label, blocks: body ? [{ type: 'text', text: body }] : [], notes: body ? [] : ['本次调用已返回；未自动展示原始对象或未知字段。'] }
  }
  const title = text(data.title ?? data.name ?? object(call.arguments).title, 100)
  const acknowledged = assignmentAcknowledged(receipt) || result.data === true || ['created','saved','updated','deleted','renamed','changed','written','copied','moved','closed','focused','clicked','typed','pressed','stopped','appended','captured'].some(key => data[key] === true)
    || (call.name === 'app.open' && Boolean(text(data.destination))) || (call.name === 'music.control' && typeof data.playing === 'boolean') || (typeof data.exitCode === 'number' && data.exitCode === 0)
  return { state: acknowledged ? 'completed' : 'unknown', title: label, blocks: title ? [{ type: 'list', items: [{ title }] }] : [], notes: [...(acknowledged ? [] : ['调用已返回，但没有明确的完成回执；不会自动输出原始对象。']), ...(call.name === 'assignment.set_submitted' ? ['这里只更新本机已交标记，没有向教务网站提交作业。'] : [])] }
}
