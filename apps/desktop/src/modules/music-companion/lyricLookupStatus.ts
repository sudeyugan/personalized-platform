import type { LyricFailureReason, SavedLyrics } from '../../domain/lyricLibrary'

export function reasonForLyricError(error: unknown): LyricFailureReason {
  const code = String(error)
  if (code.includes('LYRICS_RATE_LIMITED')) return 'rate-limit'
  if (code.includes('LYRICS_TIMEOUT')) return 'timeout'
  if (code.includes('LYRICS_INVALID_RESPONSE') || code.includes('LYRICS_TOO_LARGE')) return 'invalid-response'
  return 'network'
}
export function cachedLyricStatus(entry: SavedLyrics, online: boolean, qq: boolean) {
  if (entry.lookupScope === 'removed') return '已移除，本曲自动查询暂停6小时；可主动重新查找'
  if (entry.failureReason === 'private') return '歌曲信息含私密词，未发送；可导入LRC'
  const prefix = online ? '' : '自动收集已关闭；'
  if (entry.failureReason === 'timeout') return prefix + '上次歌词查询超时，尚未完成；可重新查找'
  if (entry.failureReason === 'network') return prefix + '上次歌词来源连接失败；请检查网络/系统代理后重新查找'
  if (entry.failureReason === 'rate-limit') return prefix + '歌词来源请求受限，稍后恢复'
  if (entry.failureReason === 'invalid-response') return prefix + '上次来源数据无法使用；可重新查找'
  if (entry.failureReason === 'unsynced' || entry.failureReason === 'ambiguous') return prefix + lyricOutcome(entry.failureReason)
  if (!qq && entry.lookupScope !== 'qqmusic+lrclib') return prefix + '目前仅查询LRCLIB；中文歌曲可启用「优先使用QQ音乐歌词」'
  return prefix + (entry.failureReason === 'not-found' ? '已启用来源未匹配此录音版本；可重新查找' : '上次查询未完成或未匹配，新版将重新检查')
}
export function lyricOutcome(outcome?: string) {
  if (outcome === 'unsynced') return '来源有这首歌，但没有带时间轴的歌词；可导入LRC'
  if (outcome === 'ambiguous') return '找到多个不同的录音版本，未自动套用；可导入此版本LRC'
  return '来源暂未收录这个录音版本的同步歌词；可重新查找或导入LRC'
}
export function lyricFailure(error: unknown) {
  const code = String(error)
  const seconds = Number(code.match(/LYRICS_RATE_LIMITED:(\d+)/)?.[1])
  if (Number.isFinite(seconds) && seconds > 0) return { message: '歌词来源请求受限，稍后自动恢复', delay: seconds * 1000, rateLimited: true }
  if (code.includes('LYRICS_TIMEOUT')) return { message: '歌词查询超时，请检查网络后重新查找', delay: 5 * 60 * 1000 }
  if (code.includes('LYRICS_SOURCE_UNAVAILABLE')) return { message: '歌词来源暂时不可用；稍后可重新查找', delay: 5 * 60 * 1000 }
  if (code.includes('LYRICS_INVALID_METADATA')) return { message: '歌曲信息不完整或时长不支持；可导入LRC', delay: 6 * 60 * 60 * 1000 }
  if (code.includes('LYRICS_INVALID_RESPONSE') || code.includes('LYRICS_TOO_LARGE')) return { message: '歌词来源返回了无法使用的数据；可重新查找或导入LRC', delay: 30 * 60 * 1000 }
  if (code.includes('LYRICS_')) return { message: '暂时无法连接歌词来源；可检查网络后重新查找', delay: 5 * 60 * 1000 }
  return { message: '歌词查询或本地保存失败；可重新查找，并检查资料保存状态', delay: 30 * 60 * 1000 }
}
