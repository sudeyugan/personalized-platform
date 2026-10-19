import { useRef, useState } from 'react'
import { EditorContent, useEditor, useEditorState } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Highlight from '@tiptap/extension-highlight'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import TextAlign from '@tiptap/extension-text-align'
import type { Chapter } from '../../../desktop/src/domain/models'
import { EntityReferenceMark } from '../../../desktop/src/modules/writing/EntityReferenceMark'
import { AuthorAnnotationMark } from '../../../desktop/src/modules/writing/AuthorAnnotationMark'
import { LineHeight } from '../../../desktop/src/modules/writing/LineHeight'
import { countChineseWords } from '../../../desktop/src/domain/wordCount'
import { Sheet } from '../components/Sheet'
import { modify } from '../repository'
import { MobileImageAsset, supportedDocument } from './document'
export function ChapterEditor({ chapter, close }: { chapter: Chapter; close(): void }) {
  const [title, setTitle] = useState(chapter.title),
    [dirty, setDirty] = useState(false)
  const editable = supportedDocument(chapter.content)
  const document = useRef(chapter.content),
    plainText = useRef(chapter.plainText)
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: { openOnClick: false, defaultProtocol: 'https' } }),
      Highlight,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      LineHeight,
      TaskList,
      TaskItem.configure({ nested: true }),
      MobileImageAsset,
      EntityReferenceMark,
      AuthorAnnotationMark,
    ],
    content: editable ? chapter.content : { type: 'doc', content: [{ type: 'paragraph' }] },
    immediatelyRender: false,
    editable,
    editorProps: {
      attributes: { class: 'mobile-prose', spellcheck: 'true' },
      handlePaste: (_, event) => {
        if (event.clipboardData?.files.length) {
          event.preventDefault()
          return true
        }
        return false
      },
    },
    onUpdate: ({ editor }) => {
      document.current = editor.getJSON()
      plainText.current = editor.getText()
      setDirty(true)
    },
  })
  const state = useEditorState({
    editor,
    selector: ({ editor }) => ({
      bold: editor?.isActive('bold'),
      italic: editor?.isActive('italic'),
      heading: editor?.isActive('heading'),
      bullet: editor?.isActive('bulletList'),
      wordCount: editor ? countChineseWords(editor.getText()) : chapter.wordCount,
    }),
  })
  return (
    <Sheet
      title="在纸上，接着写"
      close={close}
      dirty={dirty || title !== chapter.title}
      save={async () => {
        if (!editable) throw new Error('本章含手机尚未支持的格式，只能阅读，原文未改变。')
        await modify(`chapters/${chapter.id}`, (current) => {
          if (Number(current.revision) !== chapter.revision)
            throw new Error('本章出现了另一份修改，手机稿没有覆盖它。')
          return {
            ...current,
            title,
            content: document.current,
            plainText: plainText.current,
            wordCount: countChineseWords(plainText.current),
            revision: chapter.revision + 1,
            updatedAt: new Date().toISOString(),
          }
        })
      }}
    >
      <input
        className="chapter-title"
        aria-label="章节标题"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        maxLength={160}
        readOnly={!editable}
      />
      {editable ? (
        <>
          <div className="rich-toolbar" aria-label="写作工具">
            {[
              { label: '粗体', active: state?.bold, run: () => editor?.chain().focus().toggleBold().run() },
              {
                label: '斜体',
                active: state?.italic,
                run: () => editor?.chain().focus().toggleItalic().run(),
              },
              {
                label: '标题',
                active: state?.heading,
                run: () => editor?.chain().focus().toggleHeading({ level: 2 }).run(),
              },
              { label: '高亮', run: () => editor?.chain().focus().toggleHighlight().run() },
              {
                label: '列表',
                active: state?.bullet,
                run: () => editor?.chain().focus().toggleBulletList().run(),
              },
              { label: '待办', run: () => editor?.chain().focus().toggleTaskList().run() },
              { label: '引用', run: () => editor?.chain().focus().toggleBlockquote().run() },
              { label: '撤销', run: () => editor?.chain().focus().undo().run() },
              { label: '重做', run: () => editor?.chain().focus().redo().run() },
            ].map((tool) => (
              <button
                key={tool.label}
                aria-pressed={tool.active ?? false}
                onMouseDown={(event) => event.preventDefault()}
                onClick={tool.run}
              >
                {tool.label}
              </button>
            ))}
          </div>
          <EditorContent editor={editor} />
          <p className="footnote">
            {state?.wordCount ?? chapter.wordCount} 字 · 保存后同步，原有批注、资料标记和图片引用保留。
          </p>
        </>
      ) : (
        <>
          <p className="notice">本章含未适配的格式，暂为只读，避免保存时丢失原文。</p>
          <p className="diary-paper">{chapter.plainText}</p>
        </>
      )}
    </Sheet>
  )
}
