import { Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { afterEach, describe, expect, it } from 'vitest'
import { findTextMatches, replaceAllText } from './editorSearch'

let editor: Editor | null = null

afterEach(() => { editor?.destroy(); editor = null })

describe('editor search and replace', () => {
  it('finds text without case sensitivity and keeps document positions', () => {
    editor = new Editor({ extensions: [StarterKit], content: '<p>Rain 雨 rain</p>' })
    expect(findTextMatches(editor.state.doc, 'RAIN')).toEqual([{ from: 1, to: 5 }, { from: 8, to: 12 }])
  })

  it('finds a phrase even when formatting splits it into multiple text nodes', () => {
    editor = new Editor({ extensions: [StarterKit], content: '<p>春<strong>日</strong>来信</p>' })
    expect(findTextMatches(editor.state.doc, '春日')).toEqual([{ from: 1, to: 3 }])
  })

  it('replaces every match from the end without shifting later positions', () => {
    editor = new Editor({ extensions: [StarterKit], content: '<p>旧词，旧词。</p>' })
    expect(replaceAllText(editor, '旧词', '新名字')).toBe(2)
    expect(editor.getText()).toBe('新名字，新名字。')
  })
})
