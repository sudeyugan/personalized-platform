import { Download, History, RotateCcw, Sparkles, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useLibraryStore } from '../../state/useLibraryStore'

export function CompanionGrowthSection() {
  const { data, addCompanionMemory, updateCompanionMemory, deleteCompanionMemory, setCompanionGrowthEnabled, setCompanionPersonality, rollbackCompanionGrowth, resetCompanionPersonality } = useLibraryStore()
  const companion = data.companion
  const [memoryDraft, setMemoryDraft] = useState('')
  const exportMemories = () => { const blob = new Blob([JSON.stringify(companion.memories, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = '一隅-伙伴记忆.json'; link.click(); URL.revokeObjectURL(url) }

  return <section className="settings-section companion-growth-section">
    <div className="settings-title"><Sparkles /><div><h2>记忆与性格</h2><p>记忆由你决定，变化可以查看或撤销。</p></div></div>
    <div className="settings-subsection"><div className="settings-subsection-heading"><strong>可治理记忆</strong><small>只有启用的记忆才会注入对话；删除立即生效</small></div>
      <div className="memory-compose"><input aria-label="新增伙伴记忆" value={memoryDraft} onChange={(event) => setMemoryDraft(event.target.value)} placeholder="例如：我更喜欢安静的提醒" /><button className="ghost-button" onClick={() => { if (addCompanionMemory(memoryDraft, 'manual', '用户手动添加')) setMemoryDraft('') }}>添加</button><button className="ghost-button" disabled={!companion.memories.length} onClick={exportMemories}><Download size={13} />导出</button></div>
      <div className="memory-list">{companion.memories.map((memory) => <div key={memory.id}><input aria-label={`记忆内容 ${memory.sourceLabel}`} value={memory.content} onChange={(event) => updateCompanionMemory(memory.id, { content: event.target.value })} /><small>{memory.sourceLabel} · {new Date(memory.createdAt).toLocaleDateString()} · 置信度 {memory.confidence}%</small><button aria-label="切换记忆授权" aria-pressed={memory.authorized} className={memory.authorized ? 'switch on' : 'switch'} onClick={() => updateCompanionMemory(memory.id, { authorized: !memory.authorized })}><i /></button><button aria-label="删除伙伴记忆" onClick={() => deleteCompanionMemory(memory.id)}><Trash2 size={14} /></button></div>)}{!companion.memories.length && <p>还没有长期记忆。对话不会自动成为记忆。</p>}</div>
    </div>
    <div className="settings-subsection"><div className="settings-subsection-heading"><strong>性格权重与变化日志</strong><small>自然成长默认关闭，开启后仅根据明确互动轻微变化</small></div>
      <div className="setting-row"><div><strong>允许自然成长</strong><span>不会扩大资料或音乐权限</span></div><button aria-pressed={companion.growth.enabled} className={companion.growth.enabled ? 'switch on' : 'switch'} onClick={() => setCompanionGrowthEnabled(!companion.growth.enabled)}><i /></button></div>
      <div className="personality-grid">{([['warmth', '温暖'], ['curiosity', '好奇'], ['initiative', '主动']] as const).map(([key, label]) => <label key={key}><span>{label}<b>{companion.personality[key]}</b></span><input type="range" min="0" max="100" value={companion.personality[key]} onChange={(event) => setCompanionPersonality({ [key]: Number(event.target.value) }, `手动调整${label}`)} /></label>)}</div>
      <div className="growth-actions"><button className="ghost-button" onClick={resetCompanionPersonality}><RotateCcw size={13} />重置性格</button></div>
      <details className="growth-log"><summary><History size={13} />变化日志（{companion.growth.logs.length}）</summary>{companion.growth.logs.slice().reverse().map((log) => <div key={log.id}><span><strong>{log.reason}</strong><small>{new Date(log.createdAt).toLocaleString()}</small></span><button onClick={() => rollbackCompanionGrowth(log.id)}>回退到此前</button></div>)}</details>
    </div>
  </section>
}
