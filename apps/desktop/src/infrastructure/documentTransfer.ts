import { invoke } from '@tauri-apps/api/core'
import type { JSONContent } from '@tiptap/react'
import type { Asset, LibraryData, Work } from '../domain/models'
import { assetIdsInContent } from '../state/assetsSlice'
import { assetRepository } from './assetRepository'

export interface ExportFile { relativePath: string; bytes: number[] }
export interface ImportChapter { title: string; plainText: string; content: JSONContent }
export type ExportFormat = 'markdown' | 'docx' | 'pdf'
const encoder = new TextEncoder()
const isTauriRuntime = () => '__TAURI_INTERNALS__' in window
const safeName = (value: string) => value.replace(/[<>:"/\\|?*]/g, '').trim() || '未命名'
const extensionFor = (asset: Asset) => asset.mimeType === 'image/jpeg' ? 'jpg' : asset.mimeType === 'image/webp' ? 'webp' : 'png'

function inlineText(node: JSONContent): string { return node.text ?? node.content?.map(inlineText).join('') ?? '' }
function markdownNode(node: JSONContent, assets: Map<string, Asset>): string {
  if (node.type === 'heading') return `${'#'.repeat(Number(node.attrs?.level ?? 1))} ${inlineText(node)}\n\n`
  if (node.type === 'paragraph') return `${inlineText(node)}\n\n`
  if (node.type === 'blockquote') return `${inlineText(node).split('\n').map((line) => `> ${line}`).join('\n')}\n\n`
  if (node.type === 'horizontalRule') return '---\n\n'
  if (node.type === 'imageAsset') { const asset = assets.get(String(node.attrs?.assetId)); return asset ? `![${node.attrs?.alt || asset.alt || asset.fileName}](assets/${asset.id}.${extensionFor(asset)})\n*${node.attrs?.caption || asset.caption || ''}*\n\n` : '' }
  return node.content?.map((child) => markdownNode(child, assets)).join('') ?? ''
}

async function markdownFiles(work: Work, data: LibraryData): Promise<ExportFile[]> {
  const assets = new Map(data.assets.map((asset) => [asset.id, asset]))
  const chapters = work.chapterIds.map((id) => data.chapters[id]).filter((chapter) => chapter && !chapter.deletedAt)
  const files: ExportFile[] = [{ relativePath: 'README.md', bytes: [...encoder.encode(`# ${work.title}\n\n${work.description}\n\n${chapters.map((chapter, index) => `${index + 1}. [${chapter.title}](chapters/${String(index + 1).padStart(3, '0')}-${safeName(chapter.title)}.md)`).join('\n')}\n`)] }]
  const used = new Set<string>()
  chapters.forEach((chapter, index) => { assetIdsInContent(chapter.content).forEach((id) => used.add(id)); files.push({ relativePath: `chapters/${String(index + 1).padStart(3, '0')}-${safeName(chapter.title)}.md`, bytes: [...encoder.encode(`# ${chapter.title}\n\n${chapter.content.content?.map((node) => markdownNode(node, assets)).join('') ?? chapter.plainText}`)] }) })
  for (const id of used) { const asset = assets.get(id); if (asset) files.push({ relativePath: `assets/${asset.id}.${extensionFor(asset)}`, bytes: [...await assetRepository.readBytes(asset)] }) }
  return files
}

async function docxFile(work: Work, data: LibraryData): Promise<ExportFile> {
  const { Document, HeadingLevel, ImageRun, Packer, Paragraph } = await import('docx')
  const children: InstanceType<typeof Paragraph>[] = [new Paragraph({ text: work.title, heading: HeadingLevel.TITLE })]
  for (const chapterId of work.chapterIds) { const chapter = data.chapters[chapterId]; if (!chapter || chapter.deletedAt) continue; children.push(new Paragraph({ text: chapter.title, heading: HeadingLevel.HEADING_1 })); for (const node of chapter.content.content ?? []) { if (node.type === 'imageAsset') { const asset = data.assets.find((item) => item.id === node.attrs?.assetId); if (asset) { const bytes = await assetRepository.readBytes(asset); children.push(new Paragraph({ children: [new ImageRun({ data: bytes, transformation: { width: Math.min(720, asset.width), height: Math.round(Math.min(720, asset.width) / asset.width * asset.height) }, type: asset.mimeType === 'image/jpeg' ? 'jpg' : 'png' } as ConstructorParameters<typeof ImageRun>[0])] })); if (node.attrs?.caption) children.push(new Paragraph({ text: String(node.attrs.caption) })); } } else { const text = inlineText(node); if (text) children.push(new Paragraph({ text, heading: node.type === 'heading' ? HeadingLevel.HEADING_2 : undefined })) } } }
  const blob = await Packer.toBlob(new Document({ sections: [{ children }] }))
  return { relativePath: `${safeName(work.title)}.docx`, bytes: [...new Uint8Array(await blob.arrayBuffer())] }
}

async function pdfFile(work: Work, data: LibraryData): Promise<ExportFile> {
  const { PDFDocument } = await import('pdf-lib'); const pdf = await PDFDocument.create(); const lines: string[] = [work.title, '']
  work.chapterIds.forEach((id) => { const chapter = data.chapters[id]; if (chapter && !chapter.deletedAt) lines.push(chapter.title, '', ...chapter.plainText.split('\n'), '') })
  const wrapped = lines.flatMap((line) => line ? [...line.matchAll(/.{1,34}/gu)].map((match) => match[0]) : [''])
  for (let offset = 0; offset < wrapped.length; offset += 38) { const canvas = document.createElement('canvas'); canvas.width = 1240; canvas.height = 1754; const context = canvas.getContext('2d')!; context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height); context.fillStyle = '#29231f'; context.font = '32px "Microsoft YaHei", serif'; wrapped.slice(offset, offset + 38).forEach((line, index) => context.fillText(line, 85, 100 + index * 40)); const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('PDF 页面生成失败')), 'image/png')); const image = await pdf.embedPng(await blob.arrayBuffer()); const page = pdf.addPage([595.28, 841.89]); page.drawImage(image, { x: 0, y: 0, width: 595.28, height: 841.89 }) }
  return { relativePath: `${safeName(work.title)}.pdf`, bytes: [...await pdf.save()] }
}

