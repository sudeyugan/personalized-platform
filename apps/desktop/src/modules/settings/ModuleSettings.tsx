import { BookMarked, Heart, Music2, Puzzle, Sparkles } from 'lucide-react'
import type { ReactNode } from 'react'
import type { LibraryData } from '../../domain/models'
import { navigationItems } from '../../app/moduleManifest'
import { useLibraryStore } from '../../state/useLibraryStore'
import { CoverSourceSettings } from '../experiences/CoverSourceSettings'

const modules = [
  { id: 'writing', label: '写作', description: '作品、资料与时间线', icon: <span>文</span> },
  { id: 'answerBook', label: '答案之书', description: '偶然的一句话，陪你想一想', icon: <BookMarked /> },
  { id: 'fortune', label: '一隅签', description: '今日、恋爱、前程，每类每日一签', icon: <Sparkles /> },
  { id: 'experiences', label: '经历册', description: '作品、足迹与从夯到拉的个人排行', icon: <BookMarked /> },
  { id: 'truth', label: '真心话', description: '150 张问句卡，不记录回答', icon: <Heart /> },
  { id: 'music', label: '旧本地播放器', description: '保留原曲库，入口在数据管理', icon: <Music2 /> },
  { id: 'companion', label: 'AI 伙伴', description: '对话、桌面角色与受控任务', icon: <Sparkles /> },
] satisfies { id: LibraryData['settings']['modules'][number]['id']; label: string; description: string; icon: ReactNode }[]

export function ModuleSettings() {
  const { data, toggleModule, moveNavigation } = useLibraryStore()
  const visibleNavigation = data.settings.navigationOrder.filter(view => {
    const item = navigationItems.find(item => item.id === view)
    return item && !item.secondary
  })
  const moveVisible = (view: typeof visibleNavigation[number], direction: -1 | 1) => {
    const neighbor = visibleNavigation[visibleNavigation.indexOf(view) + direction]
    if (!neighbor) return
    const distance = Math.abs(data.settings.navigationOrder.indexOf(neighbor) - data.settings.navigationOrder.indexOf(view))
    for (let step = 0; step < distance; step++) moveNavigation(view, direction)
  }
  return <>
    <section className="settings-section"><div className="settings-title"><Puzzle /><div><h2>只留下你需要的功能</h2><p>关闭只隐藏入口，不删除内容，也不停止已允许的播放。</p></div></div>
      <div className="settings-module-grid">{modules.map(item => {
        const enabled = data.settings.modules.find(value => value.id === item.id)?.enabled ?? true
        return <div className="settings-module-card" key={item.id}><i>{item.icon}</i><div><strong>{item.label}</strong><small>{item.description}</small></div><button aria-label={'启用' + item.label} aria-pressed={enabled} className={enabled ? 'switch on' : 'switch'} onClick={() => toggleModule(item.id)}><i /></button></div>
      })}</div>
    </section>
    <section className="settings-section"><div className="settings-title"><BookMarked /><div><h2>经历册</h2><p>可选封面来源与密钥；不配置也能记录作品和足迹。</p></div></div><CoverSourceSettings /></section>
    <section className="settings-section"><div className="settings-title"><Puzzle /><div><h2>导航顺序</h2><p>让常用的空间排在前面，所有内容保持不变。</p></div></div>
      <div className="navigation-order">{visibleNavigation.map((view, index) => <div key={view}><span>{navigationItems.find(item => item.id === view)?.label ?? view}</span><span><button aria-label={'上移' + view} disabled={index === 0} onClick={() => moveVisible(view, -1)}>↑</button><button aria-label={'下移' + view} disabled={index === visibleNavigation.length - 1} onClick={() => moveVisible(view, 1)}>↓</button></span></div>)}</div>
    </section>
  </>
}
