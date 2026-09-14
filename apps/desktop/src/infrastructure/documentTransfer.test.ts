import { describe, expect, it } from 'vitest'
import { parseMarkdownChapters } from './documentTransfer'

describe('open document transfer', () => {
  it('previews one imported chapter per level-one Markdown heading', () => {
    const result = parseMarkdownChapters('# 第一章\n\n正文一\n\n## 小节\n更多\n# 第二章\n\n正文二', '导入文档')
    expect(result.map((chapter) => chapter.title)).toEqual(['第一章', '第二章'])
    expect(result[0].plainText).toContain('正文一')
    expect(result[0].plainText).not.toContain('##')
  })

  it('keeps a heading-free document as one preview item', () => {
    expect(parseMarkdownChapters('一段普通文本', '随笔')[0]).toMatchObject({ title: '随笔', plainText: '一段普通文本' })
  })
})
