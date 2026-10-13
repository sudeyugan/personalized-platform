import type { AgentToolResult } from './types'

export function liveStatusReply(result: AgentToolResult, expectedName: string, target: string) {
  if (!result.success) return `没有查到实时开播状态：${result.error?.message.slice(0, 300) || '查询失败'}。这不表示未开播。`
  const data = result.data && typeof result.data === 'object' ? result.data as Record<string, unknown> : {}
  const reason = typeof data.reason === 'string' ? data.reason.slice(0, 300) : '接口未提供明确状态'
  if (data.status === 'unknown') return `暂时无法确认「${expectedName}」是否开播：${reason}。没有用搜索摘要推断未开播。\n[直播间](${target})`
  const age = typeof data.fetchedAtEpochMs === 'number' ? Date.now() - data.fetchedAtEpochMs : Infinity
  if (age < -5000 || age > 60000 || data.anchorName !== expectedName || !['live', 'offline', 'replay'].includes(String(data.status))) return '返回结果缺少可核对的主播身份、有效获取时间或明确状态，暂时无法确认是否开播。'
  const state = data.status === 'live' ? '正在直播' : data.status === 'offline' ? '尚未开播' : '正在轮播，不是实时直播'
  const time = new Date(data.fetchedAtEpochMs as number).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })
  return `「${expectedName}」${state}。\n查询时间：${time}（北京时间），依据本次B站公开接口，已核对主播与房间；状态之后可能变化。\n[直播间](${target})`
}
