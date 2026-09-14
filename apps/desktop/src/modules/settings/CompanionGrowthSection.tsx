import { Check, Download, History, ImagePlus, RotateCcw, Sparkles, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { createAiProvider, type ImpressionCandidate } from '../../infrastructure/aiProvider'
import { useLibraryStore } from '../../state/useLibraryStore'
import { AssetImage } from '../assets/AssetImage'
import { CompanionCharacterPackageSection } from './CompanionCharacterPackageSection'

async function candidateFile(candidate: ImpressionCandidate) {
  const image = new Image(); image.src = candidate.previewUrl; await image.decode()
  const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight
  canvas.getContext('2d')!.drawImage(image, 0, 0)
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('候选图转换失败')), 'image/png'))
  return new File([blob], '伙伴立绘.png', { type: 'image/png' })
}

export function CompanionGrowthSection() {
  const { data, importAsset, recordAiGeneration, setCompanionAppearance, setCompanionDesktop, addCompanionMemory, updateCompanionMemory, deleteCompanionMemory, setCompanionGrowthEnabled, setCompanionPersonality, rollbackCompanionGrowth, resetCompanionPersonality } = useLibraryStore()
  const companion = data.companion
  const portrait = data.assets.find((asset) => asset.id === companion.appearance.portraitAssetId && !asset.deletedAt)
  const [memoryDraft, setMemoryDraft] = useState('')
  const [prompt, setPrompt] = useState('温暖、克制的东方编辑插画角色立绘，透明感背景，不出现文字。')
  const [candidates, setCandidates] = useState<ImpressionCandidate[]>([])
  const [status, setStatus] = useState('候选确认前不会进入正式素材库。')

  const generate = async () => {
    try { setCandidates(await createAiProvider(data.settings.ai).generate({ chapterId: 'companion', sourceRevision: 0, sourcePreview: '', prompt, stylePreset: data.settings.ai.stylePreset })); setStatus('草稿已生成；请选择一张确认。') }
    catch (error) { setStatus(error instanceof Error ? error.message : '生成失败') }
  }
  const confirm = async (candidate: ImpressionCandidate) => {
    try { const asset = await importAsset(await candidateFile(candidate)); setCompanionAppearance({ portraitAssetId: asset.id }); recordAiGeneration({ id: `generation-${crypto.randomUUID()}`, kind: 'companion_portrait', providerId: data.settings.ai.providerId, sourceId: 'companion', sourceRevision: 0, stylePreset: data.settings.ai.stylePreset, status: 'confirmed', resultAssetIds: [asset.id], createdAt: new Date().toISOString() }); setCandidates([]); setStatus('已确认并作为正式伙伴素材。') }
    catch (error) { setStatus(error instanceof Error ? error.message : '导入失败') }
  }
  const exportMemories = () => { const blob = new Blob([JSON.stringify(companion.memories, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = '一隅-伙伴记忆.json'; link.click(); URL.revokeObjectURL(url) }

  return <section className="settings-section companion-growth-section">
    <div className="settings-title"><Sparkles /><div><h2>伙伴形象与成长</h2><p>桌面形态、长期记忆和性格变化都可以关闭、查看或撤销。</p></div></div>
    <div className="settings-subsection"><div className="settings-subsection-heading"><strong>形象组合与桌面显示</strong><small>桌面窗口只接收外观和动作快照，不读取资料库</small></div>
      <label className="setting-row"><div><strong>发型</strong><span>侧栏与桌面窗口保持一致</span></div><select value={companion.appearance.hair} onChange={(event) => setCompanionAppearance({ hair: event.target.value as typeof companion.appearance.hair })}><option value="ink">墨色自然</option><option value="short">轻盈短发</option><option value="long">柔和长发</option></select></label>
      <label className="setting-row"><div><strong>服装</strong><span>使用独立图层组合，不改变权限</span></div><select value={companion.appearance.outfit} onChange={(event) => setCompanionAppearance({ outfit: event.target.value as typeof companion.appearance.outfit })}><option value="linen">亚麻暖白</option><option value="sage">鼠尾草绿</option><option value="night">深夜蓝</option></select></label>
      <div className="setting-row"><div><strong>桌面伙伴</strong><span>透明置顶窗口，可拖动和单独隐藏</span></div><button aria-pressed={companion.desktop.visible} className={companion.desktop.visible ? 'switch on' : 'switch'} onClick={() => setCompanionDesktop(!companion.desktop.visible)}><i /></button></div>
      <CompanionCharacterPackageSection />
      <div className="portrait-workflow">{portrait && <div className="portrait-current"><AssetImage asset={portrait} /><span><Check size={13} />正式形象</span></div>}<textarea aria-label="伙伴形象提示词" rows={2} value={prompt} onChange={(event) => setPrompt(event.target.value)} /><button className="ghost-button" onClick={() => void generate()}><ImagePlus size={14} />生成形象草稿</button><small>{status}</small>{candidates.length > 0 && <div className="portrait-candidates">{candidates.map((candidate) => <button key={candidate.id} onClick={() => void confirm(candidate)}><img src={candidate.previewUrl} alt="伙伴形象候选" /><span>确认采用</span></button>)}</div>}</div>
    </div>
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
