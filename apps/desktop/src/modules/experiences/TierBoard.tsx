import { useState } from 'react'
import { tierIds, type ExperienceData, type ExperienceEntry, type ExperienceTier } from '../../domain/experiences'
import type { Asset } from '../../domain/models'
import { ExperienceArtwork } from './ExperienceArtwork'

interface Props {
  entries: ExperienceEntry[]
  assets: Asset[]
  labels: ExperienceData['tierLabels']
  rank: (id: string, tier: ExperienceTier | undefined, beforeId?: string) => void
  rename: (tier: ExperienceTier, name: string) => void
  onOpen: (id: string) => void
}
export function TierBoard({ entries, assets, labels, rank, rename, onOpen }: Props) {
  const [dragging, setDragging] = useState<string>()
  const [over, setOver] = useState<string>()
  const [editing, setEditing] = useState(false)
  const buckets = [...tierIds, undefined]
  return <section className="experience-tier-board" aria-label="从夯到拉个人排行">
    <div className="tier-board-toolbar"><p>拖进档位，靠前的更喜欢。也可以用卡片下方的按钮调整。</p><button type="button" className="ghost-button" onClick={() => setEditing(!editing)}>{editing ? '完成命名' : '改档位名称'}</button></div>
    {buckets.map(tier => {
      const key = tier ?? 'unranked'
      const members = entries.filter(entry => entry.tier === tier).sort((a, b) => a.order - b.order)
      return <div key={key} className={'tier-board-row tier-' + key + (over === key ? ' is-drop-target' : '')} onDragOver={event => { if (dragging) { event.preventDefault(); setOver(key) } }} onDrop={event => {
        event.preventDefault(); if (dragging) rank(dragging, tier); setDragging(undefined); setOver(undefined)
      }}><div className="tier-board-label">{editing && tier ? <input key={labels[tier]} defaultValue={labels[tier]} aria-label={'档位名称' + labels[tier]} maxLength={12} onBlur={event => rename(tier, event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) event.currentTarget.blur() }} /> : <strong>{tier ? labels[tier] : '未排行'}</strong>}</div>
        <div className="tier-board-cards">{members.map((entry, index) => <article className={'tier-mini-card' + (dragging === entry.id ? ' is-dragging' : '')} key={entry.id} draggable
          onDragStart={event => { setDragging(entry.id); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', entry.id) }}
          onDragEnd={() => { setDragging(undefined); setOver(undefined) }}
          onDragOver={event => { if (dragging && dragging !== entry.id) event.preventDefault() }}
          onDrop={event => { if (dragging && dragging !== entry.id) { event.preventDefault(); event.stopPropagation(); rank(dragging, tier, entry.id); setDragging(undefined); setOver(undefined) } }}>
          <button type="button" className="tier-mini-open" onClick={() => onOpen(entry.id)} aria-label={'查看' + entry.title}><ExperienceArtwork entry={entry} asset={assets.find(asset => asset.id === entry.coverAssetId)} /><span>{entry.title}</span></button>
          <div className="tier-mini-actions"><button type="button" aria-label={'前移' + entry.title} disabled={index === 0} onClick={() => rank(entry.id, tier, members[index - 1]?.id)}>←</button>
            <select aria-label={'调整' + entry.title + '档位'} value={tier ?? ''} onChange={event => rank(entry.id, event.target.value ? event.target.value as ExperienceTier : undefined)}><option value="">未排行</option>{tierIds.map(id => <option value={id} key={id}>{labels[id]}</option>)}</select>
            <button type="button" aria-label={'后移' + entry.title} disabled={index === members.length - 1} onClick={() => rank(entry.id, tier, members[index + 2]?.id)}>→</button></div>
        </article>)}{!members.length && <span className="tier-empty">留给属于这一档的回忆</span>}</div>
      </div>
    })}
  </section>
}
