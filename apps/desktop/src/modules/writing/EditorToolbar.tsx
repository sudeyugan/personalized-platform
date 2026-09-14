import { useEditorState, type Editor } from '@tiptap/react'
import { useState, type FormEvent, type ReactNode } from 'react'
import { AlignCenter, AlignJustify, AlignLeft, AlignRight, Bold, ChevronDown, ChevronUp, Eraser, Heading1, Heading2, Heading3, Highlighter, ImagePlus, IndentDecrease, IndentIncrease, Italic, Link2, List, ListOrdered, ListTodo, Minus, Pilcrow, Quote, Redo2, RemoveFormatting, ReplaceAll, Search, Strikethrough, Tag, UnderlineIcon, Undo2, Unlink, X } from 'lucide-react'
import { findTextMatches, replaceAllText } from './editorSearch'

interface Props { editor: Editor; onInsertImage?: () => void; onTagSelection?: () => void; onClearEntityTag?: () => void }

export function EditorToolbar({ editor, onInsertImage, onTagSelection, onClearEntityTag }: Props) {
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkHref, setLinkHref] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [replacement, setReplacement] = useState('')
  const [moreToolsOpen, setMoreToolsOpen] = useState(false)
  const state = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => ({
      heading1: currentEditor.isActive('heading', { level: 1 }),
      heading2: currentEditor.isActive('heading', { level: 2 }),
      heading3: currentEditor.isActive('heading', { level: 3 }),
      bold: currentEditor.isActive('bold'),
      italic: currentEditor.isActive('italic'),
      underline: currentEditor.isActive('underline'),
      strike: currentEditor.isActive('strike'),
      highlight: currentEditor.isActive('highlight'),
      link: currentEditor.isActive('link'),
      bulletList: currentEditor.isActive('bulletList'),
      orderedList: currentEditor.isActive('orderedList'),
      taskList: currentEditor.isActive('taskList'),
      blockquote: currentEditor.isActive('blockquote'),
      textAlign: currentEditor.getAttributes('paragraph').textAlign ?? currentEditor.getAttributes('heading').textAlign ?? 'left',
      lineHeight: currentEditor.getAttributes(currentEditor.isActive('heading') ? 'heading' : 'paragraph').lineHeight ?? 'default',
      selectionEmpty: currentEditor.state.selection.empty,
      entityReference: currentEditor.isActive('entityReference'),
      canIndent: currentEditor.can().sinkListItem(currentEditor.isActive('taskList') ? 'taskItem' : 'listItem'),
      canOutdent: currentEditor.can().liftListItem(currentEditor.isActive('taskList') ? 'taskItem' : 'listItem'),
      documentText: currentEditor.getText(),
    }),
  })
  const matches = findTextMatches(editor.state.doc, searchQuery)
  const currentMatchIndex = matches.findIndex((match) => match.from === editor.state.selection.from && match.to === editor.state.selection.to)

  const item = (label: string, icon: ReactNode, active: boolean, action: () => void, disabled = false, shortcut?: string) => (
    <button className={active ? 'editor-tool active' : 'editor-tool'} aria-label={label} title={shortcut ? `${label} · ${shortcut}` : label} disabled={disabled} onPointerDown={(event) => { event.preventDefault(); action() }} type="button">{icon}</button>
  )

  const openLinkEditor = () => {
    setSearchOpen(false)
    setLinkHref(String(editor.getAttributes('link').href ?? ''))
    setLinkOpen(true)
  }

  const applyLink = (event: FormEvent) => {
    event.preventDefault()
    const rawHref = linkHref.trim()
    if (!rawHref) editor.chain().focus().extendMarkRange('link').unsetLink().run()
    else {
      const href = /^(https?:\/\/|mailto:)/i.test(rawHref) ? rawHref : `https://${rawHref}`
      editor.chain().focus().extendMarkRange('link').setLink({ href }).run()
    }
    setLinkOpen(false)
  }

  const selectMatch = (direction: 1 | -1) => {
    if (!matches.length) return
    const index = direction === 1
      ? (currentMatchIndex + 1 + matches.length) % matches.length
      : (currentMatchIndex < 0 ? matches.length - 1 : currentMatchIndex - 1 + matches.length) % matches.length
    editor.chain().focus().setTextSelection(matches[index]).scrollIntoView().run()
  }

  const replaceCurrent = () => {
    const match = currentMatchIndex >= 0 ? matches[currentMatchIndex] : matches[0]
    if (!match) return
    editor.chain().focus().setTextSelection(match).insertContent(replacement).run()
  }

  const toggleSearch = () => {
    setLinkOpen(false)
    if (!searchOpen && !editor.state.selection.empty) setSearchQuery(editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to, ' '))
    setSearchOpen(!searchOpen)
  }

  return (
    <div className="editor-toolbar-shell">
      <div className="editor-toolbar" role="toolbar" aria-label="文字格式">
        <span className="editor-tool-group" role="group" aria-label="历史操作">
          {item('撤销', <Undo2 size={16} />, false, () => editor.chain().focus().undo().run(), false, 'Ctrl+Z')}
          {item('重做', <Redo2 size={16} />, false, () => editor.chain().focus().redo().run(), false, 'Ctrl+Shift+Z')}
        </span>
        <i />
        <span className="editor-tool-group" role="group" aria-label="段落样式">
          {item('正文', <Pilcrow size={16} />, !state.heading1 && !state.heading2 && !state.heading3 && !state.blockquote, () => editor.chain().focus().setParagraph().run())}
          {item('一级标题', <Heading1 size={16} />, state.heading1, () => editor.chain().focus().toggleHeading({ level: 1 }).run())}
          {item('二级标题', <Heading2 size={16} />, state.heading2, () => editor.chain().focus().toggleHeading({ level: 2 }).run())}
          {item('三级标题', <Heading3 size={16} />, state.heading3, () => editor.chain().focus().toggleHeading({ level: 3 }).run())}
        </span>
        <i />
        <span className="editor-tool-group" role="group" aria-label="文字样式">
          {item('粗体', <Bold size={16} />, state.bold, () => editor.chain().focus().toggleBold().run(), false, 'Ctrl+B')}
          {item('斜体', <Italic size={16} />, state.italic, () => editor.chain().focus().toggleItalic().run(), false, 'Ctrl+I')}
          {item('下划线', <UnderlineIcon size={16} />, state.underline, () => editor.chain().focus().toggleUnderline().run(), false, 'Ctrl+U')}
          {item('删除线', <Strikethrough size={16} />, state.strike, () => editor.chain().focus().toggleStrike().run())}
          {item('高亮', <Highlighter size={16} />, state.highlight, () => editor.chain().focus().toggleHighlight().run())}
          {item(state.link ? '编辑链接' : '添加链接', <Link2 size={16} />, state.link, openLinkEditor, state.selectionEmpty && !state.link)}
          {item('清除格式', <RemoveFormatting size={16} />, false, () => editor.chain().focus().unsetAllMarks().clearNodes().run())}
        </span>
        <button className={moreToolsOpen ? 'editor-toolbar-toggle active' : 'editor-toolbar-toggle'} type="button" aria-expanded={moreToolsOpen} aria-controls="editor-more-tools" onPointerDown={(event) => { event.preventDefault(); setMoreToolsOpen((open) => !open) }}>
          更多工具 <ChevronDown size={14} />
        </button>
        <span id="editor-more-tools" className={moreToolsOpen ? 'editor-toolbar-collapsible open' : 'editor-toolbar-collapsible'}>
          <i />
          <span className="editor-tool-group" role="group" aria-label="段落结构">
          {item('无序列表', <List size={16} />, state.bulletList, () => editor.chain().focus().toggleBulletList().run())}
          {item('有序列表', <ListOrdered size={16} />, state.orderedList, () => editor.chain().focus().toggleOrderedList().run())}
          {item('待办列表', <ListTodo size={16} />, state.taskList, () => editor.chain().focus().toggleTaskList().run())}
          {item('减少缩进', <IndentDecrease size={16} />, false, () => editor.chain().focus().liftListItem(state.taskList ? 'taskItem' : 'listItem').run(), !state.canOutdent)}
          {item('增加缩进', <IndentIncrease size={16} />, false, () => editor.chain().focus().sinkListItem(state.taskList ? 'taskItem' : 'listItem').run(), !state.canIndent)}
          {item('引用', <Quote size={16} />, state.blockquote, () => editor.chain().focus().toggleBlockquote().run())}
          {item('左对齐', <AlignLeft size={16} />, state.textAlign === 'left', () => editor.chain().focus().setTextAlign('left').run())}
          {item('居中对齐', <AlignCenter size={16} />, state.textAlign === 'center', () => editor.chain().focus().setTextAlign('center').run())}
          {item('右对齐', <AlignRight size={16} />, state.textAlign === 'right', () => editor.chain().focus().setTextAlign('right').run())}
          {item('两端对齐', <AlignJustify size={16} />, state.textAlign === 'justify', () => editor.chain().focus().setTextAlign('justify').run())}
          <label className="editor-line-height"><span>行距</span><select aria-label="行间距" value={state.lineHeight} onChange={(event) => { const node = editor.isActive('heading') ? 'heading' : 'paragraph'; editor.chain().focus().updateAttributes(node, { lineHeight: event.target.value === 'default' ? null : event.target.value }).run() }}><option value="default">默认</option><option value="1.25">1.25</option><option value="1.5">1.5</option><option value="1.75">1.75</option><option value="2">2.0</option></select></label>
          </span>
          <i />
          <span className="editor-tool-group" role="group" aria-label="插入与资料">
          {item('分割线', <Minus size={16} />, false, () => editor.chain().focus().setHorizontalRule().run())}
          {onInsertImage && item('插入图片', <ImagePlus size={16} />, false, onInsertImage)}
          {onTagSelection && <button className="editor-tool" aria-label="标记为资料" title="把选中文字标记为人物、地点或事件" disabled={state.selectionEmpty} onPointerDown={(event) => { event.preventDefault(); onTagSelection() }} type="button"><Tag size={16} /></button>}
          {onClearEntityTag && state.entityReference && <button className="editor-tool active" aria-label="移除资料标记" title="只移除正文标记，保留资料关联" onPointerDown={(event) => { event.preventDefault(); onClearEntityTag() }} type="button"><Eraser size={16} /></button>}
          {item('查找与替换', <Search size={16} />, searchOpen, toggleSearch)}
          </span>
        </span>
      </div>
      {linkOpen && <form className="editor-link-popover" onSubmit={applyLink}>
        <label><span>链接地址</span><input autoFocus value={linkHref} onChange={(event) => setLinkHref(event.target.value)} onKeyDown={(event) => { if (event.key === 'Escape') setLinkOpen(false) }} placeholder="https://example.com" aria-label="链接地址" /></label>
        <button className="editor-link-apply" type="submit">应用</button>
        {state.link && <button aria-label="移除链接" title="移除链接" type="button" onClick={() => { editor.chain().focus().extendMarkRange('link').unsetLink().run(); setLinkOpen(false) }}><Unlink size={15} /></button>}
        <button aria-label="关闭链接编辑" title="关闭" type="button" onClick={() => setLinkOpen(false)}><X size={15} /></button>
      </form>}
      {searchOpen && <div className="editor-search-panel" role="search" onKeyDown={(event) => { if (event.key === 'Escape') setSearchOpen(false) }}>
        <label><span>查找</span><input autoFocus value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} aria-label="查找文字" /></label>
        <span className="editor-search-count">{matches.length ? `${Math.max(currentMatchIndex + 1, 1)} / ${matches.length}` : '0 / 0'}</span>
        <button aria-label="上一个匹配" title="上一个" onClick={() => selectMatch(-1)} disabled={!matches.length}><ChevronUp size={15} /></button>
        <button aria-label="下一个匹配" title="下一个" onClick={() => selectMatch(1)} disabled={!matches.length}><ChevronDown size={15} /></button>
        <label><span>替换为</span><input value={replacement} onChange={(event) => setReplacement(event.target.value)} aria-label="替换文字" /></label>
        <button className="editor-search-action" onClick={replaceCurrent} disabled={!matches.length}>替换</button>
        <button className="editor-search-action" onClick={() => replaceAllText(editor, searchQuery, replacement)} disabled={!matches.length}><ReplaceAll size={14} />全部替换</button>
        <button aria-label="关闭查找替换" title="关闭" onClick={() => setSearchOpen(false)}><X size={15} /></button>
      </div>}
    </div>
  )
}
