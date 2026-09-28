import { ReplaceAll, Search, ShieldCheck, X } from 'lucide-react'
import type { Editor } from '@tiptap/react'
import { useMemo, useState } from 'react'
import type { Chapter, Work } from '../../domain/models'
import { useLibraryStore } from '../../state/useLibraryStore'
import { contentToPlainText, countContentMatches, replaceTextInContent } from './workTextSearch'

export function WorkSearchDialog({ work, chapters, editor, onBeforeReplace, onClose }: { work: Work; chapters: Chapter[]; editor: Editor; onBeforeReplace: () => Promise<void>; onClose: () => void }) {
  const { data, createManualVersion, saveChapter, selectChapter } = useLibraryStore()
  const [query, setQuery] = useState('')
  const [replacement, setReplacement] = useState('')
  const [excludedIds, setExcludedIds] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const results = useMemo(() => chapters.map((chapter) => ({ chapter, count: countContentMatches(chapter.content, query) })).filter((item) => item.count > 0), [chapters, query])
  const total = results.reduce((sum, item) => sum + item.count, 0)
  const targetIds = results.filter((item) => !excludedIds.includes(item.chapter.id)).map((item) => item.chapter.id)

  const toggle = (chapterId: string) => {
    setExcludedIds((current) => current.includes(chapterId) ? current.filter((id) => id !== chapterId) : [...current, chapterId])
  }

  const replace = async () => {
    if (!query.trim() || !targetIds.length) return
    const targetCount = results.filter((item) => targetIds.includes(item.chapter.id)).reduce((sum, item) => sum + item.count, 0)
    if (!window.confirm('将在 ' + targetIds.length + ' 个章节中替换 ' + targetCount + ' 处。每章都会先保存一个固定版本，继续吗？')) return
    setBusy(true)
    setError('')
    try {
      await onBeforeReplace()
      for (const chapterId of targetIds) {
        const current = useLibraryStore.getState().data.chapters[chapterId]
        if (!current) continue
        await createManualVersion(chapterId)
        const next = replaceTextInContent(current.content, query, replacement)
        await saveChapter(chapterId, next.content, contentToPlainText(next.content))
        if (useLibraryStore.getState().saveStatus === 'error') throw new Error('章节保存失败，替换已停止；已完成的章节可从固定版本恢复。')
        if (chapterId === data.session.activeChapterId) editor.commands.setContent(next.content, { emitUpdate: false })
      }
      onClose()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '替换未能完成，请稍后重试。')
    } finally { setBusy(false) }
  }

  return <div className="work-search-backdrop" onMouseDown={onClose}>
    <section className="work-search-dialog" onMouseDown={(event) => event.stopPropagation()}>
      <header><div><small>整部作品</small><h2>查找与替换 · {work.title}</h2></div><button aria-label="关闭" onClick={onClose}><X size={18} /></button></header>
      <div className="work-search-fields">
        <label><span>查找内容</span><input autoFocus value={query} onChange={(event) => { setQuery(event.target.value); setExcludedIds([]) }} placeholder="输入要查找的文字" /></label>
        <label><span>替换为</span><input value={replacement} onChange={(event) => setReplacement(event.target.value)} placeholder="留空表示删除" /></label>
      </div>
      <div className="work-search-summary"><Search size={14} /><span>{query.trim() ? '共 ' + total + ' 处，分布在 ' + results.length + ' 个章节' : '输入文字后预览整部作品中的匹配位置'}</span></div>
      {error && <p className="work-search-error">{error}</p>}
      <div className="work-search-results">
        {results.map(({ chapter, count }) => {
          const checked = !excludedIds.includes(chapter.id)
          const index = chapter.plainText.toLocaleLowerCase().indexOf(query.trim().toLocaleLowerCase())
          const excerpt = index < 0 ? chapter.plainText.slice(0, 110) : chapter.plainText.slice(Math.max(0, index - 28), index + query.trim().length + 72)
          return <article key={chapter.id}>
            <label><input type="checkbox" checked={checked} onChange={() => toggle(chapter.id)} /><span><strong>{chapter.title}</strong><small>{count} 处匹配</small></span></label>
            <button onClick={() => { selectChapter(chapter.id); onClose() }}>{excerpt || '（空白）'}</button>
          </article>
        })}
        {query.trim() && !results.length && <p>这部作品中没有找到相关文字。</p>}
      </div>
      <footer><span><ShieldCheck size={14} />替换前自动固定当前版本，可随时恢复。</span><button className="primary-button" disabled={busy || !targetIds.length} onClick={() => void replace()}><ReplaceAll size={15} />{busy ? '正在替换…' : '替换所选章节'}</button></footer>
    </section>
  </div>
}
