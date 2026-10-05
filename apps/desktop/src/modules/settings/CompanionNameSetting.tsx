import { useEffect, useState } from 'react'
import { normalizeCompanionName, supportsNameWake } from '../../domain/companionIdentity'

export function CompanionNameSetting({ name, onChange }: { name: string; onChange: (name: string) => void }) {
  const [draft, setDraft] = useState(name)
  useEffect(() => setDraft(name), [name])
  const commit = () => {
    const next = normalizeCompanionName(draft)
    setDraft(next)
    if (next !== name) onChange(next)
  }
  return <label className="setting-row"><div><strong>伙伴名字</strong><span>{supportsNameWake(draft.trim()) ? '称呼、AI 自我介绍和唤醒名同步；失焦或回车保存' : '最多 20 字；本地唤醒需 2～6 个汉字，否则关闭唤醒'}</span></div>
    <input aria-label="伙伴名字" value={draft} maxLength={20} onChange={(event) => setDraft(event.target.value)} onBlur={commit} onKeyDown={(event) => {
      if (event.nativeEvent.isComposing) return
      if (event.key === 'Enter') { event.preventDefault(); commit() }
      if (event.key === 'Escape') { event.preventDefault(); setDraft(name) }
    }} />
  </label>
}
