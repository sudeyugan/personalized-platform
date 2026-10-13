import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { CompanionRichText } from './CompanionRichText'

afterEach(cleanup)
describe('companion rich text list details', () => {
  it('groups a two-space subtitle with its list item, not with the next paragraph', () => {
    const { container } = render(<CompanionRichText text={'- 主行\n  次行\n普通段落\n- 第二项'} />)
    expect(container.querySelector('.companion-list-detail')).toHaveTextContent('次行')
    expect(container.querySelectorAll('.companion-list-line')).toHaveLength(2)
    expect(screen.getByText('普通段落').tagName).toBe('P')
  })
  it('keeps an indented fenced code block separate from the preceding list item', () => {
    const { container } = render(<CompanionRichText text={'- 主行\n  ```\nconst value = 1\n  ```\n尾声'} />)
    expect(container.querySelector('.companion-list-detail')).toBeNull()
    expect(container.querySelector('pre code')).toHaveTextContent('const value = 1')
    expect(screen.getByText('尾声').tagName).toBe('P')
  })
  it('preserves existing heading, bold, inline code, quote and numbered-list rendering', () => {
    const { container } = render(<CompanionRichText text={'## 标题\n**重点**与`代码`\n> 注释\n1. 第一项'} />)
    expect(container.querySelector('h4')).toHaveTextContent('标题')
    expect(container.querySelector('strong')).toHaveTextContent('重点')
    expect(container.querySelector('code')).toHaveTextContent('代码')
    expect(container.querySelector('blockquote')).toHaveTextContent('注释')
    expect(container.querySelector('.companion-list-line i')).toHaveTextContent('1.')
  })
  it('keeps safe links but does not turn non-HTTP schemes into anchors', () => {
    render(<CompanionRichText text={'- [正常](https://example.invalid)\n  [无效](javascript:alert)'} />)
    expect(screen.getAllByRole('link')).toHaveLength(1)
    expect(screen.getByRole('link')).toHaveAttribute('href', 'https://example.invalid')
    expect(screen.getByText('无效')).toBeInTheDocument()
  })
})
