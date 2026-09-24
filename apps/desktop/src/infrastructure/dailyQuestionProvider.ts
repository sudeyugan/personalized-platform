import type { CompanionData, DailyQuestion, LibraryData } from '../domain/models'
import { assertExternalAiAllowed } from '../modules/trust/trustPolicy'
import { createPrivacyProtectedProvider } from '../modules/privacy'
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

function focusForDate(date: string) {
  const value = [...date].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 20
  if (value < 12) return '自我觉察：防御、欲望、羞耻、控制、逃避、自我叙事或身份认同'
  if (value < 16) return '关系中的自我：边界、讨好、依赖、嫉妒、信任或权力'
  if (value < 19) return '社会镜像：从成功、工作、消费、阶层或舆论落回用户自身如何参与其中'
  return '个人经验中的哲学：自由、责任、意义、变化或有限性'
}

const weakQuestionPatterns = [
  /如果有一天|假如有一天|假设有一天/,
  /突然(?:能|可以|拥有|失去|听见|看见|知道)/,
  /所有人的?(?:内心|想法|秘密)/,
  /(?:你会|你更愿意|你更想).{0,48}(?:还是|或者|或是)/,
  /你认为.{0,16}(?:是什么|意味着什么)[？?]?$/,
]

export function isLowQualityDailyQuestion(question: string) {
  return weakQuestionPatterns.some((pattern) => pattern.test(question.trim()))
}

export function validateDailyQuestionDraft(value: Record<string, unknown>) {
  const question = String(value.question ?? '').trim()
  const background = String(value.background ?? '').trim()
  const followUp = String(value.followUp ?? '').trim()
  const topic = String(value.topic ?? '').trim()
  const errors: string[] = []
  if (!question || !background || !followUp || !topic) errors.push('字段不完整')
  if (question.length < 18 || question.length > 100) errors.push('主问题应为 18 至 100 字')
  if (!/(?:你|自己)/.test(question)) errors.push('主问题必须落回用户自身')
  if (isLowQualityDailyQuestion(question)) errors.push('不得使用虚构能力、空泛假设或二选一')
  if (background.length < 12 || background.length > 160) errors.push('背景应为一至两句')
  if (followUp.length < 12 || followUp.length > 100) errors.push('追问需要具体且克制')
  if (topic.length < 2 || topic.length > 24) errors.push('核心命题长度不合适')
  return { question, background, followUp, topic, errors }
}

function parseJson(text: string) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]
  return JSON.parse(fenced ?? text) as Record<string, unknown>
}

export async function generateDailyQuestion(companion: CompanionData, history: DailyQuestion[], trust: LibraryData['settings']['trust'], date = beijingDate()): Promise<DailyQuestion> {
  const tone = toneForDate(date)
  if (companion.provider.providerId === 'mock') {
    throw new Error('请先在 AI 伙伴设置中选择并配置 DeepSeek，朝问不会使用内置问题库')
  }
  assertExternalAiAllowed(companion.provider.providerId, trust, 'daily_question')
  const recentTopics = history.slice(-90).map((item) => item.topic)
  const recentQuestions = history.slice(-14).map((item) => `${item.topic}：${item.question}`)
  const provider = createPrivacyProtectedProvider(createCompanionProvider(companion.provider), { trust, destination: companion.provider.providerId, purpose: '朝问生成' })
  let previousErrors: string[] = []

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await provider.generate({
      context: { page: 'home', companion: { name: companion.name }, localTime: { timeZone: 'Asia/Shanghai', date, time: '08:00:00', weekday: '', period: '上午' } },
      tools: [],
      messages: [
        { role: 'system', content: '你为个人数字空间“一隅”生成每日自省问题。目标不是制造有趣脑洞，而是帮助用户从真实经历识别自己的心理防御、关系模式、价值冲突和选择代价。问题必须从用户能够回忆的行为、感受、关系或决定切入，并最终落回“我为何如此”。禁止超能力、末日、读心、失忆等虚构情境；禁止“选择 A 还是 B”的人格测试式问题；禁止空泛宏大命题、知识测验和预设标准答案。社会与哲学议题必须以个人如何参与、相信或回避为入口。在生成前比较不同候选，只输出最值得书写的一题。只输出 JSON，不要 Markdown，不展示分析过程。字段必须是 question、background、followUp、topic；background 一至两句，followUp 追问用户正在保护什么、害怕失去什么或实际付出什么代价，topic 不超过 12 字。' },
        { role: 'user', content: `日期：${date}。今日侧重：${focusForDate(date)}。语气：${tone === 'sharp' ? '敏锐但不冒犯，指出自我叙事中的矛盾与代价' : '深刻、平衡、能够由一段真实经历进入'}。近90天已用主题：${recentTopics.length ? recentTopics.join('、') : '无'}。最近14天完整问题：${recentQuestions.length ? recentQuestions.join('\n') : '无'}。${previousErrors.length ? `上一候选未通过：${previousErrors.join('；')}。请换一个命题重新生成。` : ''}` },
      ],
    })
    if (response.type !== 'text') throw new Error('每日问题生成不应调用应用 Tool')
    let value: Record<string, unknown>
    try { value = parseJson(response.text) }
    catch { previousErrors = ['返回内容不是有效 JSON']; continue }
    const draft = validateDailyQuestionDraft(value)
    if (!draft.errors.length) {
      return { id: `daily-question-${crypto.randomUUID()}`, date, question: draft.question, background: draft.background, followUp: draft.followUp, topic: draft.topic, tone, createdAt: new Date().toISOString() }
    }
    previousErrors = draft.errors
  }
  throw new Error('今天的问题没有通过内容筛选，请稍后再试')
}