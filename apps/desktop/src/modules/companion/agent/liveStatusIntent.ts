export function parseLiveStatusIntent(message: string) {
  let text = message.normalize('NFKC').trim().replace(/[?？。！!]+$/u, '')
  if (/^(?:如果|假如|为什么|怎么|如何|不要|别|不用|是否能|能否)|(?:斗鱼|虎牙|抖音|快手)/u.test(text)) return undefined
  text = text.replace(/^(?:(?:请|帮我|替我|麻烦)[,，\s]*)*(?:(?:查询|查|看看|查看)(?:一下)?[,，\s]*)?/u, '')
  const match = /^(?:(?:b站|哔哩哔哩|bilibili)[的\s]*)?(.+?)(?:现在|今天|此刻)?(?:开播了没|开播了吗|开播没|有没有开播|是否开播|在直播吗|正在直播吗)$/iu.exec(text)
  const name = match?.[1]?.trim()
  if (!name || [...name].length > 60 || /[,，。!！?？;；]|(?:并且|然后|顺便|打开|录屏|送礼|登录|关注|查一下|查查|开播)/u.test(name)) return undefined
  return name
}
