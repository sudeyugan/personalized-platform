import { ArrowRight, BookOpenText, CalendarDays, Feather, MapPin, Plus, Quote, UsersRound } from 'lucide-react'
import { useLibraryStore } from '../../state/useLibraryStore'
import { useLiveDate } from './homeDate'

export function HomeView() {
  const { data, navigate, selectChapter, createWork } = useLibraryStore()
  const activeWork = data.works.find((work) => work.id === data.session.activeWorkId) ?? data.works[0]
  const recentChapters = Object.values(data.chapters).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 3)
  const totalWords = Object.values(data.chapters).reduce((sum, chapter) => sum + chapter.wordCount, 0)
  const progress = activeWork ? Math.min(100, Math.round((totalWords / activeWork.targetWords) * 100)) : 0
  const writingEnabled = data.settings.modules.find((module) => module.id === 'writing')?.enabled ?? true
  const today = useLiveDate()

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

      {writingEnabled ? <><section className="continue-card">
        <div className="continue-visual"><Quote size={30} /><span>那些以为早已忘记的，<br />会在笔尖重新发亮。</span></div>
        <div className="continue-content">
          <p className="eyebrow">继续书写</p>
          <h2>{activeWork?.title ?? '新的作品'}</h2>
          <p>{activeWork?.description}</p>
          <div className="progress-row"><div className="progress-track"><span style={{ width: `${progress}%` }} /></div><span>{totalWords.toLocaleString()} 字 · {progress}%</span></div>
          <div className="card-actions">
            <button className="primary-button" onClick={() => recentChapters[0] && selectChapter(recentChapters[0].id)}><BookOpenText size={16} />继续写作<ArrowRight size={15} /></button>
            <button className="ghost-button" onClick={createWork}><Plus size={16} />新建作品</button>
          </div>
        </div>
      </section>

      <div className="section-heading"><div><p className="eyebrow">最近落笔</p><h2>你的篇章</h2></div><button onClick={() => navigate('writing')}>查看全部 <ArrowRight size={15} /></button></div>
      <section className="recent-grid">
        {recentChapters.map((chapter, index) => (
          <button className="recent-card" key={chapter.id} onClick={() => selectChapter(chapter.id)}>
            <span className={`chapter-index tint-${index + 1}`}>{String(index + 1).padStart(2, '0')}</span>
            <div><h3>{chapter.title}</h3><p>{chapter.plainText.slice(0, 54) || '这一页还很安静，等待你的第一句话。'}</p></div>
            <footer><span>{chapter.wordCount} 字</span><span>{new Date(chapter.updatedAt).toLocaleDateString('zh-CN')}</span></footer>
          </button>
        ))}
      </section>

      <section className="glance-row">
        <button onClick={() => navigate('people')}><UsersRound /><span><strong>{data.people.length}</strong> 个人物</span></button>
        <button onClick={() => navigate('places')}><MapPin /><span><strong>{data.places.length}</strong> 个地点</span></button>
        <button onClick={() => navigate('timeline')}><CalendarDays /><span><strong>{data.events.length}</strong> 段往事</span></button>
      </section>
      </> : <section className="empty-state"><BookOpenText size={38} /><h2>写作模块已停用</h2><p>已有作品仍安全保留，可在设置中随时重新启用。</p><button className="primary-button" onClick={() => navigate('settings')}>前往设置</button></section>}
    </main>
  )
}
