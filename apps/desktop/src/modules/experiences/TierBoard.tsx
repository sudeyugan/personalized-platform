import { useState } from 'react'
import { tierIds, type ExperienceData, type ExperienceEntry, type ExperienceTier } from '../../domain/experiences'
import type { Asset } from '../../domain/models'
import { ExperienceArtwork } from './ExperienceArtwork'
import { useTierDrag } from './useTierDrag'

interface Props {
  entries: ExperienceEntry[]
  assets: Asset[]
  labels: ExperienceData['tierLabels']
  rank: (id: string, tier: ExperienceTier | undefined, beforeId?: string) => void
  rename: (tier: ExperienceTier, name: string) => void
  onOpen: (id: string) => void
}
export function TierBoard({ entries, assets, labels, rank, rename, onOpen }: Props) {
  const interaction = useTierDrag(rank)
  const { drag } = interaction
  const draggedEntry = entries.find(entry => entry.id === drag?.id)
  const [editing, setEditing] = useState(false)
  const buckets = [...tierIds, undefined]
  return <section ref={interaction.boardRef} className="experience-tier-board" aria-label="从夯到拉个人排行">
    <div className="tier-board-toolbar"><p>按住封面或名称拖动换档和排序，松开保存。</p><button type="button" className="ghost-button" onClick={() => setEditing(!editing)}>{editing ? '完成命名' : '改档位名称'}</button></div>
    {buckets.map(tier => {
      const key = tier ?? 'unranked'
      const members = entries.filter(entry => entry.tier === tier).sort((a, b) => a.order - b.order)
      return <div key={key} data-tier={key} className={'tier-board-row tier-' + key + (drag?.target?.key === key ? ' is-drop-target' : '')}><div className="tier-board-label">{editing && tier ? <input key={labels[tier]} defaultValue={labels[tier]} aria-label={'档位名称' + labels[tier]} maxLength={12} onBlur={event => rename(tier, event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) event.currentTarget.blur() }} /> : <strong>{tier ? labels[tier] : '未排行'}</strong>}</div>
        <div className={'tier-board-cards' + (drag?.target?.key === key && !drag.target.beforeId ? ' is-append-target' : '')}>{members.map(entry => <article data-tier-entry={entry.id} className={'tier-mini-card' + (drag?.id === entry.id ? ' is-dragging' : '') + (drag?.target?.beforeId === entry.id ? ' is-insert-target' : '')} key={entry.id}>
          <button type="button" className="tier-mini-open" onClick={event => interaction.open(event, entry.id, onOpen)} onPointerDown={event => interaction.start(event, entry.id)} onPointerMove={interaction.move} onPointerUp={interaction.end} onPointerCancel={interaction.cancel} onLostPointerCapture={interaction.cancel} onDragStart={event => event.preventDefault()} aria-label={'查看' + entry.title}><ExperienceArtwork entry={entry} asset={assets.find(asset => asset.id === entry.coverAssetId)} /><span>{entry.title}</span></button>
        </article>)}{!members.length && <span className="tier-empty">留给属于这一档的回忆</span>}</div>
      </div>
    })}
    {drag && draggedEntry && <div className="tier-drag-preview" aria-hidden="true" style={{ width: drag.width, transform: `translate3d(${drag.x - drag.offsetX}px, ${drag.y - drag.offsetY}px, 0)` }}><div className="tier-drag-preview-cover" style={{ transformOrigin: `${drag.offsetX}px ${drag.offsetY}px` }}><ExperienceArtwork entry={draggedEntry} asset={assets.find(asset => asset.id === draggedEntry.coverAssetId)} /><span>{draggedEntry.title}</span></div></div>}
  </section>
}
