import { Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Highlight from '@tiptap/extension-highlight'
import TaskItem from '@tiptap/extension-task-item'
import TaskList from '@tiptap/extension-task-list'
import TextAlign from '@tiptap/extension-text-align'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EditorToolbar } from './EditorToolbar'
import { EntityReferenceMark } from './EntityReferenceMark'
import { LineHeight } from './LineHeight'

const toolbarExtensions = [StarterKit, Highlight, TextAlign.configure({ types: ['heading', 'paragraph'] }), LineHeight, TaskList, TaskItem.configure({ nested: true }), EntityReferenceMark]

let editor: Editor | null = null

afterEach(() => {
  editor?.destroy()
  editor = null
})

function setup() {
  editor = new Editor({
    extensions: toolbarExtensions,
    content: '<p>一二三四</p>',
  })
  render(<EditorToolbar editor={editor} />)
  act(() => { editor!.commands.setTextSelection({ from: 2, to: 4 }) })
  return editor
}

describe('EditorToolbar', () => {
  it('applies bold only to the selected text', () => {
    const currentEditor = setup()
    fireEvent.pointerDown(screen.getByRole('button', { name: '粗体' }))
    expect(currentEditor.getHTML()).toBe('<p>一<strong>二三</strong>四</p>')
  })

  it('applies italic only to the selected text', () => {
    const currentEditor = setup()
    fireEvent.pointerDown(screen.getByRole('button', { name: '斜体' }))
    expect(currentEditor.getHTML()).toBe('<p>一<em>二三</em>四</p>')
  })

  it('offers image insertion beside quote and divider tools', () => {
    const onInsertImage = vi.fn()
    editor = new Editor({ extensions: [StarterKit], content: '<p>正文</p>' })
    render(<EditorToolbar editor={editor} onInsertImage={onInsertImage} />)
    const imageButton = screen.getByRole('button', { name: '插入图片' })
    expect(imageButton.previousElementSibling).toHaveAccessibleName('分割线')
    fireEvent.pointerDown(imageButton)
    expect(onInsertImage).toHaveBeenCalledOnce()
  })

  it('offers entity tagging only when text is selected', async () => {
    const onTagSelection = vi.fn()
    editor = new Editor({ extensions: [StarterKit, EntityReferenceMark], content: '<p>正文人物</p>' })
    render(<EditorToolbar editor={editor} onTagSelection={onTagSelection} />)
    const tagButton = screen.getByRole('button', { name: '标记为资料' })
    expect(tagButton).toBeDisabled()
    act(() => { editor!.commands.setTextSelection({ from: 3, to: 5 }) })
    await waitFor(() => expect(tagButton).not.toBeDisabled())
    fireEvent.pointerDown(tagButton)
    expect(onTagSelection).toHaveBeenCalledOnce()
  })

  it('adds paragraph, third-level heading and clear-format tools without code tools', () => {
    const currentEditor = setup()
    fireEvent.pointerDown(screen.getByRole('button', { name: '三级标题' }))
    expect(currentEditor.getHTML()).toBe('<h3>一二三四</h3><p></p>')
    fireEvent.pointerDown(screen.getByRole('button', { name: '正文' }))
    fireEvent.pointerDown(screen.getByRole('button', { name: '粗体' }))
    expect(currentEditor.getHTML()).toBe('<p>一<strong>二三</strong>四</p><p></p>')
    fireEvent.pointerDown(screen.getByRole('button', { name: '清除格式' }))
    expect(currentEditor.getHTML()).toBe('<p>一二三四</p><p></p>')
    expect(screen.queryByRole('button', { name: '行内代码' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '代码块' })).not.toBeInTheDocument()
  })

  it('supports highlight, alignment and task lists for writing', async () => {
    const currentEditor = setup()
    fireEvent.pointerDown(screen.getByRole('button', { name: '高亮' }))
    expect(currentEditor.getHTML()).toContain('<mark>二三</mark>')
    fireEvent.pointerDown(screen.getByRole('button', { name: '居中对齐' }))
    expect(currentEditor.getHTML()).toContain('text-align: center')
    fireEvent.pointerDown(screen.getByRole('button', { name: '待办列表' }))
    await waitFor(() => expect(currentEditor.getHTML()).toContain('data-type="taskList"'))
    expect(currentEditor.getHTML()).toContain('data-checked="false"')
  })

  it('stores paragraph line spacing and can return to the default', () => {
    const currentEditor = setup()
    fireEvent.change(screen.getByRole('combobox', { name: '行间距' }), { target: { value: '1.75' } })
    expect(currentEditor.getHTML()).toContain('line-height: 1.75')
    fireEvent.change(screen.getByRole('combobox', { name: '行间距' }), { target: { value: 'default' } })
    expect(currentEditor.getHTML()).not.toContain('line-height')
  })

  it('finds and replaces text from an inline panel', async () => {
    const currentEditor = setup()
    fireEvent.pointerDown(screen.getByRole('button', { name: '查找与替换' }))
    fireEvent.change(screen.getByRole('textbox', { name: '查找文字' }), { target: { value: '二三' } })
    await waitFor(() => expect(screen.getByText('1 / 1')).toBeInTheDocument())
    fireEvent.change(screen.getByRole('textbox', { name: '替换文字' }), { target: { value: '春天' } })
    fireEvent.click(screen.getByRole('button', { name: '替换' }))
    expect(currentEditor.getText()).toBe('一春天四')
  })

  it('edits links inline and normalizes a domain to HTTPS', async () => {
    const currentEditor = setup()
    fireEvent.pointerDown(screen.getByRole('button', { name: '添加链接' }))
    fireEvent.change(screen.getByRole('textbox', { name: '链接地址' }), { target: { value: 'example.com/story' } })
    fireEvent.click(screen.getByRole('button', { name: '应用' }))
    expect(currentEditor.getHTML()).toBe('<p>一<a target="_blank" rel="noopener noreferrer nofollow" href="https://example.com/story">二三</a>四</p>')
    act(() => { currentEditor.commands.setTextSelection(3) })
    await waitFor(() => expect(screen.getByRole('button', { name: '编辑链接' })).toBeInTheDocument())
    fireEvent.pointerDown(screen.getByRole('button', { name: '编辑链接' }))
    fireEvent.click(screen.getByRole('button', { name: '移除链接' }))
    expect(currentEditor.getHTML()).toBe('<p>一二三四</p>')
  })

  it('only enables list indentation when the current list item can move', async () => {
    const currentEditor = setup()
    expect(screen.getByRole('button', { name: '增加缩进' })).toBeDisabled()
    act(() => { currentEditor.commands.setContent('<ul><li><p>一</p></li><li><p>二</p></li></ul>'); currentEditor.commands.setTextSelection(8) })
    await waitFor(() => expect(screen.getByRole('button', { name: '增加缩进' })).not.toBeDisabled())
    fireEvent.pointerDown(screen.getByRole('button', { name: '增加缩进' }))
    expect(currentEditor.getHTML()).toContain('<ul><li><p>二</p></li></ul>')
  })
})
