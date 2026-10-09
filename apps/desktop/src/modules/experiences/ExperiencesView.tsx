import { BookHeart, LayoutGrid, ListOrdered, MapPin, Plus, Search } from 'lucide-react'
import { useState } from 'react'
import { categoryLabels, emptyExperiences, experienceGroup, type ExperienceCategory } from '../../domain/experiences'
import { useLibraryStore } from '../../state/useLibraryStore'
import { ExperienceCard } from './ExperienceCard'
import { ExperienceEditor } from './ExperienceEditor'
import { TierBoard } from './TierBoard'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import './experiences.css'
import './experienceEditor.css'

export function ExperiencesView() {
  const { data, rankExperience, setExperienceTierLabel, permanentlyDeleteExperience, restoreExperience } = useLibraryStore()
  const experiences = data.experiences ?? emptyExperiences()
  const [group, setGroup] = useState<'works' | 'places'>('works')
  const [view, setView] = useState<'cards' | 'tiers'>('cards')
  const [category, setCategory] = useState<ExperienceCategory | ''>('')
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<{ id?: string }>()
  const [trashOpen, setTrashOpen] = useState(false)
  const [deleting, setDeleting] = useState<string>()
  const needle = query.trim().toLocaleLowerCase()
  const entries = experiences.entries.filter(entry => !entry.deletedAt && experienceGroup(entry.category) === group && (!category || entry.category === category) && (!needle || [entry.title, entry.creator, entry.note, entry.dateText].some(text => text.toLocaleLowerCase().includes(needle))))
  const deleted = experiences.entries.filter(entry => entry.deletedAt && experienceGroup(entry.category) === group)
  const selected = experiences.entries.find(entry => entry.id === editing?.id)
  const pending = experiences.entries.find(entry => entry.id === deleting)
  const open = (id: string) => setEditing({ id })
  const closeEditor = () => setEditing(undefined)
  const visible = entries
  if (editing) return <main className="experiences-view scroll-view">
    <ExperienceEditor key={editing.id ?? 'new'} entry={selected} place={group === 'places'} labels={experiences.tierLabels} onClose={closeEditor} />
  </main>
  return <main className="experiences-view scroll-view">
    <header className="page-header experiences-header"><div><p className="eyebrow">私 人 经 历 册</p><h1>看过的世界，走过的路。</h1><p>不必事事记得清楚，留下名字和自己的感受就好。</p></div>
      <button type="button" className="primary-button" disabled={Boolean(editing)} onClick={() => { setEditing({}); setTrashOpen(false) }}><Plus size={16} />{group === 'places' ? '留下一处足迹' : '收进一部作品'}</button></header>
    <div className="experience-controls">
      <div className="experience-tabs" aria-label="经历类别"><button type="button" disabled={Boolean(editing)} aria-pressed={group === 'works'} onClick={() => { setGroup('works'); setCategory(''); setTrashOpen(false) }}><BookHeart size={15} />作品</button><button type="button" disabled={Boolean(editing)} aria-pressed={group === 'places'} onClick={() => { setGroup('places'); setCategory(''); setTrashOpen(false) }}><MapPin size={15} />足迹</button></div>
      <div className="experience-tabs" aria-label="经历呈现"><button type="button" aria-pressed={view === 'cards'} onClick={() => setView('cards')}><LayoutGrid size={15} />封面墙</button><button type="button" aria-pressed={view === 'tiers'} onClick={() => setView('tiers')}><ListOrdered size={15} />从夯到拉</button></div>
      <div className="experience-filter">
        {group === 'works' && <select aria-label="筛选作品类别" value={category} onChange={event => setCategory(event.target.value as ExperienceCategory | '')}><option value="">所有作品</option>{Object.entries(categoryLabels).filter(([id]) => id !== 'place').map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select>}
        <label><Search size={14} /><input aria-label="搜索经历" placeholder="在自己的记录里找…" value={query} onChange={event => setQuery(event.target.value)} /></label></div>
    </div>
    {view === 'cards' ? <section className="experience-card-grid">{visible.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(entry => <ExperienceCard entry={entry} asset={data.assets.find(asset => asset.id === entry.coverAssetId)} labels={experiences.tierLabels} onOpen={() => open(entry.id)} key={entry.id} />)}</section>
      : <TierBoard entries={visible} assets={data.assets} labels={experiences.tierLabels} rank={rankExperience} rename={setExperienceTierLabel} onOpen={open} />}
    {visible.length === 0 && <section className="experience-empty"><div aria-hidden="true"><span>✦</span><i>隅</i></div><h2>{query || category ? '这一页，还没有找到匹配的回忆' : group === 'places' ? '从一个你去过的地方开始' : '从一部你记得的作品开始'}</h2><p>只写名称也可以。感想、时间、封面和排行，都不必一次补齐。</p></section>}
    <footer className="experience-page-footer"><span>{visible.length} {group === 'places' ? '处足迹' : '部作品'} · 只属于你的感受</span><button type="button" disabled={Boolean(editing)} className="ghost-button" onClick={() => setTrashOpen(!trashOpen)}>收纳袋{deleted.length ? ' · ' + deleted.length : ''}</button></footer>
    {trashOpen && <section className="experience-trash"><h2>已删除 / 暂时收起的经历</h2>{deleted.length ? deleted.map(entry => <div key={entry.id}><span>{entry.title}</span><div><button type="button" onClick={() => restoreExperience(entry.id)}>放回经历册</button><button type="button" className="danger-button" aria-label={'永久删除' + entry.title} onClick={() => setDeleting(entry.id)}>永久删除</button></div></div>) : <p>收纳袋是空的。移入收纳袋的卡片仍可恢复。</p>}</section>}
    {pending?.deletedAt && <ConfirmDialog title="永久删除这张经历卡片？" subject={pending.title} description="这张卡片的名称、感想、时间和排行记录将从资料库移除，无法从收纳袋恢复。素材库图片和既有备份不会一起删除。" confirmLabel="永久删除" permanent onCancel={() => setDeleting(undefined)} onConfirm={() => { permanentlyDeleteExperience(pending.id); setDeleting(undefined) }} />}
  </main>
}
