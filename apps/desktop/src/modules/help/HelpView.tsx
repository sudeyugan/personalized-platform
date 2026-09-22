import { BookOpenCheck, CalendarDays, Download, KeyRound, LifeBuoy, LockKeyhole, Search, ShieldCheck, Sparkles } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { diagnosticRepository } from '../../infrastructure/diagnosticRepository'

interface HelpGuide { title: string; body: string }
interface HelpSection { id: string; title: string; description: string; icon: ReactNode; guides: HelpGuide[] }

const sections: HelpSection[] = [
  {
    id: 'daily', title: '日常与规划', description: '日历、课表、待办、心情与日记', icon: <CalendarDays />,
    guides: [
      { title: '日历与课表', body: '日历用于添加具体日期的事务；课程和待办不会挤进月历格，而是在所选日期的右侧栏显示。当前学期按 2026-09-14 起共 16 周计算，课表会依据全周、周次区间和单双周自动过滤。' },
      { title: '待办与周期次数', body: '不重复任务选择日期；每日任务不需要日期；每周任务可以选择星期几。像“一周跑三次”这样的目标使用周期次数，每记录一次就增加一个 mark，达到目标后仍可继续记录。时间、重复、重要程度和撤销记录收纳在任务设置中。' },
      { title: '待办休假', body: '在待办页选择“今天休假”后，当天不需要完成任何待办，也不会降低重复任务的完成率。休假不会删除已经记录的完成数据，可以随时撤销。' },
      { title: '日记与自动保存', body: '从导航打开日记时默认进入今天；从日历进入则打开所选日期。停止输入约 700ms 后自动保存，切换日期或离开页面也会补存；手动保存只需要点击一次。日记归在创作空间，不在页面中重复显示当天课程。' },
      { title: '每日心情', body: '首页可以记录今天或昨天早上、下午、晚上的心情。每个时段共有 5 分，可以分配给多种情绪，例如 3 分平静、1 分焦虑、1 分孤独；周回望显示七天三时段变化，月回望展示最多七种主要情绪。日历只读显示当天色带。' },
      { title: '朝问', body: '首页每天北京时间 08:00 通过当前 DeepSeek 生成一个思考问题；应用未运行时会在下次打开后补生成。问题和核心主题保留最近 90 天以减少重复。只有点击“写下想法”才进入当天日记；“和伙伴谈谈”会携带问题打开聊天。' },
      { title: '答案之书', body: '输入问题后只允许翻开一次，不提供“再来一次”。答案从本地语料随机抽取，不调用 AI，也不自动保存问题；只有选择“收藏这一页”后，问题、答案和时间才会进入收藏。' },
    ],
  },
  {
    id: 'writing', title: '创作与资料', description: '写作、资料、素材与音乐', icon: <BookOpenCheck />,
    guides: [
      { title: '正文自动保存与恢复', body: '正文停止输入约 650ms 后提交 SQLite，更短间隔保存恢复草稿。看到“保存失败”时不要卸载应用，先复制当前文字；异常退出后重新打开会提示可恢复草稿。' },
      { title: '字数统计与版本', body: '中文汉字与字母、数字词计入正文，空白和标点不计。章节、作品和每日目标使用同一套规则。版本用于保留阶段性正文，不代替完整备份。' },
      { title: '人物、地点与时间线', body: '人物、地点和时间线资料可以关联章节，也可以由获得资料权限的 AI 伙伴查询。资料删除会先进入回收站；模型不能直接访问数据库，只能经过声明过的 Tool 和权限检查。' },
      { title: '素材与开放格式', body: '图片和音频会复制进一隅的素材库，不依赖原文件继续存在。Markdown＋图片是长期迁移兜底；DOCX/PDF 适合外部阅读，复杂分页、浮动图和字体不能保证完整往返。导入会先预览，确认后才写入。' },
      { title: '本地音乐', body: '音乐来自本地曲库，支持队列、音量、列表循环和单曲循环。可以为全局、作品、章节或专注状态设置播放上下文；自动切换默认关闭，隐藏播放器不会中断已允许的播放。' },
      { title: '自定义背景图', body: '设置 → 外观与写作可以选择 JPG、PNG 或 WebP。推荐横向 1920×1080 或更高、低对比、中央安静且四周可裁切的图片，避免文字、水印、人物面孔和高对比光斑。' },
    ],
  },
  {
    id: 'companion', title: 'AI 伙伴', description: '对话、桌面形象、语音与操作权限', icon: <Sparkles />,
    guides: [
      { title: '开始对话与新对话', body: '在主界面伙伴区输入文字，或单击桌面形象打开轻量聊天。聊天右上角可以新开对话；生成过程中可以中止当前回答，语音朗读可以暂停、继续或停止。DeepSeek 回复会逐段显示，不需要等待整篇完成。' },
      { title: '伙伴能读取什么', body: '伙伴不会自动读取整个资料库。只有在 AI 伙伴设置中授权的作品、章节、资料和音乐上下文才可查询；加密作品还需要本次解锁会话的临时许可。撤销授权或重新锁定后立即失效。' },
      { title: '伙伴写入与确认', body: '开启“允许伙伴写入”后，伙伴可以提出创建或修改待办、日历事务、日记、作品、章节、人物、地点、时间线和课表。每次实际写入前都会显示本地确认卡；暂不开放删除、任意文件、Shell 或系统控制。' },
      { title: '静态立绘与动态 WebM', body: '可以上传单张透明 PNG/WebP，或使用 1792×3184、VP9、静音且带透明通道的 WebM。基础待机至少一段，同一状态可以添加多段；倾听、思考、回应、表情和姿势均为可选，缺少时回退待机。单击聊天、拖动移动、双击返回主窗口，默认 Ctrl+Alt+Y 显示或隐藏。' },
      { title: '语音与“小鱼”唤醒', body: '配置 ElevenLabs 的语音识别、合成 Key 与 Voice ID 后，可以录音转写并流式朗读回答。持续唤醒默认关闭；开启后说“小鱼”会进入约 45 秒可续期的语音聊天，每回合使用较短回答。麦克风音频会发送给所选语音服务并产生额度消耗。' },
      { title: '模型与图像生成', body: '伙伴对话目前使用 DeepSeek；图像生成预留 OpenRouter 配置，但尚未接入正式生图流程。两类服务使用不同的 Windows 安全密钥槽，API Key 不进入资料库、Prompt、诊断包或备份。' },
    ],
  },
  {
    id: 'safety', title: '隐私与数据安全', description: '外发保护、备份、加密与恢复', icon: <ShieldCheck />,
    guides: [
      { title: '外部 AI 总开关', body: '设置 → 隐私与安全可以禁止所有外部 AI 处理，并分别控制是否携带已授权上下文、最近对话，以及是否在本地长期保留聊天。关闭外部处理后，本地 Mock 仍可使用。' },
      { title: '私密词典与发送前保护', body: '把真实姓名、地点、组织、项目或账号加入私密词典后，外发时会替换成稳定化名，并在回答回到本机后恢复。手机号、邮箱、有效身份证/银行卡、IP 和本机路径也会被检测；私钥、API Key、密码和 Token 会直接阻止发送。可选择“发现隐私时确认”或“每次发送都确认”。' },
      { title: '语音隐私边界', body: '外部语音识别必须先接收原始音频，文本脱敏无法在上传前理解录音；转写后的文字、发给模型的请求和发给语音合成的文字会经过保护。若需要音频完全不外发，必须使用未来的本地语音识别方案。' },
      { title: '完整备份与恢复', body: '设置 → 数据管理可以立即备份、选择目录和恢复。恢复前会再创建安全备份，只有校验清单完整通过才允许恢复。API Key 不进入备份；加密作品在备份中仍保持密文。' },
      { title: '作品加密与忘记密码', body: '加密后正文、标题、版本、关系和相关图片进入独立 vault，切走窗口、锁屏或超时会重新锁定。密码不会保存，一隅没有后门，也无法重置密码；恢复备份同样不能绕过密码。' },
      { title: '诊断包包含什么', body: '诊断包只包含版本、系统、数据数量、文件大小和脱敏后的代码崩溃位置，不包含正文、标题、完整本机路径、录音或 API Key。提交前仍建议自行查看压缩包中的 diagnostics.json。' },
    ],
  },
]

