import { useState } from 'react'
import type { ExperienceEntry } from '../../domain/experiences'
import { readExperienceRecovery, removeExperienceRecovery, setExperienceRecovery, type RecoverableExperienceDraft } from './experienceDraftRecovery'

export function ExperienceRecoveryShelf({ scope, entries, open }: { scope: string; entries: ExperienceEntry[]; open: (key: string, place: boolean) => void }) {
  const [snapshot, setSnapshot] = useState(() => { try { return { drafts: readExperienceRecovery(scope).drafts, error: '' } } catch { return { drafts: [] as RecoverableExperienceDraft[], error: '本机草稿无法读取。可明确关闭恢复并清除草稿，正式卡片不受影响。' } } })
  const { drafts, error } = snapshot
  const visible = drafts.filter(item => item.key === 'new-work' || item.key === 'new-place' || entries.some(entry => entry.id === item.key && !entry.deletedAt))
  if (!visible.length && !error) return null
  return <details className="experience-draft-controls"><summary>本机待恢复文字草稿 · {visible.length}</summary>
    {visible.map(item => <div key={item.key}><span>{item.draft.title || '未命名经历'}</span>
      <button className="ghost-button" type="button" onClick={() => open(item.key, item.draft.category === 'place')}>查看并恢复</button>
      <button className="ghost-button" type="button" onClick={() => { try { removeExperienceRecovery(scope, item.key); setSnapshot({ drafts: readExperienceRecovery(scope).drafts, error: '' }) } catch { setSnapshot(previous => ({ ...previous, error: '草稿清除失败，请稍后重试。' })) } }}>丢弃草稿</button>
    </div>)}{error && <><p role="alert">{error}</p><button type="button" className="ghost-button" onClick={() => { try { setExperienceRecovery(scope, false); setSnapshot({ drafts: [], error: '' }) } catch { setSnapshot(previous => ({ ...previous, error: '清除失败，请检查本机存储。' })) } }}>关闭恢复并清除本机草稿</button></>}
  </details>
}
