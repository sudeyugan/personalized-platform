import type { AgentToolResult } from '../companion/agent/types'

// Website nicknames are text, not Markdown supplied by a trusted author.
function websiteText(text: string) {
  return text.replace(/[\r\n\u2028\u2029]/g, ' ').replace(/[\\`*\[\]]/g, '\\$&')
}

export function followedLiveReply(result: AgentToolResult) {
  if (!result.success) return `这次没有查到：${result.error?.message ?? 'Edge读取失败'}。不能据此判断你关注的主播都未开播。`
  const snapshot = result.data as { verified?: boolean; fetchedAtEpochMs?: number; data?: { rooms?: { name: string; title?: string; roomId: number; liveStatus: number }[]; complete?: boolean } } | undefined
  if (snapshot?.verified !== true || !Array.isArray(snapshot.data?.rooms)) return '当前浏览器结果无法核验，不能确认开播情况。'
  const live = snapshot.data.rooms.filter(room => room.liveStatus === 1)
  const date = new Date(snapshot.fetchedAtEpochMs ?? Number.NaN)
  const time = Number.isFinite(date.getTime()) ? `${date.toLocaleTimeString('zh-CN', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit' })} 查询` : '本次查询'
  const coverage = snapshot.data.complete ? '' : ' · 仅为部分结果，其他关注主播状态未知。'
  const footer = `> ${time}${coverage}`
  if (!live.length) return `${snapshot.data.complete ? '这次查到的关注主播都未开播。' : '这次查到的部分关注里，没有主播正在直播。'}\n\n${footer}`
  return [
    `查到 **${live.length} 位**你关注的主播正在直播：`,
    '',
    ...live.slice(0, 20).flatMap(room => [
      `- ${websiteText(room.name)} · [进入直播间](https://live.bilibili.com/${room.roomId})`,
      ...(room.title?.trim() ? [`  ${websiteText(room.title.trim())}`] : []),
    ]),
    '',
    ...(live.length > 20 ? ['这里只列出前 20 位。', ''] : []),
    footer,
  ].join('\n')
}
