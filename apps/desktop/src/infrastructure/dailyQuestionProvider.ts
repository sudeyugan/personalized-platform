import type { CompanionData, DailyQuestion } from '../domain/models'
import { createCompanionProvider } from './companionProvider'

const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' })

export function beijingDate(now = new Date()) {
  return formatter.format(now)
}

export function isBeijingMorningReady(now = new Date()) {
  const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Shanghai', hour: '2-digit', hourCycle: 'h23' }).format(now))
  return hour >= 8
}

function toneForDate(date: string): DailyQuestion['tone'] {
  return [...date].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 10 < 3 ? 'sharp' : 'balanced'
}

function parseJson(text: string) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]
  return JSON.parse(fenced ?? text) as Record<string, unknown>
}

export async function generateDailyQuestion(companion: CompanionData, history: DailyQuestion[], date = beijingDate()): Promise<DailyQuestion> {
  const tone = toneForDate(date)
  if (companion.provider.providerId === 'mock') {
    throw new Error('请先在 AI 伙伴设置中选择并配置 DeepSeek，朝问不会使用内置问题库')
  }
  const recentTopics = history.slice(-90).map((item) => item.topic)
  const response = await createCompanionProvider(companion.provider).generate({
    context: { page: 'home', companion: { name: companion.name } },
    tools: [],
    messages: [
      { role: 'system', content: '你为个人数字空间“一隅”生成每日思考问题。只输出 JSON，不要 Markdown，不给答案，不说教。字段必须是 question、background、followUp、topic。问题不依赖搜索或专业知识，只讨论一个核心矛盾；background 1至2句；topic 是不超过12字的核心命题。' },
      { role: 'user', content: `日期：${date}。语气：${tone === 'sharp' ? '更尖锐，挑战习惯性价值判断或自我叙事' : '深刻、平衡、可由个人经验进入'}。近90天已用主题：${recentTopics.length ? recentTopics.join('、') : '无'}。请避免重复，围绕自我觉察、人生选择、人际关系、伦理、哲学或社会议题提出一个具体问题。` },
    ],
  })
  if (response.type !== 'text') throw new Error('每日问题生成不应调用应用 Tool')
  const value = parseJson(response.text)
  const question = String(value.question ?? '').trim()
  const background = String(value.background ?? '').trim()
  const followUp = String(value.followUp ?? '').trim()
  const topic = String(value.topic ?? '').trim()
  if (!question || !background || !followUp || !topic) throw new Error('模型返回的每日问题格式不完整')
  return { id: `daily-question-${crypto.randomUUID()}`, date, question, background, followUp, topic: topic.slice(0, 24), tone, createdAt: new Date().toISOString() }
}
