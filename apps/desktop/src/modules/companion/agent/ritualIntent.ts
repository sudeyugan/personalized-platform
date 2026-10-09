import type { AgentToolCall, AgentToolDefinition } from './types'

export function resolveRitualAction(message: string, tools: AgentToolDefinition[]): AgentToolCall | undefined {
  const command = message.replace(/^(?:你[，,\s]*)?(?:(?:请|麻烦|帮我|替我|给我|试着|尝试|我想让你)[，,\s]*)*/, '').trim()
  // Only a complete explicit command is routed locally. Discussion, negation,
  // multiple actions and a named third-party recipient remain model requests.
  let name: string | undefined
  let args: Record<string, unknown> = {}
  if (/^(?:为|替|帮)?(?:别人|朋友|来客)(?:抽|求)(?:一|1)?(?:根|支|个)?(?:今日|每日|恋爱|爱情|感情|姻缘|前程|事业|未来)?签(?:吧|一下)?[。！!\s]*$/.test(command) || /^(?:抽|求)(?:一|1)?(?:根|支|个)?(?:今日|每日|恋爱|爱情|感情|姻缘|前程|事业|未来)?(?:签|签文)(?:吧|一下|给我)?[。！!\s]*$/.test(command)) {
    name = 'fortune.draw'
    args = { kind: /恋爱|爱情|感情|姻缘/.test(command) ? 'love' : /前程|事业|未来/.test(command) ? 'future' : 'daily', guest: /别人|朋友|来客/.test(command) }
  } else if (/^(?:抽|来|给我|翻)(?:一|1)?(?:张|个|道)?真心话(?:卡|题目|问题)?(?:吧|一下)?[。！!\s]*$/.test(command)) name = 'truth.draw'
  else if (/^(?:翻开|翻|抽取|抽)(?:一下)?(?:答案之书|答案书)(?:的一页|一页|吧|一下)?[。！!\s]*$/.test(command)) name = 'answer_book.draw'
  if (!name || !tools.some((tool) => tool.name === name)) return
  return { id: `direct-${crypto.randomUUID()}`, name, arguments: args }
}
