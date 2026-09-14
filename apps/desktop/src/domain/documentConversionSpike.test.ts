import { describe, expect, it } from 'vitest'
import { Document, HeadingLevel, ImageRun, Packer, Paragraph, TextRun } from 'docx'
import mammoth from 'mammoth'
import { PDFDocument } from 'pdf-lib'

const pixel = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='), (character) => character.charCodeAt(0))

describe('document conversion spike fixtures', () => {
  it('round-trips representative DOCX content through an importer', async () => {
    const document = new Document({ sections: [{ children: [
      new Paragraph({ text: '故乡的夏天', heading: HeadingLevel.HEADING_1 }),
      new Paragraph({ text: '第一项', bullet: { level: 0 } }),
      new Paragraph({ children: [new TextRun('风从旧院子吹来。')], style: 'Intense Quote' }),
      new Paragraph({ children: [new ImageRun({ data: pixel, transformation: { width: 1, height: 1 }, type: 'png' })] }),
      new Paragraph({ text: '新的一页', pageBreakBefore: true }),
    ] }] })
    const buffer = await Packer.toBuffer(document)
    const imported = await mammoth.convertToHtml({ buffer })
    expect(imported.value).toContain('故乡的夏天')
    expect(imported.value).toContain('<ul>')
    expect(imported.value).toContain('风从旧院子吹来。')
    expect(buffer.byteLength).toBeGreaterThan(1_000)
  })

  it('reopens PDF metadata and preserves Markdown source', async () => {
    const pdf = await PDFDocument.create()
    pdf.setTitle('一隅导出样例')
    pdf.addPage().drawText('Yiyu printable export fixture')
    const reopened = await PDFDocument.load(await pdf.save())
    expect(reopened.getTitle()).toBe('一隅导出样例')
    const markdown = '# 故乡的夏天\n\n- 第一项\n\n> 风从旧院子吹来。\n'
    expect(markdown).toContain('> 风从旧院子吹来。')
  })
})