export function HelpView() {
  const [query, setQuery] = useState('')
  const [diagnosticMessage, setDiagnosticMessage] = useState('诊断包只包含版本、系统、数量、文件大小和脱敏崩溃位置，不含正文、标题或 API Key。')
  const visibleSections = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase('zh-CN')
    if (!keyword) return sections
    return sections.map((section) => ({ ...section, guides: section.guides.filter((guide) => `${guide.title}${guide.body}`.toLocaleLowerCase('zh-CN').includes(keyword)) })).filter((section) => section.guides.length)
  }, [query])
  const createDiagnostics = async () => { try { setDiagnosticMessage(`诊断包已保存：${await diagnosticRepository.create()}`) } catch (error) { setDiagnosticMessage(error instanceof Error ? error.message : '无法创建诊断包') } }

  return <main className="help-view scroll-view">
    <header className="page-header help-header"><div><p className="eyebrow">帮助中心 · 2.0</p><h1>遇到问题时，从这里开始</h1><p>按功能查找使用方法、权限边界和恢复路径，不要求完成固定验收清单。</p></div></header>
    <label className="help-search"><Search size={16} /><input aria-label="搜索帮助" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索：待办、WebM、语音、隐私、备份…" />{query && <button type="button" onClick={() => setQuery('')}>清除</button>}</label>
    <nav className="help-topics" aria-label="帮助主题">{sections.map((section) => <a key={section.id} href={`#help-${section.id}`}>{section.icon}<span><strong>{section.title}</strong><small>{section.description}</small></span></a>)}</nav>
    {visibleSections.length ? <section className="help-directory">{visibleSections.map((section) => <article className="help-card" id={`help-${section.id}`} key={section.id}><header>{section.icon}<span><h2>{section.title}</h2><p>{section.description}</p></span></header><div className="guide-list">{section.guides.map((guide) => <details key={guide.title} open={query ? true : undefined}><summary>{guide.title}</summary><p>{guide.body}</p></details>)}</div></article>)}</section> : <section className="help-empty"><Search /><strong>没有找到相关说明</strong><p>试试更短的词，例如“语音”“待办”或“备份”。</p></section>}
    <section className="help-support"><article className="help-card diagnostic-card"><LifeBuoy /><span><h2>脱敏诊断包</h2><p>{diagnosticMessage}</p><small><ShieldCheck size={13} />导出前仍建议查看压缩包中的 diagnostics.json。</small></span><button className="primary-button" onClick={() => void createDiagnostics()}><Download size={15} />导出诊断包</button></article><article className="help-warning"><LockKeyhole /><div><strong>最后一道安全提醒</strong><p><KeyRound size={13} />加密密码丢失无法恢复；重要文稿请至少保留一份完整备份。不要用真实 API Key 测试隐私阻断。</p></div></article></section>
  </main>
}
