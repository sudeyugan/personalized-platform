import { Check, ImagePlus, RefreshCw, ShieldCheck, Sparkles } from 'lucide-react'
import { useMemo, useState } from 'react'
import { createAiProvider, type ImpressionCandidate } from '../../infrastructure/aiProvider'
import { useLibraryStore } from '../../state/useLibraryStore'
import { AssetImage } from '../assets/AssetImage'
import { anonymizeEntityReferences } from './entityPrivacy'

const styles = ['温暖手绘', '旧照片上色', '安静水彩', '电影感', '留白线稿']

async function candidateFile(candidate: ImpressionCandidate, title: string) {
  const image = new Image(); image.src = candidate.previewUrl; await image.decode()
  const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight
  canvas.getContext('2d')!.drawImage(image, 0, 0)
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('候选图转换失败')), 'image/png'))
  return new File([blob], `${title}-印象图.png`, { type: 'image/png' })
}

export function ChapterImpressionPanel({ chapterId }: { chapterId: string }) {
  const { data, importAsset, setChapterImpression, recordAiGeneration, setAiSettings } = useLibraryStore()
  const chapter = data.chapters[chapterId]
  const work = data.works.find((item) => item.id === chapter.workId)
  const impression = data.assets.find((asset) => asset.id === chapter.impressionAssetId && !asset.deletedAt)
  const [prompt, setPrompt] = useState('以克制、温暖的画面表现本章场景，不出现文字。')
  const [candidates, setCandidates] = useState<ImpressionCandidate[]>([])
  const [status, setStatus] = useState('发送前请确认下方预览，只会在手动点击后生成。')
  const [working, setWorking] = useState(false)
  const [redactEntities, setRedactEntities] = useState(true)
  const anonymized = useMemo(() => anonymizeEntityReferences(chapter.content), [chapter.content])
  const sourcePreview = redactEntities ? anonymized.text : chapter.plainText.slice(0, 360)

  const generate = async () => {
    setWorking(true); setCandidates([])
    try {
      const provider = createAiProvider(data.settings.ai)
      const result = await provider.generate({ chapterId, sourceRevision: chapter.revision, sourcePreview, prompt, stylePreset: data.settings.ai.stylePreset })
      setCandidates(result); setStatus(`已生成 ${result.length} 张临时候选；确认前不会进入素材库。`)
    } catch (error) { setStatus(error instanceof Error ? error.message : '生成失败，正文未受影响。') }
    finally { setWorking(false) }
  }
  const confirm = async (candidate: ImpressionCandidate) => {
    setWorking(true)
    try {
      const asset = await importAsset(await candidateFile(candidate, chapter.title), { workId: work?.id, chapterId })
      setChapterImpression(chapterId, asset.id)
      recordAiGeneration({ id: `generation-${crypto.randomUUID()}`, kind: 'chapter_impression', providerId: data.settings.ai.providerId, sourceId: chapterId, sourceRevision: chapter.revision, stylePreset: data.settings.ai.stylePreset, status: 'confirmed', resultAssetIds: [asset.id], createdAt: new Date().toISOString() })
      setCandidates([]); setStatus('印象图已确认并导入素材库。')
    } catch (error) { setStatus(error instanceof Error ? error.message : '候选图导入失败。') }
    finally { setWorking(false) }
  }

  return <section className="context-section impression-workflow"><div className="context-heading"><p className="context-label">章节印象图</p><Sparkles size={15} /></div>
    {impression && <div className="current-impression"><AssetImage asset={impression} /><span><Check size={12} />当前印象图</span></div>}
    <label className="ai-redaction-toggle"><input type="checkbox" checked={redactEntities} onChange={(event) => setRedactEntities(event.target.checked)} /><ShieldCheck size={14} /><span>发送前隐去正文资料标记<small>{anonymized.replacements > 0 ? `将 ${anonymized.replacements} 处人物、地点或事件替换为匿名代号` : '先在正文选中文字并使用“标记为资料”'}</small></span></label>
    <details><summary>本次发送预览</summary><p>{sourcePreview || '（章节暂无正文）'}</p></details>
    <textarea aria-label="印象图提示词" rows={3} value={prompt} onChange={(event) => setPrompt(event.target.value)} />
    <select aria-label="印象图画风" value={data.settings.ai.stylePreset} onChange={(event) => setAiSettings({ stylePreset: event.target.value })}>{styles.map((style) => <option key={style}>{style}</option>)}</select>
    <button className="ghost-button" disabled={working || !prompt.trim()} onClick={() => void generate()}>{working ? <RefreshCw className="spin" size={14} /> : <ImagePlus size={14} />}手动生成候选</button>
    <small>{status}</small>
    {candidates.length > 0 && <div className="impression-candidates">{candidates.map((candidate) => <button key={candidate.id} onClick={() => void confirm(candidate)}><img src={candidate.previewUrl} alt="印象图候选" /><span><Check size={12} />确认导入</span></button>)}</div>}
  </section>
}
