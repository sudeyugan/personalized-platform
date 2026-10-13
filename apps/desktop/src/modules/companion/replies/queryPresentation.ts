import type { ReplyDocument, ReplyItem, ToolReceipt } from './types'
import { object, text, safeReplyUrl, queryTime } from './safety'
import { browserLoginReply } from '../../browser-connection/queryFlow'

const mainFields = ['title', 'name', 'subject', 'anchorName', 'date', 'label']
const detailFields = ['excerpt', 'snippet', 'summary', 'description', 'note', 'displayTime', 'dueDate', 'time', 'location', 'teacher']
function item(value: unknown): ReplyItem | undefined {
  if (typeof value === 'string') return text(value) ? { title: text(value)! } : undefined
  const data = object(value), title = mainFields.map(key => text(data[key], 100)).find(Boolean)
  if (!title) return
  const details = detailFields.map(key => text(data[key], 220)).filter(Boolean).slice(0, 2)
  const url = safeReplyUrl(data.url ?? data.sourceUrl)
  return { title, detail: details.join(' · ') || undefined, link: url ? { label: '查看来源', url } : undefined }
}
export function queryPresentation(receipt: ToolReceipt, label: string): ReplyDocument | undefined {
  const { call, result } = receipt, name = call.name, data = object(result.data)
  if(name==='browser.verify')return {state:data.goalVerified===true?data.partial===true?'partial':'completed':'unknown',title:'已核对本次页面证据',blocks:[{type:'text',text:text(data.answer,800)??'当前证据不足。'}],notes:['只覆盖本次页面；不代表全部账号、历史新增或所有分页。']}
  if(name==='browser.act')return {state:'pending',title:data.data&&object(data.data).actionStatus==='dispatched'?'页面动作已发出，正在核验':'页面动作尚未执行',blocks:[],notes:['点击或检索提交不表示目标完成。']}
  if (name === 'browser.status') return { state: 'completed', title: label, blocks: [{ type: 'text', text: data.enabled !== true ? '浏览器连接未开启。' : data.paired !== true ? 'Edge扩展尚未配对。' : data.online !== true ? 'Edge扩展暂未在线。' : 'Edge扩展已连接；这只是连接检查，还没有读取目标内容。' }], notes: [] }
  if (name === 'browser.followed_live') {
    const body = object(data.data)
    if (data.verified !== true || !Array.isArray(body.rooms)) return { state: 'unknown', title: '无法核验关注直播结果', blocks: [], notes: ['不能确认开播情况。'] }
    const live = body.rooms.map(object).filter(room => room.liveStatus === 1)
    const items = live.slice(0, 20).flatMap(room => {
      const title = text(room.name, 80), id = room.roomId
      return title && typeof id === 'number' && Number.isSafeInteger(id) && id > 0 ? [{ title, detail: text(room.title, 200), link: { label: '进入直播间', url: `https://live.bilibili.com/${id}` } }] : []
    })
    return { state: body.complete === true ? live.length ? 'completed' : 'empty' : 'partial', title: live.length ? `查到 ${live.length} 位关注主播正在直播` : '本次返回的关注里未发现开播主播', blocks: items.length ? [{ type: 'list', items }] : [], notes: [queryTime(data.fetchedAtEpochMs) ?? '本次查询', ...(body.complete === true ? [] : ['仅为部分结果，其他关注主播状态未知。']), ...(live.length > 20 ? ['这里只列出前 20 位。'] : [])] }
  }
  if (name === 'browser.tabs' || name==='browser.ensure_page') {
    const tabs = Array.isArray(data.data) ? data.data.map(object) : []
    return listDocument(tabs.map(tab => ({ title: text(tab.title) ?? '已授权网页', url: safeReplyUrl(tab.url) })), label)
  }
  if (name === 'browser.read_page' || name==='browser.observe' || name === 'web.read_page') {
    const page = name.startsWith('browser.') ? object(data.data) : data
    const loginReply = name.startsWith('browser.') ? browserLoginReply(text(page.loginState)) : undefined
    if (loginReply) return { state:'pending',title:'尚未进入账号页面',blocks:[{type:'text',text:loginReply}],notes:[queryTime(data.fetchedAtEpochMs)??'本次检查'] }
    // Do not turn a requested private-page summary into a raw page dump (or
    // newly narrate the raw mailbox/account text through optional TTS).
    const body = name === 'web.read_page' ? text(page.text, 1800) : undefined
    const url = safeReplyUrl(page.url)
    return { state: page.loading === true || page.truncated === true ? 'partial' : typeof page.observationId==='string'?'pending':'completed', title: text(page.title, 100) ?? label, blocks: [...(body ? [{ type: 'text' as const, text: body }] : []), ...(url ? [{ type: 'list' as const, items: [{ title: '网页来源', link: { label: '查看原页', url } }] }] : [])], notes: [queryTime(data.fetchedAtEpochMs) ?? '本次读取',...(typeof page.observationId==='string'?['已读取页面，任务结论仍需当前证据核验。']:[]), ...(page.loading === true ? ['页面仍在加载，结果可能不完整。'] : []), ...(page.truncated === true || (body && typeof page.text === 'string' && page.text.length > 1800) ? ['正文仅展示节选。'] : [])] }
  }
  if (name === 'web.read_json') {
    const value = data.data
    const document = Array.isArray(value) ? listDocument(value, label) : undefined
    const scalar = typeof value === 'number' && Number.isFinite(value) ? String(value) : typeof value === 'boolean' ? value ? '是' : '否' : text(value, 800)
    const entry = item(value), url = safeReplyUrl(data.url)
    return { state: document?.state ?? 'completed', title: document?.title ?? label, blocks: [...(document?.blocks ?? (scalar ? [{ type: 'text' as const, text: scalar }] : entry ? [{ type: 'list' as const, items: [entry] }] : [])), ...(url ? [{ type: 'list' as const, items: [{ title: '数据来源', link: { label: '查看来源', url } }] }] : [])], notes: [queryTime(data.fetchedAtEpochMs) ?? '本次读取', ...(document?.notes ?? []), ...(!document && !scalar && !entry ? ['数据已读取；未知对象字段不直接展开。'] : [])] }
  }
  if (Array.isArray(result.data)) return listDocument(result.data, label)
  if (data.found === false) return { state: 'empty', title: `${label}：未找到匹配内容`, blocks: [], notes: [] }
  const entry = item(data)
  const content = text(data.plainText ?? data.content, 2400)
  if (entry || content) return { state: 'completed', title: label, blocks: [...(entry ? [{ type: 'list' as const, items: [entry] }] : []), ...(content ? [{ type: 'text' as const, text: content }] : [])], notes: content ? ['正文按本次返回内容展示，较长内容仅展示节选。'] : [] }
}
function listDocument(values: unknown[], label: string): ReplyDocument {
  const items = values.slice(0, 12).flatMap(value => { const entry = item(value); return entry ? [entry] : [] })
  return { state: values.length ? 'completed' : 'empty', title: `${label}：本次返回 ${values.length} 项`, blocks: items.length ? [{ type: 'list', items }] : [], notes: [...(values.length > 12 ? ['展示前 12 项；数量仅指本次返回结果。'] : []), ...(values.length && !items.length ? ['结果已读取，没有可安全展示的摘要字段。'] : [])] }
}
