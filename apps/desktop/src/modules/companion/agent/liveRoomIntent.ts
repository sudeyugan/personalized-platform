// Only explicit, single-purpose Bilibili requests get the deterministic flow.
// Questions, negations, quoted instructions and compound tasks stay with the agent.
export function parseLiveRoomIntent(message: string): string | undefined {
  const value = message.trim().replace(/[。！!]+$/, '').trim()
  if (/[?？，,；;\n]|(?:不要|不用|不想|先不|别帮|能否|可以吗|怎么办|如何|如果|假如|然后|顺便|并且|录屏|截图|送礼|登录|弹幕)/u.test(value)) return undefined
  const command = value.replace(/^(?:(?:请|麻烦|帮我|替我|给我)\s*)*/u, '')
    .replace(/^(?:我)?(?:现在)?(?:想要|想)\s*/u, '')
  const platform = '(?:b站|哔哩哔哩|bilibili)'
  const action = '(?:打开|进入|观看|看看|看|找找|找到|找|搜索|搜|去)'
  const patterns = [
    new RegExp(`^去\\s*${platform}\\s*${action}\\s*(?:主播\\s*)?(.+?)(?:的)?\\s*直播(?:间)?$`, 'iu'),
    new RegExp(`^${action}\\s*(?:一下\\s*)?(?:在\\s*)?${platform}\\s*(?:上|里|的)?\\s*(?:主播\\s*)?(.+?)(?:的)?\\s*直播(?:间)?$`, 'iu'),
    new RegExp(`^${action}\\s*(?:一下\\s*)?(?:主播\\s*)?(.+?)\\s*(?:在|的)\\s*${platform}\\s*(?:上|的)?\\s*(?:的)?直播(?:间)?$`, 'iu'),
  ]
  const captured = patterns.map(pattern => pattern.exec(command)?.[1]).find(Boolean)
  const name = captured?.trim().replace(/^[「『“"《]+|[」』”"》]+$/gu, '').trim()
  if (!name || /^(?:的|主播|直播|直播间)$/u.test(name) || [...name].length > 60 || /[<>[\]{}\r\n"“”「」『』《》]|(?:以及|并打开|和打开|直播间)/u.test(name)) return undefined
  return name
}
