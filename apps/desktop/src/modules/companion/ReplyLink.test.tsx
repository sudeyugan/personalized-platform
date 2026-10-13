import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CompanionRichText } from './CompanionRichText'
const invoke = vi.hoisted(() => vi.fn(async () => undefined))
vi.mock('@tauri-apps/api/core', () => ({ invoke }))
afterEach(() => { cleanup(); vi.unstubAllGlobals(); invoke.mockReset() })
describe('human-initiated reply links in either chat surface', () => {
  it('does not open automatically and dispatches a desktop click to the narrow native opener', async () => {
    vi.stubGlobal('__TAURI_INTERNALS__', {})
    render(<CompanionRichText text={'[查看原页](https://example.com/inbox)'} />)
    expect(invoke).not.toHaveBeenCalled()
    expect(fireEvent.click(screen.getByRole('link'))).toBe(false)
    await waitFor(() => expect(invoke).toHaveBeenCalledExactlyOnceWith('open_reply_link', { url: 'https://example.com/inbox' }))
  })
  it('deduplicates pending clicks and supports middle clicks, not right clicks', async () => {
    vi.stubGlobal('__TAURI_INTERNALS__', {})
    let resolve!: () => void
    invoke.mockImplementationOnce(() => new Promise<undefined>(done => { resolve = () => done(undefined) }))
    render(<CompanionRichText text={'[查看](https://example.com)'} />)
    const link=screen.getByRole('link')
    fireEvent(link, new MouseEvent('auxclick', { bubbles:true, cancelable:true, button:2 }))
    expect(invoke).not.toHaveBeenCalled()
    fireEvent(link, new MouseEvent('auxclick', { bubbles:true, cancelable:true, button:1 }))
    fireEvent.click(link);expect(invoke).toHaveBeenCalledOnce();resolve()
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
  })
  it('shows a fixed error instead of silently swallowing failures or exposing native data', async () => {
    vi.stubGlobal('__TAURI_INTERNALS__', {})
    invoke.mockRejectedValueOnce(new Error('fictional-private-native-detail'))
    render(<CompanionRichText text={'[查看](https://example.com)'} />)
    fireEvent.click(screen.getByRole('link'))
    expect(await screen.findByRole('alert')).toHaveTextContent('未能打开链接')
    expect(document.body).not.toHaveTextContent('fictional-private-native-detail')
    fireEvent.click(screen.getByRole('link'))
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(2))
  })
  it('keeps normal browser-preview navigation and never invokes a desktop tool there', () => {
    render(<CompanionRichText text={'[查看](https://example.com)'} />)
    const link=screen.getByRole('link')
    // Cancel after the component to avoid JSDOM attempting real navigation.
    let prevented=true
    link.addEventListener('click', event => { prevented=event.defaultPrevented;event.preventDefault() })
    fireEvent.click(link);expect(prevented).toBe(false);expect(invoke).not.toHaveBeenCalled()
  })
})
