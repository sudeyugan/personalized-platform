import { ArrowUpRight } from 'lucide-react'
import { IDEA_LIMITS } from '../../domain/ideas/types'
import { InkGesture } from './InkText'

export function IdeaFirstPage({ seed, setSeed, start, busy }: { seed: string; setSeed(value: string): void; start(): void; busy: boolean }) {
  return <section className="idea-first-page" aria-label="起笔">
    <div className="idea-opening-inscription" aria-hidden="true"><span>一念起</span><i />万象生</div>
    <span className="idea-eyebrow">起笔 / 不必先想完整</span>
    <h2>此刻，有什么<br /><em>还没想清楚？</em></h2>
    <InkGesture />
    <p className="idea-opening-prose">一句直觉，一个困惑，或几句散落的话。<br />先留白，再一起找到下一笔。</p>
    <form onSubmit={event => { event.preventDefault(); start() }}>
      <label htmlFor="idea-seed" className="idea-field-label">写下最初的念头</label>
      <textarea id="idea-seed" value={seed} onChange={event => setSeed(event.target.value)} maxLength={IDEA_LIMITS.input} placeholder="比如：我总觉得每天都很忙，却没有做成真正重要的事……" rows={3} />
      <div className="idea-input-foot"><small>{seed.length ? `${seed.length} / ${IDEA_LIMITS.input}` : '暂时说不清，也没有关系'}</small><button type="submit" className="idea-primary" disabled={!seed.trim() || busy}>从这一念开始 <ArrowUpRight size={16} /></button></div>
    </form>
    <div className="idea-possibilities"><span>解一个困惑</span><span>推敲一种判断</span><span>酝酿一个创意</span></div>
    <div className="idea-opening-foot"><span className="idea-margin-seal">未定</span><span>容许未完成，才有新的可能。</span></div>
  </section>
}
