import { Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createSeedLibrary } from '../../domain/seed'
import { useLibraryStore } from '../../state/useLibraryStore'
import { EntityReferenceMark } from './EntityReferenceMark'
import { EntityTagMenu } from './EntityTagMenu'

let editor: Editor

describe('EntityTagMenu', () => {
  beforeEach(() => {
    localStorage.clear()
    useLibraryStore.setState({ data: createSeedLibrary(), ready: true, saveStatus: 'idle', recoveryDrafts: {} })
    editor = new Editor({ extensions: [StarterKit, EntityReferenceMark], content: '<p>外婆在旧院子</p>' })
  })
  afterEach(() => editor.destroy())

  it('creates a person, reverse link and durable inline mark from selected text', () => {
    render(<EntityTagMenu chapterId="chapter-welcome" editor={editor} selection={{ from: 1, to: 3, text: '外婆' }} onClose={() => undefined} />)
    fireEvent.click(screen.getByRole('button', { name: /新建人物“外婆”并标记/ }))

    const data = useLibraryStore.getState().data
    const created = data.people.find((person) => person.name === '外婆' && person.id !== 'person-1')
    expect(created).toBeDefined()
    expect(data.entityLinks.some((link) => link.targetId === created?.id && link.anchor?.excerpt === '外婆')).toBe(true)
    expect(editor.getJSON().content?.[0].content?.[0].marks?.[0]).toMatchObject({ type: 'entityReference', attrs: { entityType: 'person', entityId: created?.id, label: '外婆' } })
  })
})
