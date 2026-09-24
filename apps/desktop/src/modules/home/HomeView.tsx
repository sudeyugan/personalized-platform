import { emitTo } from '@tauri-apps/api/event'
import { ArrowRight, BookOpenText, Feather, MessageCircle, PenLine, Plus, Quote, RefreshCw } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { formatLocalDate } from '../../domain/localDate'
import { beijingDate, generateDailyQuestion, isBeijingMorningReady, isLowQualityDailyQuestion } from '../../infrastructure/dailyQuestionProvider'
import { useLibraryStore } from '../../state/useLibraryStore'
import { HomeMoodCard } from '../mood/HomeMoodCard'
import { useLiveDate } from './homeDate'

export function HomeView() {
  const { data, navigate, selectChapter, createWork, saveMoodEntry, deleteMoodEntry, saveDailyQuestion, startDailyQuestionDiary, setCompanionDesktop } = useLibraryStore()
  const activeWork = data.works.find((work) => work.id === data.session.activeWorkId) ?? data.works[0]
  const latestChapter = Object.values(data.chapters).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]
  const totalWords = Object.values(data.chapters).reduce((sum, chapter) => sum + chapter.wordCount, 0)
  const progress = activeWork ? Math.min(100, Math.round((totalWords / activeWork.targetWords) * 100)) : 0
  const writingEnabled = data.settings.modules.find((module) => module.id === 'writing')?.enabled ?? true
  const today = useLiveDate()
  const [questionError, setQuestionError] = useState('')
  const [questionBusy, setQuestionBusy] = useState(false)
  const [retry, setRetry] = useState(0)
  const generating = useRef(false)
  const questionDate = beijingDate()
  const dailyQuestion = data.planner.dailyQuestions.find((item) => item.date === questionDate)
  const replaceLowQualityQuestion = dailyQuestion ? isLowQualityDailyQuestion(dailyQuestion.question) : false

  useEffect(() => {
    const ensureQuestion = async () => {
      if (!isBeijingMorningReady() || (dailyQuestion && !replaceLowQualityQuestion) || generating.current) return
      generating.current = true
      setQuestionBusy(true)
      setQuestionError('')
      try { saveDailyQuestion(await generateDailyQuestion(data.companion, data.planner.dailyQuestions, data.settings.trust, questionDate)) }
      catch (error) { setQuestionError(error instanceof Error ? error.message : '今天的问题暂时没有抵达') }
      finally { generating.current = false; setQuestionBusy(false) }
    }
    void ensureQuestion()
    const timer = window.setInterval(() => void ensureQuestion(), 60_000)
    return () => window.clearInterval(timer)
  }, [dailyQuestion, data.companion, data.planner.dailyQuestions, data.settings.trust, questionDate, replaceLowQualityQuestion, retry, saveDailyQuestion])

  const talkAboutQuestion = async () => {
    if (!dailyQuestion) return
    setCompanionDesktop(true)
    if ('__TAURI_INTERNALS__' in window) await emitTo('main', 'companion:chat-open-request', { draft: `我想聊聊今天的朝问：${dailyQuestion.question}` })
  }

  return (
    <main className="home-view scroll-view">
      <section className="welcome-block">
        <div>
          <p className="eyebrow"><Feather size={15} /> {today.weekday} · 宜记录</p>
          <h1>{today.greeting}，欢迎回到一隅</h1>
          <p>不必追赶时间。坐下来，继续写一点属于你的故事。</p>
        </div>
        <div className="date-orb"><span>{today.month}</span><strong>{today.day}</strong><small>{today.year}</small></div>
      </section>

      <HomeMoodCard date={formatLocalDate()} entries={data.planner.moodEntries} onSave={saveMoodEntry} onDelete={deleteMoodEntry} />

      {writingEnabled ? <><section className="continue-card">
        <div className="continue-visual"><Quote size={30} /><span>那些以为早已忘记的，<br />会在笔尖重新发亮。</span></div>
        <div className="continue-content">
          <p className="eyebrow">继续书写</p>
          <h2>{activeWork?.title ?? '新的作品'}</h2>
          <p>{activeWork?.description}</p>
          <div className="progress-row"><div className="progress-track"><span style={{ width: `${progress}%` }} /></div><span>{totalWords.toLocaleString()} 字 · {progress}%</span></div>
          <div className="card-actions">
            <button className="primary-button" onClick={() => latestChapter && selectChapter(latestChapter.id)}><BookOpenText size={16} />继续写作<ArrowRight size={15} /></button>
            <button className="ghost-button" onClick={createWork}><Plus size={16} />新建作品</button>
          </div>
        </div>
      </section>

      <section className={`morning-question-card ${dailyQuestion?.tone === 'sharp' ? 'sharp' : ''}`}>
        <header><div className="morning-question-title"><p className="eyebrow">朝问 <span>每日一页</span></p><h2>留一个问题，与今天同行</h2></div><div className="morning-question-meta">{dailyQuestion?.topic && <span>{dailyQuestion.topic}</span>}<time>{questionDate.slice(5).replace('-', ' / ')} · 08:00</time></div></header>
        {dailyQuestion ? <div className="morning-question-content"><article className="morning-question-copy"><h3>{dailyQuestion.question}</h3><p>{dailyQuestion.background}</p><div className="morning-question-follow-up"><span>再往深处</span><blockquote>{dailyQuestion.followUp}</blockquote></div></article><div className="morning-question-actions"><button className="primary-button" onClick={() => startDailyQuestionDiary(dailyQuestion)}><PenLine size={15} />写下想法</button><button className="ghost-button" onClick={() => void talkAboutQuestion()}><MessageCircle size={15} />和伙伴谈谈</button></div></div>
          : <div className="morning-question-pending"><p>{questionBusy ? '正在为今天留下一个值得慢慢想的问题…' : isBeijingMorningReady() ? questionError || '今天的问题暂时没有抵达。' : '清晨八点，新的问题会来到这里。'}</p>{questionError && <button className="ghost-button" onClick={() => setRetry((value) => value + 1)}><RefreshCw size={14} />再试一次</button>}</div>}
      </section>
      </> : <section className="empty-state"><BookOpenText size={38} /><h2>写作模块已停用</h2><p>已有作品仍安全保留，可在设置中随时重新启用。</p><button className="primary-button" onClick={() => navigate('settings')}>前往设置</button></section>}
    </main>
  )
}
