import { Download, FileInput, FileText, Upload } from 'lucide-react'
import { useState, type ChangeEvent } from 'react'
import { exportWork, previewImport, type ExportFormat, type ImportChapter } from '../../infrastructure/documentTransfer'
import { useLibraryStore } from '../../state/useLibraryStore'

export function TransferSettingsSection() {
  const { data, importChapters } = useLibraryStore()
  const works = data.works.filter((work) => !work.deletedAt && !work.locked)
  const [workId, setWorkId] = useState(works[0]?.id ?? '')
  const [format, setFormat] = useState<ExportFormat>('markdown')
  const [imported, setImported] = useState<ImportChapter[]>([])
  const [message, setMessage] = useState('Markdown 会同时导出图片；DOCX 使用真实标题样式；PDF 以可移植的页面图像保存中文。')
  const work = works.find((item) => item.id === workId)
  const runExport = async () => { if (!work) return; if (work.encrypted && !window.confirm('这个作品已解锁。导出会生成不加密的开放格式文件，仍要继续吗？')) return; try { setMessage(`已导出到：${await exportWork(work, data, format)}`) } catch (error) { setMessage(error instanceof Error ? error.message : '导出失败') } }
  const chooseImport = async (event: ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; event.target.value = ''; setImported([]); if (!file) return; try { const preview = await previewImport(file); setImported(preview); setMessage(`已解析 ${preview.length} 个章节；确认前不会写入资料库。`) } catch (error) { setMessage(error instanceof Error ? error.message : '导入解析失败') } }

  return <section className="settings-section"><div className="settings-title"><FileText /><div><h2>开放格式导入与导出</h2><p>让内容可以被外部软件读取；导入始终先预览。</p></div></div>
    <div className="transfer-controls"><label><span>作品</span><select value={workId} onChange={(event) => setWorkId(event.target.value)}>{works.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label><label><span>导出格式</span><select value={format} onChange={(event) => setFormat(event.target.value as ExportFormat)}><option value="markdown">Markdown + 图片</option><option value="docx">DOCX</option><option value="pdf">PDF</option></select></label><button className="primary-button" disabled={!work} onClick={() => void runExport()}><Download size={15} />导出作品</button><label className="ghost-button transfer-upload"><input type="file" accept=".docx,.md,.markdown,.txt" onChange={(event) => void chooseImport(event)} /><Upload size={15} />选择文件导入</label></div>
    <p className="settings-message"><FileInput size={14} />{message}</p>
    {imported.length > 0 && <div className="import-preview"><header><strong>导入预览</strong><span>{imported.length} 章 · {imported.reduce((sum, chapter) => sum + chapter.plainText.length, 0)} 字符</span></header>{imported.slice(0, 8).map((chapter, index) => <div key={`${chapter.title}-${index}`}><span>{String(index + 1).padStart(2, '0')}</span><strong>{chapter.title}</strong><small>{chapter.plainText.slice(0, 55) || '空章节'}</small></div>)}<button className="primary-button" disabled={!workId} onClick={() => { importChapters(workId, imported); setImported([]); setMessage('导入完成；每章已保留一份固定的“导入版本”。') }}><FileInput size={14} />确认导入到当前作品</button></div>}
  </section>
}
