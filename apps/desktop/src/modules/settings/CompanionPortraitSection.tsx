import { listen } from '@tauri-apps/api/event'
import { Check, Film, ImagePlus, LoaderCircle, Plus, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { CompanionVideoState } from '../../domain/models'
import { useLibraryStore } from '../../state/useLibraryStore'
import { AssetImage } from '../assets/AssetImage'

const interactionStates: { id: CompanionVideoState; label: string; hint: string }[] = [
  { id: 'idle', label: '基础待机', hint: '必需 · 平时循环播放' },
  { id: 'listening', label: '正在倾听', hint: '可选 · 录音或输入时' },
  { id: 'thinking', label: '正在思考', hint: '可选 · 模型或 Tool 工作时' },
  { id: 'speaking', label: '正在回应', hint: '可选 · 回复或 TTS 播放时' },
]
const expressionStates: { id: CompanionVideoState; label: string; hint: string }[] = [
  { id: 'happy', label: '轻松积极', hint: '可选 · 一次性反应，可在待机中穿插' },
  { id: 'concerned', label: '认真关切', hint: '可选 · 一次性反应，可在待机中穿插' },
  { id: 'surprised', label: '稍感意外', hint: '可选 · 一次性反应，可在待机中穿插' },
  { id: 'shy', label: '害羞', hint: '可选 · 克制的害羞反应' },
  { id: 'sad', label: '难过', hint: '可选 · 低落或安慰场景' },
  { id: 'annoyed', label: '不满', hint: '可选 · 轻微不悦反应' },
]
const poseStates: { id: CompanionVideoState; label: string; hint: string }[] = [
  { id: 'greeting', label: '招手问候', hint: '可选 · 开始交谈时' },
  { id: 'agreeing', label: '点头同意', hint: '可选 · 表示理解或认可' },
  { id: 'celebrating', label: '庆祝', hint: '可选 · 达成目标时' },
  { id: 'stretching', label: '伸懒腰', hint: '可选 · 待机时偶尔穿插' },
  { id: 'sleepy', label: '困倦', hint: '可选 · 深夜或休息场景，不参与随机穿插' },
]
const videoStates = [...interactionStates, ...expressionStates, ...poseStates]

type ImportStatus = { tone: 'neutral' | 'working' | 'success' | 'error'; message: string }

export function CompanionPortraitSection() {
  const { data, importAsset, importCompanionVideo, setCompanionPortrait, addCompanionVideo, removeCompanionVideo, cleanupUnusedCompanionAssets } = useLibraryStore()
  const visual = data.companion.desktop.visual
  const portraitId = data.companion.appearance.portraitAssetId
  const portrait = data.assets.find((asset) => asset.id === portraitId && !asset.deletedAt)
  const clips = data.companion.desktop.videoClips ?? Object.fromEntries(Object.entries(data.companion.desktop.videoAssets ?? (visual.type === 'video' ? visual.videos : {})).map(([state, id]) => [state, id ? [id] : []]))
  const [editorMode, setEditorMode] = useState<'portrait' | 'video'>(visual.type === 'video' ? 'video' : 'portrait')
  const [status, setStatus] = useState<ImportStatus>({ tone: 'neutral', message: '选择一种桌面形象方式进行设置。' })
  const [busy, setBusy] = useState('')
  useEffect(() => {
    if (!('__TAURI_INTERNALS__' in window)) return
    let stopReady: (() => void) | undefined
    let stopError: (() => void) | undefined
    void listen<{ assetId: string }>('companion:visual-ready', () => {
      setStatus({ tone: 'success', message: '桌面伙伴已载入并开始显示。' })
    }).then((stop) => { stopReady = stop })
    void listen<{ assetId: string }>('companion:visual-error', () => {
      setStatus({ tone: 'error', message: '素材已保存，但 WebView2 无法解码这一文件；请确认使用 VP9 WebM。' })
    }).then((stop) => { stopError = stop })
    return () => { stopReady?.(); stopError?.() }
  }, [])

  const importPortrait = async (file?: File) => {
    if (!file) return
    setBusy('portrait')
    setStatus({ tone: 'working', message: `正在导入：${file.name}` })
    try {
      const asset = await importAsset(file, { purpose: 'companion' })
      setCompanionPortrait(asset.id)
      setStatus({ tone: 'success', message: '已启用静态立绘：' + file.name })
    } catch (error) {
      setStatus({ tone: 'error', message: error instanceof Error ? error.message : '立绘导入失败' })
    } finally {
      setBusy('')
    }
  }

  const importVideo = async (state: CompanionVideoState, file?: File) => {
    if (!file) return
    setBusy(state)
    setStatus({ tone: 'working', message: `已选择 ${file.name}，正在开始导入…` })
    try {
      const asset = await importCompanionVideo(file, (message) => setStatus({ tone: 'working', message }))
      addCompanionVideo(state, asset.id)
      const ratio = asset.height ? asset.width / asset.height : 0
      const ratioHint = ratio && Math.abs(ratio - 9 / 16) > 0.025
        ? '；画布不是 9:16，将完整包含显示'
        : !ratio ? '；未能预读尺寸，请在桌面确认播放' : ''
      const label = videoStates.find((item) => item.id === state)?.label
      setStatus({ tone: 'success', message: `已绑定“${label}”：${file.name}${ratioHint}` })
    } catch (error) {
      setStatus({ tone: 'error', message: error instanceof Error ? error.message : 'WebM 导入失败' })
    } finally {
      setBusy('')
    }
  }

  const cleanupUnused = async () => {
    setBusy('cleanup')
    const removed = await cleanupUnusedCompanionAssets()
    setStatus({ tone: 'success', message: removed ? '已清理 ' + removed + ' 个未使用的伙伴文件。' : '没有可清理的伙伴文件。' })
    setBusy('')
  }

  const renderVideoSlot = (item: (typeof videoStates)[number], featured = false) => {
    const assets = (clips[item.id] ?? []).map((id) => data.assets.find((entry) => entry.id === id && !entry.deletedAt)).filter((asset): asset is NonNullable<typeof asset> => Boolean(asset))
    return <div className={`companion-video-slot ${featured ? 'featured' : ''} ${assets.length ? 'filled' : ''}`} key={item.id}>
      <span className="video-slot-icon">{busy === item.id ? <LoaderCircle className="spin" size={15} /> : assets.length ? <Check size={15} /> : <Film size={15} />}</span>
      <span><strong>{item.label}</strong><small>{assets.length ? `${assets.length} 段素材 · 播放时自动选择` : item.hint}</small></span>
      <label className={busy ? 'disabled' : ''}>{busy === item.id ? '导入中…' : <><Plus size={12} />{assets.length ? '继续添加' : featured ? '选择 WebM' : '添加'}</>}<input type="file" accept="video/webm,.webm" disabled={Boolean(busy)} onChange={(event) => { void importVideo(item.id, event.target.files?.[0]); event.target.value = '' }} /></label>
      {assets.length > 0 && <div className="video-slot-assets">{assets.map((asset) => <div key={asset.id}><span title={asset.fileName}>{asset.fileName}<small>{asset.width && asset.height ? `${asset.width}×${asset.height}` : 'WebM'}</small></span><button aria-label={`移除 ${asset.fileName}`} disabled={Boolean(busy)} onClick={() => removeCompanionVideo(item.id, asset.id)}><Trash2 size={12} /></button></div>)}</div>}
    </div>
  }

  return <div className="portrait-settings companion-visual-settings">
    <div className="visual-source-switch" aria-label="形象素材类型">
      <button aria-pressed={editorMode === 'portrait'} className={editorMode === 'portrait' ? 'active' : ''} onClick={() => setEditorMode('portrait')}><i className="visual-source-icon"><ImagePlus size={17} /></i><span className="visual-source-copy"><strong>静态立绘</strong><small>透明 PNG / WebP · 简单稳定</small></span><b className={visual.type === 'portrait' ? 'in-use' : ''}>{visual.type === 'portrait' ? '使用中' : '设置'}</b></button>
      <button aria-pressed={editorMode === 'video'} className={editorMode === 'video' ? 'active' : ''} onClick={() => setEditorMode('video')}><i className="visual-source-icon"><Film size={17} /></i><span className="visual-source-copy"><strong>动态 WebM</strong><small>循环待机 · 可扩展互动状态</small></span><b className={visual.type === 'video' ? 'in-use' : ''}>{visual.type === 'video' ? '使用中' : '设置'}</b></button>
    </div>

    <div className={`visual-import-status ${status.tone}`}>{status.tone === 'working' && <LoaderCircle className="spin" size={14} />}<span>{status.message}</span></div>

    {editorMode === 'portrait' ? <div className="visual-editor-panel">
      <div className="visual-editor-heading"><span><strong>静态立绘</strong><small>适合一张完整透明立绘，导入后立即启用。</small></span></div>
      <div className="portrait-settings-toolbar">
        <label className={busy ? 'ghost-button disabled' : 'ghost-button'}><ImagePlus size={14} />{busy === 'portrait' ? '正在导入…' : portrait ? '更换立绘' : '选择 PNG / WebP'}<input type="file" accept="image/png,image/webp" disabled={Boolean(busy)} onChange={(event) => { void importPortrait(event.target.files?.[0]); event.target.value = '' }} /></label>
        {portrait && visual.type !== 'portrait' && <button className="ghost-button" onClick={() => setCompanionPortrait(portrait.id)}>启用静态立绘</button>}
        {portrait && visual.type === 'portrait' && <button className="ghost-button quiet" onClick={() => setCompanionPortrait(undefined)}><Trash2 size={13} />移除</button>}
      </div>
      {portrait ? <div className="portrait-settings-preview"><AssetImage asset={portrait} thumbnail={false} alt={data.companion.name + '立绘'} /><span><strong>{portrait.fileName}</strong><small>{portrait.width} × {portrait.height}</small></span></div> : <div className="visual-empty-state"><ImagePlus size={20} /><span>尚未添加静态立绘</span></div>}
    </div> : <div className="visual-editor-panel video-editor-panel">
      <div className="visual-editor-heading"><span><strong>动态 WebM 动作库</strong><small>同一状态可以添加多段；基础待机会在每段结束后自然轮换。</small></span>{clips.idle?.length && visual.type !== 'video' && <button className="ghost-button" onClick={() => addCompanionVideo('idle', clips.idle![0])}>启用动态形象</button>}</div>
      <div className="companion-video-slots primary-video-slot">{renderVideoSlot(interactionStates[0], true)}</div>
      <details className="optional-video-states"><summary>交互状态 <small>{interactionStates.slice(1).filter((item) => clips[item.id]?.length).length} / {interactionStates.length - 1} 已配置</small></summary><div className="companion-video-slots">{interactionStates.slice(1).map((item) => renderVideoSlot(item))}</div></details>
      <details className="optional-video-states"><summary>表情反应 <small>{expressionStates.filter((item) => clips[item.id]?.length).length} / {expressionStates.length} 已配置</small></summary><div className="companion-video-slots">{expressionStates.map((item) => renderVideoSlot(item))}</div></details>
      <details className="optional-video-states"><summary>姿势动作 <small>{poseStates.filter((item) => clips[item.id]?.length).length} / {poseStates.length} 已配置</small></summary><div className="companion-video-slots">{poseStates.map((item) => renderVideoSlot(item))}</div></details>
      <div className="companion-media-cleanup"><button className="ghost-button quiet" disabled={Boolean(busy)} onClick={() => void cleanupUnused()}><Trash2 size={13} />清理未使用文件</button></div>
    </div>}
  </div>
}
