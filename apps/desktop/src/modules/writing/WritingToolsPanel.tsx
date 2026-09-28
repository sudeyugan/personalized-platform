import { BookOpenText, MessageSquareText, Search, Trash2, X } from 'lucide-react'
import { useEditorState, type Editor } from '@tiptap/react'
import { useState } from 'react'
import type { Chapter, Work } from '../../domain/models'

type Tool = 'annotations' | 'reference' | null
interface AnnotationItem { id: string; note: string; createdAt: string; from: number; to: number; excerpt: string }

function annotationsFrom(editor: Editor) {
  const items = new Map<string, AnnotationItem>()
  editor.state.doc.descendants((node, position) => {
    if (!node.isText || !node.text) return
    const mark = node.marks.find((item) => item.type.name === 'authorAnnotation')
    if (!mark) return
    const id = String(mark.attrs.id)
    const previous = items.get(id)
    if (previous) { previous.to = position + node.nodeSize; previous.excerpt += node.text }
    else items.set(id, { id, note: String(mark.attrs.note ?? ''), createdAt: String(mark.attrs.createdAt ?? ''), from: position, to: position + node.nodeSize, excerpt: node.text })
  })
  return [...items.values()]
}

export function WritingToolsPanel({ editor, work, chapter, chapters, onOpenSearch }: { editor: Editor; work: Work; chapter: Chapter; chapters: Chapter[]; onOpenSearch: () => void }) {
  const [tool, setTool] = useState<Tool>(null)
  const [referenceId, setReferenceId] = useState(chapter.id)
  const documentVersion = useEditorState({ editor, selector: ({ editor: current }) => current.state.doc.toJSON() })
  const annotations = annotationsFrom(editor)
  void documentVersion
  const reference = chapters.find((item) => item.id === referenceId) ?? chapter

  const addAnnotation = () => {
    const { from, to, empty } = editor.state.selection
    if (empty) return
    const note = window.prompt('给这段文字留一句批注')?.trim()
    if (!note) return
    editor.chain().focus().setTextSelection({ from, to }).setAuthorAnnotation({ id: crypto.randomUUID(), note: note.slice(0, 500), createdAt: new Date().toISOString() }).run()
    setTool('annotations')
  }

  const editAnnotation = (item: AnnotationItem) => {
    const note = window.prompt('修改批注', item.note)?.trim()
    if (!note) return
    editor.chain().focus().setTextSelection({ from: item.from, to: item.to }).setAuthorAnnotation({ id: item.id, note: note.slice(0, 500), createdAt: item.createdAt }).run()
  }

  return <section className="context-section writing-tools">
    <p className="context-label">创作工具</p>
    <div className="writing-tool-buttons">
      <button className={tool === 'annotations' ? 'active' : ''} onClick={() => setTool(tool === 'annotations' ? null : 'annotations')}><MessageSquareText size={14} />批注{annotations.length ? <small>{annotations.length}</small> : null}</button>
      <button className={tool === 'reference' ? 'active' : ''} onClick={() => setTool(tool === 'reference' ? null : 'reference')}><BookOpenText size={14} />参考</button>
      <button onClick={onOpenSearch}><Search size={14} />全书查找</button>
    </div>
    {tool === 'annotations' && <div className="annotation-panel">
      <button className="annotation-add" disabled={editor.state.selection.empty} onClick={addAnnotation}>给选中文字添加批注</button>
      {annotations.map((item) => <article key={item.id}><button onClick={() => editor.chain().focus().setTextSelection({ from: item.from, to: item.to }).scrollIntoView().run()}><strong>“{item.excerpt.slice(0, 36)}”</strong><span>{item.note}</span></button><div><button title="修改批注" onClick={() => editAnnotation(item)}>修改</button><button title="删除批注" onClick={() => editor.chain().focus().setTextSelection({ from: item.from, to: item.to }).unsetAuthorAnnotation().run()}><Trash2 size={12} /></button></div></article>)}
      {!annotations.length && <p>选中正文，再留下只给自己看的旁注。</p>}
    </div>}
    {tool === 'reference' && <div className="writing-reference">
      <div><select aria-label="选择参考章节" value={reference.id} onChange={(event) => setReferenceId(event.target.value)}>{chapters.map((item) => <option value={item.id} key={item.id}>{item.title}</option>)}</select><button aria-label="关闭参考" onClick={() => setTool(null)}><X size={13} /></button></div>
      <h3>{reference.title}</h3><pre>{reference.plainText || '这一章还是空白。'}</pre>
    </div>}
    <small className="writing-tools-work">当前作品 · {work.title}</small>
  </section>
}
