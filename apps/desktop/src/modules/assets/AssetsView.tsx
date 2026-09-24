import { ImagePlus, Link2, Pencil, RotateCcw, ScanSearch, Trash2, X } from 'lucide-react'
import { useMemo, useState, type ChangeEvent, type DragEvent } from 'react'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { orphanAssets, referencedAssetIds } from '../../state/assetsSlice'
import { useLibraryStore } from '../../state/useLibraryStore'
import { AssetImage } from './AssetImage'

export function AssetsView() {
  const { data, importAsset, updateAsset, trashAsset, restoreAsset, permanentlyDeleteAsset } = useLibraryStore()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showOrphans, setShowOrphans] = useState(false)
  const [pendingDeletion, setPendingDeletion] = useState<{ id: string; name: string; references: number; permanent: boolean } | null>(null)
  const [message, setMessage] = useState('可选择、拖放或粘贴 JPG、PNG、WebP，导入后不再依赖原文件。')
  const referenced = useMemo(() => referencedAssetIds(data), [data])
  const orphans = useMemo(() => orphanAssets(data), [data])
  const visible = (showOrphans ? orphans : data.assets.filter((asset) => asset.purpose !== 'companion' && !asset.deletedAt))
  const selected = data.assets.find((asset) => asset.id === selectedId && asset.purpose !== 'companion' && !asset.deletedAt)
  const deleted = data.assets.filter((asset) => asset.purpose !== 'companion' && asset.deletedAt)

  const addFiles = async (files: File[]) => {
    for (const file of files) {
      try { await importAsset(file, { workId: data.session.activeWorkId }); setMessage(`已导入 ${file.name}`) }
      catch (error) { setMessage(error instanceof Error ? error.message : '图片导入失败') }
    }
  }
  const choose = (event: ChangeEvent<HTMLInputElement>) => { const files = [...(event.target.files ?? [])]; event.target.value = ''; void addFiles(files) }
  const drop = (event: DragEvent) => { event.preventDefault(); void addFiles([...event.dataTransfer.files].filter((file) => file.type.startsWith('image/'))) }

  return <main className="assets-view scroll-view" onDragOver={(event) => event.preventDefault()} onDrop={drop}>
    <header className="page-header"><div><p className="eyebrow">本地素材库</p><h1>留住画面，也留住来源</h1><p>{message}</p></div><div className="asset-header-actions"><button className={showOrphans ? 'ghost-button active' : 'ghost-button'} onClick={() => setShowOrphans(!showOrphans)}><ScanSearch size={15} />孤儿扫描 · {orphans.length}</button><label className="primary-button asset-upload"><input type="file" multiple accept="image/jpeg,image/png,image/webp" onChange={choose} /><ImagePlus size={16} />导入图片</label></div></header>
    <section className="asset-grid">{visible.map((asset) => <article className={selectedId === asset.id ? 'asset-card selected' : 'asset-card'} key={asset.id} onClick={() => setSelectedId(asset.id)}><div className="asset-preview"><AssetImage asset={asset} /></div><div><strong>{asset.fileName}</strong><span>{asset.width} × {asset.height} · {(asset.size / 1024 / 1024).toFixed(2)} MB</span><small><Link2 size={11} />{referenced.has(asset.id) ? '已在内容中使用' : '尚未引用'}</small></div><button aria-label={`删除${asset.fileName}`} onClick={(event) => { event.stopPropagation(); setPendingDeletion({ id: asset.id, name: asset.fileName, references: asset.chapterIds.length, permanent: false }) }}><Trash2 size={14} /></button></article>)}</section>
    {visible.length === 0 && <section className="empty-state"><ImagePlus size={38} /><h2>{showOrphans ? '没有孤儿素材' : '素材库还是空的'}</h2><p>{showOrphans ? '所有图片都正在被章节或印象图引用。' : '把图片拖到这里，或点击右上角导入。'}</p></section>}
    {deleted.length > 0 && <section className="record-trash"><h2>素材回收站</h2>{deleted.map((asset) => <div key={asset.id}><span>{asset.fileName}</span><button onClick={() => restoreAsset(asset.id)}><RotateCcw size={13} />恢复</button><button onClick={() => setPendingDeletion({ id: asset.id, name: asset.fileName, references: asset.chapterIds.length, permanent: true })}><Trash2 size={13} />永久删除</button></div>)}</section>}
    {pendingDeletion && <ConfirmDialog title={pendingDeletion.permanent ? '永久删除素材？' : '将素材移入回收站？'} subject={pendingDeletion.name} description={pendingDeletion.permanent ? '本地素材文件会被移除，正文中的失效引用不会被静默改写，但图片无法恢复。' : '素材会从当前素材库隐藏并进入回收站，正文引用暂时保留。'} confirmLabel={pendingDeletion.permanent ? '永久删除' : '移入回收站'} permanent={pendingDeletion.permanent} facts={[{ label: '关联章节', value: `${pendingDeletion.references} 个` }, { label: '恢复方式', value: pendingDeletion.permanent ? '无法恢复' : '可从素材回收站恢复' }]} onCancel={() => setPendingDeletion(null)} onConfirm={() => { if (pendingDeletion.permanent) void permanentlyDeleteAsset(pendingDeletion.id); else trashAsset(pendingDeletion.id); if (selectedId === pendingDeletion.id) setSelectedId(null); setPendingDeletion(null) }} />}
    {selected && <aside className="record-side-panel" aria-label={`${selected.fileName}素材工作栏`}><header><div><p className="eyebrow">素材信息</p><h2>{selected.fileName}</h2></div><button aria-label="关闭素材工作栏" onClick={() => setSelectedId(null)}><X size={17} /></button></header><div className="record-side-panel-content"><div className="asset-detail-image"><AssetImage asset={selected} thumbnail={false} /></div><label className="asset-field"><span>替代文本</span><input defaultValue={selected.alt} onBlur={(event) => updateAsset(selected.id, { alt: event.target.value, caption: selected.caption })} /></label><label className="asset-field"><span>图片说明</span><textarea rows={3} defaultValue={selected.caption} onBlur={(event) => updateAsset(selected.id, { alt: selected.alt, caption: event.target.value })} /></label><div className="asset-facts"><span>SHA-256</span><code>{selected.sha256}</code><span>引用章节</span><strong>{selected.chapterIds.length}</strong></div><button className="ghost-button" onClick={() => setSelectedId(null)}><Pencil size={14} />完成编辑</button></div></aside>}
  </main>
}