export async function exportWork(work: Work, data: LibraryData, format: ExportFormat) {
  const files = format === 'markdown' ? await markdownFiles(work, data) : [format === 'docx' ? await docxFile(work, data) : await pdfFile(work, data)]
  const name = `${safeName(work.title)}-${format}-${Date.now()}`
  if (isTauriRuntime()) return invoke<string>('write_export_bundle', { name, files })
  const file = files[0]; const url = URL.createObjectURL(new Blob([new Uint8Array(file.bytes)])); const anchor = document.createElement('a'); anchor.href = url; anchor.download = file.relativePath; anchor.click(); URL.revokeObjectURL(url); return '浏览器下载目录'
}

function contentFromText(text: string): JSONContent { return { type: 'doc', content: text.split(/\n{2,}/).filter(Boolean).map((paragraph) => ({ type: 'paragraph', content: [{ type: 'text', text: paragraph.trim() }] })) } }
export function parseMarkdownChapters(markdown: string, fallbackTitle: string): ImportChapter[] { const matches = [...markdown.matchAll(/^#\s+(.+)$/gm)]; if (!matches.length) return [{ title: fallbackTitle, plainText: markdown.trim(), content: contentFromText(markdown.trim()) }]; return matches.map((match, index) => { const start = match.index! + match[0].length; const end = matches[index + 1]?.index ?? markdown.length; const plainText = markdown.slice(start, end).replace(/^#{2,6}\s+/gm, '').trim(); return { title: match[1].trim(), plainText, content: contentFromText(plainText) } }) }
export async function previewImport(file: File): Promise<ImportChapter[]> { if (file.size > 50 * 1024 * 1024) throw new Error('导入文件必须小于 50 MB'); const name = file.name.replace(/\.[^.]+$/, ''); if (/\.docx$/i.test(file.name)) { const mammoth = await import('mammoth'); const result = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() }); const documentNode = new DOMParser().parseFromString(result.value, 'text/html'); const markdown = [...documentNode.body.children].map((element) => /^H[1-3]$/.test(element.tagName) ? `# ${element.textContent ?? ''}` : element.textContent ?? '').join('\n\n'); return parseMarkdownChapters(markdown, name) } const text = await file.text(); return /\.md$/i.test(file.name) ? parseMarkdownChapters(text, name) : [{ title: name, plainText: text.trim(), content: contentFromText(text.trim()) }] }
