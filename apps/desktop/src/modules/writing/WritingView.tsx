import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Highlight from '@tiptap/extension-highlight'
import TaskItem from '@tiptap/extension-task-item'
import TaskList from '@tiptap/extension-task-list'
import TextAlign from '@tiptap/extension-text-align'
import type { EditorView } from '@tiptap/pm/view'
import { ArrowDown, ArrowUp, BookOpen, ChevronDown, Clock3, Eye, FileClock, Focus, FolderPlus, LockKeyhole, MessageCircle, Plus, RotateCcw, Save, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { useLibraryStore } from '../../state/useLibraryStore'
import { EditorToolbar } from './EditorToolbar'
import { WritingRecordPanel } from './WritingRecordPanel'
import { ImageAssetNode } from './ImageAssetNode'
import { ChapterImpressionPanel } from './ChapterImpressionPanel'
import { EncryptedWorkGate } from './EncryptedWorkGate'
import { EntityReferenceMark } from './EntityReferenceMark'
import { EntityTagMenu } from './EntityTagMenu'
import { LineHeight } from './LineHeight'
import { CompanionPanel } from '../companion/CompanionPanel'

type PendingDeletion = { kind: 'work' | 'volume' | 'chapter' | 'chapter-permanent'; id: string; label: string } | null

export function WritingView() {
  const { data, saveStatus, recoveryDrafts, importAsset, linkAssetToChapter, lockWork, selectWork, selectChapter, renameWork, trashWork, createChapter, createVolume, renameVolume, trashVolume, moveChapter, reorderChapter, trashChapter, restoreChapter, permanentlyDeleteChapter, renameChapter, saveChapter, createManualVersion, restoreVersion, toggleVersionPinned, toggleFocusMode, updateChapterSession, saveRecoveryDraft, discardRecoveryDraft } = useLibraryStore()
  const chapter = data.chapters[data.session.activeChapterId]
  const chapterId = chapter?.id
  const work = data.works.find((item) => item.id === data.session.activeWorkId)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [renaming, setRenaming] = useState(false)
  const [slashOpen, setSlashOpen] = useState(false)
  const [entitySelection, setEntitySelection] = useState<{ from: number; to: number; text: string } | null>(null)
  const [previewVersionId, setPreviewVersionId] = useState<string | null>(null)
  const [pendingDeletion, setPendingDeletion] = useState<PendingDeletion>(null)
  const [companionDrawerOpen, setCompanionDrawerOpen] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const sessionTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const recoveryTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const [offeredDraftId, setOfferedDraftId] = useState<string | null>(() => chapter && recoveryDrafts[chapter.id] ? chapter.id : null)
  const sessionRef = useRef(data.session)
  const draftsRef = useRef(recoveryDrafts)
  sessionRef.current = data.session
  draftsRef.current = recoveryDrafts

  const importImagesIntoView = async (files: File[], targetChapterId: string, workId: string | undefined, view: EditorView) => {
    for (const file of files) {
      const asset = await importAsset(file, { workId, chapterId: targetChapterId })
      linkAssetToChapter(asset.id, targetChapterId)
      const node = view.state.schema.nodes.imageAsset.create({ assetId: asset.id, alt: '', caption: '', width: 72, align: 'center' })
      view.dispatch(view.state.tr.replaceSelectionWith(node).scrollIntoView())
    }
  }

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: { openOnClick: false, defaultProtocol: 'https' } }),
      Highlight,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      LineHeight,
      TaskList,
      TaskItem.configure({ nested: true }),
      ImageAssetNode,
      EntityReferenceMark,
    ],
    content: chapter?.content,
    immediatelyRender: false,
    editorProps: {
      attributes: { class: 'prose-editor', spellcheck: 'true' },
      handlePaste: (view, event) => {
        const files = [...(event.clipboardData?.files ?? [])].filter((file) => file.type.startsWith('image/'))
        if (!files.length || !chapter) return false
        void importImagesIntoView(files, chapter.id, work?.id, view)
        return true
      },
      handleDrop: (view, event) => {
        const files = [...(event.dataTransfer?.files ?? [])].filter((file) => file.type.startsWith('image/'))
        if (!files.length || !chapter) return false
        event.preventDefault(); void importImagesIntoView(files, chapter.id, work?.id, view)
        return true
      },
    },
    onUpdate: ({ editor: currentEditor }) => {
      if (!chapter) return
      const content = currentEditor.getJSON()
      const plainText = currentEditor.getText({ blockSeparator: '\n' })
      if (recoveryTimer.current) clearTimeout(recoveryTimer.current)
      recoveryTimer.current = setTimeout(() => { void saveRecoveryDraft(chapter.id, content, plainText) }, 120)
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => {
        void saveChapter(chapter.id, content, plainText)
      }, 650)
      setSlashOpen(currentEditor.getText().endsWith('/'))
    },
    onSelectionUpdate: ({ editor: currentEditor }) => {
      if (!chapter) return
      if (sessionTimer.current) clearTimeout(sessionTimer.current)
      sessionTimer.current = setTimeout(() => updateChapterSession(chapter.id, currentEditor.state.selection.anchor, scrollRef.current?.scrollTop ?? 0), 400)
    },
  }, [chapter?.id])

  useEffect(() => {
    if (!editor || !chapterId) return
    const cursor = sessionRef.current.cursorByChapter[chapterId]
    if (cursor) editor.commands.setTextSelection(Math.min(cursor, editor.state.doc.content.size))
    requestAnimationFrame(() => { if (scrollRef.current) scrollRef.current.scrollTop = sessionRef.current.scrollByChapter[chapterId] ?? 0 })
  }, [editor, chapterId])
  useEffect(() => {
    setOfferedDraftId(chapterId && draftsRef.current[chapterId] ? chapterId : null)
  }, [chapterId])
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); if (sessionTimer.current) clearTimeout(sessionTimer.current); if (recoveryTimer.current) clearTimeout(recoveryTimer.current) }, [])
  const previewVersion = useMemo(() => chapter?.versions.find((version) => version.id === previewVersionId), [chapter?.versions, previewVersionId])
  const companionEnabled = data.settings.showRightPanel && (data.settings.modules.find((module) => module.id === 'companion')?.enabled ?? false)

  if (work?.locked) return <EncryptedWorkGate work={work} />
  if (!work || !chapter || !editor) {
    return <div className="empty-state"><BookOpen size={42} /><h2>还没有打开章节</h2><p>从左侧选择一个章节，或创建新的篇章。</p><button className="primary-button" onClick={createChapter}><Plus size={16} />新建章节</button></div>
  }

  const applySlashCommand = (command: 'heading' | 'quote' | 'divider') => {
    const cursor = editor.state.selection.from
    const chain = editor.chain().focus()
    if (cursor > 0) chain.deleteRange({ from: cursor - 1, to: cursor })
    if (command === 'heading') chain.toggleHeading({ level: 1 })
    if (command === 'quote') chain.toggleBlockquote()
    if (command === 'divider') chain.setHorizontalRule()
    chain.run()
    setSlashOpen(false)
  }

  const insertSelectedImages = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = [...(event.target.files ?? [])]; event.target.value = ''
    for (const file of files) { const asset = await importAsset(file, { workId: work.id, chapterId: chapter.id }); linkAssetToChapter(asset.id, chapter.id); editor.commands.insertContent({ type: 'imageAsset', attrs: { assetId: asset.id, alt: asset.alt ?? '', caption: asset.caption ?? '', width: 72, align: 'center' } }) }
  }

  const openEntityTagMenu = () => {
    const { from, to } = editor.state.selection
    const raw = editor.state.doc.textBetween(from, to, ' ')
    const leading = raw.length - raw.trimStart().length
    const trailing = raw.length - raw.trimEnd().length
    const text = raw.trim()
    if (!text) return
    setEntitySelection({ from: from + leading, to: to - trailing, text: text.slice(0, 80) })
  }

  return (
    <div className={`${data.settings.showRightPanel ? 'writing-layout' : 'writing-layout no-context'}${data.session.focusMode ? ' focus-writing' : ''}`}>
      {!data.session.focusMode && <aside className="chapter-sidebar">
        <div className="work-picker">
          <label>当前作品</label>
          <div><select value={work.id} onChange={(event) => selectWork(event.target.value)}>{data.works.filter((item) => !item.deletedAt).map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select><ChevronDown size={15} /></div>
          <span className="work-actions"><button onClick={() => { const title = window.prompt('重命名作品', work.title); if (title) renameWork(work.id, title) }}>重命名</button><button onClick={() => setPendingDeletion({ kind: 'work', id: work.id, label: work.title })}>删除</button></span>
        </div>
        <div className="chapter-list-heading"><span>章节 · {work.chapterIds.filter((id) => !data.chapters[id]?.deletedAt).length}</span><span><button aria-label="新建卷" onClick={createVolume}><FolderPlus size={16} /></button><button aria-label="新建章节" onClick={createChapter}><Plus size={17} /></button></span></div>
        {data.volumes.filter((volume) => volume.workId === work.id && !volume.deletedAt).map((volume) => <div className="volume-row" key={volume.id}><span>{volume.title}</span><span><button onClick={() => { const title = window.prompt('重命名卷', volume.title); if (title) renameVolume(volume.id, title) }}>改名</button><button onClick={() => setPendingDeletion({ kind: 'volume', id: volume.id, label: volume.title })}>删除</button></span></div>)}
        <div className="chapter-list">
          {work.chapterIds.filter((id) => !data.chapters[id]?.deletedAt).map((chapterId, index) => {
            const item = data.chapters[chapterId]
            return <div draggable onDragStart={(event) => event.dataTransfer.setData('text/chapter-id', item.id)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => reorderChapter(event.dataTransfer.getData('text/chapter-id'), item.id)} className={item.id === chapter.id ? 'chapter-row active' : 'chapter-row'} key={item.id} onClick={() => selectChapter(item.id)}><span>{String(index + 1).padStart(2, '0')}</span><div><strong>{item.title}</strong><small>{item.wordCount} 字</small></div><span className="chapter-actions"><button aria-label={`上移章节：${item.title}`} title="上移" onClick={(e) => { e.stopPropagation(); moveChapter(item.id, -1) }}><ArrowUp size={13} /></button><button aria-label={`下移章节：${item.title}`} title="下移" onClick={(e) => { e.stopPropagation(); moveChapter(item.id, 1) }}><ArrowDown size={13} /></button><button className="chapter-delete-button" aria-label={`删除章节：${item.title}`} title="删除章节（移入回收站）" onClick={(e) => { e.stopPropagation(); setPendingDeletion({ kind: 'chapter', id: item.id, label: item.title }) }}><Trash2 size={13} /></button></span></div>
          })}
        </div>
        <button className="new-chapter-button" onClick={createChapter}><Plus size={16} />新建章节</button>
        {work.chapterIds.some((id) => data.chapters[id]?.deletedAt) && <div className="trash-section"><span>回收站</span>{work.chapterIds.filter((id) => data.chapters[id]?.deletedAt).map((id) => <div key={id}><button onClick={() => restoreChapter(id)}><RotateCcw size={12} />{data.chapters[id].title}</button><button title="永久删除" onClick={() => setPendingDeletion({ kind: 'chapter-permanent', id, label: data.chapters[id].title })}><Trash2 size={12} /></button></div>)}</div>}
      </aside>}

      <article className="editor-pane">
        {offeredDraftId === chapter.id && recoveryDrafts[chapter.id] && <div className="recovery-banner"><span>发现一份比资料库更新的临时草稿，可恢复上次意外退出前的内容。</span><div><button onClick={() => { const draft = recoveryDrafts[chapter.id]; editor.commands.setContent(draft.content); setOfferedDraftId(null) }}>恢复草稿</button><button onClick={() => { void discardRecoveryDraft(chapter.id); setOfferedDraftId(null) }}>忽略</button></div></div>}
        <header className="editor-header">
          <div className="breadcrumb">{work.title}<span>/</span>正文 {work.encrypted && <button className="editor-lock-button" onClick={() => void lockWork(work.id)}><LockKeyhole size={13} />立即锁定</button>}<button className="focus-button" onClick={toggleFocusMode}><Focus size={14} />{data.session.focusMode ? '退出专注' : '专注模式'}</button></div>
          {renaming ? (
            <input className="title-input" autoFocus defaultValue={chapter.title} onBlur={(event) => { renameChapter(chapter.id, event.target.value); setRenaming(false) }} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur() }} />
          ) : <h1 onDoubleClick={() => setRenaming(true)}>{chapter.title}</h1>}
          <div className={`save-indicator ${saveStatus}`}><span />{saveStatus === 'saving' ? '保存中…' : saveStatus === 'error' ? '保存失败' : '已保存到本地'}</div>
        </header>
        <input ref={imageInputRef} className="editor-hidden-image-input" type="file" multiple accept="image/jpeg,image/png,image/webp" onChange={(event) => void insertSelectedImages(event)} />
        <EditorToolbar editor={editor} onInsertImage={() => imageInputRef.current?.click()} onTagSelection={openEntityTagMenu} onClearEntityTag={() => editor.chain().focus().unsetEntityReference().run()} />
        {entitySelection && <EntityTagMenu chapterId={chapter.id} editor={editor} selection={entitySelection} onClose={() => setEntitySelection(null)} />}
        <div className="editor-scroll" ref={scrollRef} onScroll={() => { if (sessionTimer.current) clearTimeout(sessionTimer.current); sessionTimer.current = setTimeout(() => updateChapterSession(chapter.id, editor.state.selection.anchor, scrollRef.current?.scrollTop ?? 0), 400) }}><EditorContent editor={editor} />{slashOpen && <div className="slash-menu"><button onClick={() => applySlashCommand('heading')}>标题 1</button><button onClick={() => applySlashCommand('quote')}>引用</button><button onClick={() => applySlashCommand('divider')}>分割线</button></div>}</div>
        <footer className="editor-footer"><span>{chapter.wordCount} 字</span><span>第 {chapter.revision} 次修订</span><span>双击标题可重命名</span></footer>
      </article>

      {companionEnabled && <><button className="companion-drawer-trigger" aria-label="打开伙伴侧栏" onClick={() => setCompanionDrawerOpen(true)}><MessageCircle size={17} /><span>{data.companion.name}</span></button>{companionDrawerOpen && <div className="companion-drawer-backdrop" onMouseDown={() => setCompanionDrawerOpen(false)}><aside className="companion-drawer" onMouseDown={(event) => event.stopPropagation()}><header><div><small>写作伙伴</small><strong>{data.companion.name}</strong></div><button aria-label="关闭伙伴侧栏" onClick={() => setCompanionDrawerOpen(false)}><X size={17} /></button></header><CompanionPanel /></aside></div>}</>}

      {data.settings.showRightPanel && (
        <aside className="context-panel">
          <section className="context-section">
            <p className="context-label">今日写作</p>
            <div className="daily-progress"><div><strong>{chapter.wordCount}</strong><span>/ {data.settings.dailyTarget} 字</span></div><div className="progress-track"><span style={{ width: `${Math.min(100, chapter.wordCount / data.settings.dailyTarget * 100)}%` }} /></div></div>
          </section>
          <section className="context-section">
            <div className="context-heading"><p className="context-label">版本记录</p><button onClick={() => createManualVersion(chapter.id)} title="保存手动版本"><Save size={15} /></button></div>
            <div className="version-list">
              {[...chapter.versions].reverse().slice(0, 6).map((version) => (
                <button key={version.id} title="单击预览，右键固定或取消固定" onContextMenu={(event) => { event.preventDefault(); toggleVersionPinned(chapter.id, version.id) }} onClick={() => setPreviewVersionId(version.id)}><FileClock size={16} /><span><strong>{version.pinned ? '📌 ' : ''}{version.label ?? `自动版本 · r${version.revision}`}</strong><small>{new Date(version.createdAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })} · {version.wordCount} 字</small></span><Eye size={13} /></button>
              ))}
              {chapter.versions.length === 0 && <p className="muted-copy">继续书写，自动版本会在适当时机出现。</p>}
            </div>
          </section>
          <ChapterImpressionPanel chapterId={chapter.id} />
          <section className="context-section compact"><Clock3 size={15} /><span>上次更新<br /><strong>{new Date(chapter.updatedAt).toLocaleString('zh-CN')}</strong></span></section>
          <WritingRecordPanel chapterId={chapter.id} editor={editor} />
          {companionEnabled && <CompanionPanel />}
        </aside>
      )}
      {previewVersion && <div className="version-modal"><section><header><div><small>历史版本 r{previewVersion.revision}</small><h2>{previewVersion.label ?? '自动版本'}</h2></div><button onClick={() => setPreviewVersionId(null)}><X /></button></header><div className="version-comparison"><article><strong>历史内容</strong><pre>{previewVersion.plainText || '（空白）'}</pre></article><article><strong>当前内容</strong><pre>{chapter.plainText || '（空白）'}</pre></article></div><footer><span>恢复会创建新修订，不覆盖历史记录。</span><button className="primary-button" onClick={() => { void restoreVersion(chapter.id, previewVersion.id); setPreviewVersionId(null) }}><RotateCcw size={15} />恢复为新版本</button></footer></section></div>}
      {pendingDeletion && <ConfirmDialog title={pendingDeletion.kind === 'chapter-permanent' ? '永久删除章节？' : `将${pendingDeletion.kind === 'work' ? '作品' : pendingDeletion.kind === 'volume' ? '卷' : '章节'}移入回收站？`} subject={pendingDeletion.kind === 'work' ? `《${pendingDeletion.label}》` : pendingDeletion.label} description={pendingDeletion.kind === 'chapter-permanent' ? '章节正文、历史版本和相关引用会被清理，这项操作无法撤销。' : '内容会从当前写作空间隐藏并进入回收站，之后仍可恢复。'} confirmLabel={pendingDeletion.kind === 'chapter-permanent' ? '永久删除' : '移入回收站'} permanent={pendingDeletion.kind === 'chapter-permanent'} facts={[{ label: '操作对象', value: pendingDeletion.kind === 'work' ? '整部作品' : pendingDeletion.kind === 'volume' ? '卷及其归档状态' : '单个章节' }, { label: '恢复方式', value: pendingDeletion.kind === 'chapter-permanent' ? '无法恢复' : '可从回收站恢复' }]} onCancel={() => setPendingDeletion(null)} onConfirm={() => { if (pendingDeletion.kind === 'work') trashWork(pendingDeletion.id); else if (pendingDeletion.kind === 'volume') trashVolume(pendingDeletion.id); else if (pendingDeletion.kind === 'chapter') trashChapter(pendingDeletion.id); else permanentlyDeleteChapter(pendingDeletion.id); setPendingDeletion(null) }} />}
    </div>
  )
}
