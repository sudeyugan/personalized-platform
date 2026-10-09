import { chooseFortune, FORTUNE_KEYS } from '../../domain/fortune'
import { formatLocalDate } from '../../domain/localDate'
import { useLibraryStore } from '../../state/useLibraryStore'
import { getFortuneSign, getFortuneTheme } from '../fortune/themes'
import { drawRandomAnswer } from '../answer-book/drawAnswer'
import { truthQuestions } from '../truth/questions'
import { shuffledTruthDeck } from '../truth/truthDeck'
import type { AgentRitualServices } from './agent/ritualTools'

// A chat draw uses the same local banks as the pages; it never invents a result.
let truthDeck: number[] = []
let lastTruth: number | undefined

function requireModule(id: 'fortune' | 'truth' | 'answerBook') {
  const store = useLibraryStore.getState()
  if (!store.data.settings.modules.some((module) => module.id === id && module.enabled && module.available)) throw new Error('这个功能已关闭，请先在“功能与导航”中开启')
  const permission = store.data.companion.permissions
  if (!permission.fullAccess && !(id === 'answerBook' && permission.answerBook)) throw new Error('请先开启“完整程序权限”再使用这个本地动作')
  return store
}

export function createRitualServices(): AgentRitualServices {
  return {
    drawFortune(kind, guest) {
      const store = requireModule('fortune')
      const date = formatLocalDate()
      const previous = store.data.fortune?.[FORTUNE_KEYS[kind]]
      const draw = guest ? chooseFortune(undefined, date, Math.random, kind) : store.drawFortune(kind)
      const sign = getFortuneSign(kind, draw.signId)
      if (!sign) throw new Error('找不到这根签的本地签文')
      const reused = !guest && previous?.date === draw.date && previous.signId === draw.signId
      const text = [
        `${guest ? '为来客抽到' : reused ? '今天这筒已经抽过，仍是' : '为你抽到'}${getFortuneTheme(kind).name}第 ${sign.id} 签：${sign.grade} · ${sign.title}。`,
        sign.poem, ...sign.entries.map((entry) => `${entry.label}：${entry.text}`),
        guest ? '这支客签不占你的每日签，也不保存为个人签。' : '各筒每日一签；同一天再问不会重抽。',
        '这是本地原创心签，不是现实预测。',
      ].join('\n')
      if (!guest) useLibraryStore.getState().openAgentDestination({ destination: 'fortune', section: kind })
      return { text, kind, ...draw, reused, guest }
    },
    drawTruth() {
      requireModule('truth')
      if (!truthDeck.length) truthDeck = shuffledTruthDeck(lastTruth)
      lastTruth = truthDeck.shift()!
      return { text: `抽到一张真心话：${truthQuestions[lastTruth]}\n说多少都由你；这个动作不收集或保存回答。` }
    },
    drawAnswerBook() {
      requireModule('answerBook')
      return { text: `答案之书为你翻到：${drawRandomAnswer()}\n这是本地随机的一句话，不是现实预测，也没有自动收藏。` }
    },
  }
}
