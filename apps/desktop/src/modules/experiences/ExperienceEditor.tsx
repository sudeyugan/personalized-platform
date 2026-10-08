import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { ArrowLeft } from 'lucide-react'
import { categoryLabels, experienceCategories, tierIds, type ExperienceData, type ExperienceDraft, type ExperienceEntry } from '../../domain/experiences'
import { candidateSource, prepareCoverFile, type CoverCandidate } from '../../infrastructure/experienceCovers'
import { useLibraryStore } from '../../state/useLibraryStore'
import { ExperienceArtwork } from './ExperienceArtwork'
import { CoverPicker } from './CoverPicker'
import { useExperienceDraft } from './useExperienceDraft'
import { ConfirmDialog } from '../../components/ConfirmDialog'

export function ExperienceEditor({ entry, place, labels, onClose }: { entry?: ExperienceEntry; place: boolean; labels: ExperienceData['tierLabels']; onClose: () => void }) {
  const { draft, setDraft, file, setFile, dirty, setDirty, clearDraft } = useExperienceDraft(entry, place)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [confirmClose, setConfirmClose] = useState(false)
  const revision = useRef(0)
  useEffect(() => () => { revision.current++ }, [])
  const data = useLibraryStore(store => store.data)
  const asset = data.assets.find(item => item.id === draft.coverAssetId && !item.deletedAt)
  const reusable = data.experiences?.entries.find(item => !item.deletedAt && item.id !== entry?.id && item.category === draft.category && item.title.trim() === draft.title.trim() && item.creator.trim() === draft.creator.trim() && item.coverAssetId && data.assets.some(image => image.id === item.coverAssetId && !image.deletedAt))
  const update = (changes: Partial<ExperienceDraft>) => { setDraft(previous => ({ ...previous, ...changes })); setDirty(true) }
  const close = () => { if (!busy) { if (dirty) setConfirmClose(true); else onClose() } }
  const save = async (event: FormEvent) => {
    event.preventDefault(); if (busy || !draft.title.trim()) return
    setBusy(true); setMessage('正在保存到本地…')
    try {
      const store = useLibraryStore.getState()
      const cover = file ? await store.importAsset(file, { purpose: 'experience' }) : undefined
      store.saveExperience({ ...draft, coverAssetId: cover?.id ?? draft.coverAssetId }, entry?.id)
      clearDraft(); onClose()
    } catch (error) { setMessage(error instanceof Error ? error.message : '保存失败，请重试') }
    finally { setBusy(false) }
  }
  const chooseImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const source = event.target.files?.[0]; event.target.value = ''
    if (!source) return
    const current = ++revision.current
    setBusy(true)
    try { const prepared = await prepareCoverFile(source); if (revision.current === current) { setFile(prepared); update({ source: undefined, coverAssetId: undefined }); setMessage('图片已准备，保存卡片后才写入资料库') } }
    catch (error) { setMessage(error instanceof Error ? error.message : '无法读取图片') }
    finally { if (revision.current === current) setBusy(false) }
  }
  const pick = (candidate: CoverCandidate, selected?: File) => {
    setFile(selected); update({ title: draft.title || candidate.title, creator: draft.creator || candidate.creator, coverAssetId: selected ? undefined : draft.coverAssetId, source: selected || !draft.coverAssetId ? candidateSource(candidate) : draft.source })
    setMessage(selected ? '已选择封面，保存后可离线查看' : '已补充作品信息，原有文字和封面不变')
  }
  return <aside className="experience-editor experience-editor-page" aria-label="经历卡片编辑">
    <header><div><p className="eyebrow">{entry ? '翻开这一页' : '收进一段经历'}</p><h2>{place ? '路过的地方' : '看过的作品'}</h2></div><button type="button" aria-label="关闭经历编辑" disabled={busy} onClick={close}><ArrowLeft size={18} /> 返回经历册</button></header>
    <form onSubmit={event => void save(event)}><div className="experience-edit-layout"><div className="experience-cover-column"><div className="experience-editor-preview"><ExperienceArtwork entry={draft} asset={asset} file={file} /></div>
      <div className="experience-image-actions"><label className="ghost-button"><input type="file" disabled={busy} accept="image/jpeg,image/png,image/webp" onChange={event => void chooseImage(event)} />{place ? '选一张照片' : '选本地图片'}</label>
        {(file || draft.coverAssetId) && <button type="button" disabled={busy} onClick={() => { setFile(undefined); update({ coverAssetId: undefined, source: undefined }) }}>改用纸封</button>}</div>
      {!place && reusable && !draft.coverAssetId && !file && <button type="button" disabled={busy} onClick={() => { setFile(undefined); update({ coverAssetId: reusable.coverAssetId, source: reusable.source }); setMessage('已复用本地封面，无需联网') }}>复用同作品封面</button>}
      {!place && <CoverPicker key={draft.category + draft.title + draft.creator} category={draft.category} title={draft.title} creator={draft.creator} disabled={busy} onPick={pick} />}
      {draft.source && <p className="experience-source-note">{draft.source.credit} · <a href={draft.source.url} target="_blank" rel="noreferrer">原始来源 ↗</a></p>}
      </div><fieldset disabled={busy}><div className="experience-editor-two"><label>名称<input autoFocus required maxLength={160} value={draft.title} placeholder={place ? '一座城，一条街，一间小店…' : '作品名称'} onChange={event => update({ title: event.target.value })} /></label>
        <label>类别<select value={draft.category} onChange={event => update({ category: event.target.value as ExperienceDraft['category'] })}>{experienceCategories.filter(category => place ? category === 'place' : category !== 'place').map(category => <option value={category} key={category}>{categoryLabels[category]}</option>)}</select></label></div>
      <label>留下的感想 · 可选<textarea className="experience-note-paper" maxLength={10000} rows={6} value={draft.note} placeholder="记下你自己的感受，不必写成完整评论。" onChange={event => update({ note: event.target.value })} /></label>
      <label>个人档位<select value={draft.tier ?? ''} onChange={event => update({ tier: event.target.value ? event.target.value as ExperienceDraft['tier'] : undefined })}><option value="">先不排行</option>{tierIds.map(tier => <option value={tier} key={tier}>{labels[tier]}</option>)}</select></label>
      <details className="experience-edit-details"><summary>再添一点细节 · 可选</summary>
      <div className="experience-editor-two"><label>{place ? '所在地区 · 可选' : '作者 / 创作者 · 可选'}<input maxLength={100} value={draft.creator} onChange={event => update({ creator: event.target.value })} /></label><label>经历时间 · 可选<input maxLength={80} value={draft.dateText} placeholder="去年夏天 / 留空" onChange={event => update({ dateText: event.target.value })} /></label></div>
        <label>无图纸封<select value={draft.paperStyle} onChange={event => update({ paperStyle: event.target.value as ExperienceDraft['paperStyle'] })}><option value="linen">素纸</option><option value="ink">墨夜</option><option value="blue">清蓝</option><option value="rose">蔷薇</option></select></label></details>
      </fieldset></div>
      {message && <p role="status">{message}</p>}
      <footer className="experience-editor-footer"><button type="button" className="ghost-button" disabled={busy} onClick={close}>先放下</button><button type="submit" className="primary-button" disabled={busy || !draft.title.trim()}>{busy ? '正在准备…' : '保存这一页'}</button></footer>
    </form>
    {confirmClose && <ConfirmDialog title="先放下这张卡片？" subject={draft.title || '未命名经历'} description="尚未保存的文字和选图会放下，原有记录不会改变。" confirmLabel="放下修改" onCancel={() => setConfirmClose(false)} onConfirm={() => { clearDraft(); onClose() }} />}
  </aside>
}
