import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { AgentToolResult } from '../companion/agent/types'
import { CompanionRichText } from '../companion/CompanionRichText'
import { toSpokenText } from '../companion/speechText'
import { followedLiveReply } from './followedReply'

afterEach(cleanup)

const room = (name = '虚构主播', roomId = 123, liveStatus = 1, title = '') => ({ name, roomId, liveStatus, title })
function result(rooms = [room()], complete = false, timestamp: number | undefined = Date.parse('2026-10-12T06:35:58Z')): AgentToolResult {
  return { success: true, data: { verified: true, fetchedAtEpochMs: timestamp, data: { rooms, complete, checked: rooms.length } } }
}

describe('compact followed-live reply', () => {
  it('shows one labelled official link per live streamer and a secondary minute-level footer', () => {
    const reply = followedLiveReply(result([room(), room('虚构主播二', 456), room('未开播', 789, 0)]))
    const { container } = render(<CompanionRichText text={reply} />)
    expect(screen.getByText('2 位')).toBeInTheDocument()
    const links = screen.getAllByRole('link', { name: '进入直播间' })
    expect(links.map(link => link.getAttribute('href'))).toEqual(['https://live.bilibili.com/123', 'https://live.bilibili.com/456'])
    expect(container.querySelectorAll('.companion-list-line')).toHaveLength(2)
    expect(container.querySelector('blockquote')).toHaveTextContent('14:35 查询 · 仅为部分结果，其他关注主播状态未知。')
    expect(container.textContent).not.toContain('https://')
    expect(container.textContent).not.toContain('未开播')
    expect(toSpokenText(reply)).not.toContain('https://')
  })

  it('does not treat incomplete empty results as all followed streamers offline', () => {
    const reply = followedLiveReply(result([]))
    expect(reply).toContain('部分关注')
    expect(reply).toContain('状态未知')
    expect(reply).not.toContain('都未开播')
  })

  it('groups each available title below its own streamer and omits empty titles', () => {
    const { container } = render(<CompanionRichText text={followedLiveReply(result([room('虚构一', 1, 1, '虚构标题'),room('虚构二', 2)]))} />)
    const rows = container.querySelectorAll('.companion-list-line')
    expect(rows[0].querySelector('.companion-list-detail')).toHaveTextContent('虚构标题')
    expect(rows[1].querySelector('.companion-list-detail')).toBeNull()
    expect(rows[0]).toHaveTextContent('虚构一')
    expect(rows[1]).not.toHaveTextContent('虚构标题')
    expect(screen.getAllByRole('link')).toHaveLength(2)
  })

  it('renders title links, formatting and newlines as text, not new blocks or links', () => {
    const title = '[伪链接](https://example.invalid) **标题** `内容`\n- 不是真正条目'
    const { container } = render(<CompanionRichText text={followedLiveReply(result([room('虚构', 1, 1, title)]))} />)
    expect(container.querySelector('.companion-list-detail')).toHaveTextContent(title.replace(/\n/g,' '))
    expect(screen.getAllByRole('link')).toHaveLength(1)
    expect(container.querySelectorAll('.companion-list-line')).toHaveLength(1)
    expect(container.querySelector('.companion-list-detail strong')).toBeNull()
    expect(container.querySelector('.companion-list-detail code')).toBeNull()
  })

  it('keeps verified complete empty results distinct from partial results', () => {
    const reply = followedLiveReply(result([], true))
    expect(reply).toContain('都未开播')
    expect(reply).not.toContain('状态未知')
    expect(reply).toContain('14:35 查询')
  })

  it('limits the displayed list without misreporting the number returned', () => {
    const reply = followedLiveReply(result(Array.from({ length: 21 }, (_, index) => room(`虚构${index}`, index + 1)), true))
    render(<CompanionRichText text={reply} />)
    expect(screen.getByText('21 位')).toBeInTheDocument()
    expect(screen.getAllByRole('link')).toHaveLength(20)
    expect(reply).toContain('这里只列出前 20 位。')
    expect(reply).not.toContain('状态未知')
  })

  it('renders nickname Markdown literally and cannot add links or blocks', () => {
    const name = '[冒充链接](https://example.invalid) **加粗** `代码` \\尾部\n> 新行'
    const { container } = render(<CompanionRichText text={followedLiveReply(result([room(name)]))} />)
    expect(screen.getAllByRole('link')).toHaveLength(1)
    expect(screen.getByRole('link')).toHaveAttribute('href', 'https://live.bilibili.com/123')
    expect(container.querySelector('.companion-list-line')).toHaveTextContent(name.replace(/\n/g, ' '))
    expect(container.querySelector('.companion-list-line strong')).toBeNull()
    expect(container.querySelector('.companion-list-line code')).toBeNull()
    expect(container.querySelectorAll('blockquote')).toHaveLength(1)
  })

  it('does not invent a clock time when no timestamp was verified', () => {
    const data = result()
    delete (data.data as { fetchedAtEpochMs?: number }).fetchedAtEpochMs
    expect(followedLiveReply(data)).toContain('> 本次查询')
    expect(followedLiveReply(data)).not.toMatch(/\d{2}:\d{2}/)
  })

  it('keeps failure and unverifiable result explanations', () => {
    expect(followedLiveReply({ ...result(), success: false, error: { code: 'Timeout', message: '读取超时' } })).toContain('不能据此判断')
    expect(followedLiveReply({ ...result(), data: { verified: false } })).toContain('无法核验')
    expect(followedLiveReply({ success:true })).toContain('无法核验')
  })
})
