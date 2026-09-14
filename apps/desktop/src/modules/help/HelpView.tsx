import { BookOpenCheck, Download, KeyRound, LifeBuoy, LockKeyhole, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { diagnosticRepository } from '../../infrastructure/diagnosticRepository'

const guides = [
  ['自动保存与恢复', '正文停止输入约 650ms 后提交 SQLite；更短间隔保存恢复草稿。看到“保存失败”时不要卸载应用，先复制文字或重新打开恢复草稿。'],
  ['字数统计', '中文汉字与字母、数字词计入正文；空白和标点不计。章节、作品和每日目标使用同一套规则。'],
  ['完整备份', '设置 → 数据管理可以立即备份、选择目录和恢复。恢复前会再创建安全备份；只有校验清单完整通过才允许恢复。'],
  ['作品加密', '加密后标题、正文、版本、关系和图片进入独立 vault。切走窗口、锁屏或超时会重新锁定；密码不会保存。'],
  ['导入与导出', 'Markdown＋图片是长期迁移兜底；DOCX/PDF 用于外部阅读。导入始终先预览，确认后才写入作品。'],
  ['自定义背景图', '当前一次使用一张全局背景。建议先用 GPT Image 2 生成 4 张同风格候选，再对选中的母版做 2 次单变量微调，最终导入 1 张；推荐横向 1920×1088。\n\n可复制模板：用途：为“一隅”桌面写作软件生成一张全局背景图。场景：[填写场景]。构图：横向 1920×1088，远景、低细节，视觉重心避开中央正文区，四周可安全裁切。风格锚点：克制的东方编辑插画、细腻纸张肌理、柔和漫射光、低饱和矿物色、统一笔触和颗粒。界面适配：中央与左右两侧保持安静，不影响文字和卡片阅读。硬性约束：不要文字、数字、标志、水印、人物、面孔、边框、强烈焦点、密集纹理或高对比光斑。'],
  ['桌面伙伴差分立绘', '角色包由 character.json、同画布透明 PNG 差分层和动作序列帧组成。建议统一使用 1024×1536：主体 1 张；眼睛约 5 张（普通睁/半/闭、开心、生气）；眉毛 4 张；嘴型 5 张（闭/半/开/笑/难过）；覆盖层 3 张；wave 5–12 帧、nod 4–8 帧、surprise 4–8 帧、sleep 4–8 帧，共约 35–54 张 PNG。第一轮先生成主体母版，再以母版作为每一张后续图的图像参考，不要让 Image 2 重新设计角色。\n\n母版提示词：为“一隅”制作桌面伙伴标准角色母版，克制温暖的东方编辑插画风，全身或四分之三身，透明背景，1024×1536 固定画布，角色居中，脚部和身体原点固定，柔和低饱和配色，轮廓与光源统一；不要文字、水印、场景、投影和裁切。\n\n差分提示词：严格沿用所附母版的角色设计、姿势、镜头、画布、坐标、服装、发型、线条、光源和色板；除 [眼睛/眉毛/嘴巴/覆盖层] 外其余像素保持透明，仅输出 [填写目标状态] 差分层，透明 PNG，1024×1536，不移动角色原点。\n\n动作帧提示词：严格沿用所附母版，生成 [wave/nod/surprise/sleep] 动作的第 [序号]/[总帧数] 帧，透明 PNG，1024×1536；脚部与躯干基准位置固定，保持角色身份、服装、发型、镜头、线条和光源一致，只改变动作所需部位，不添加文字、场景或特效。生成后按 character.json 的目录结构整理，在设置 → 智能创作 → 伙伴形象与成长中选择整个角色文件夹。'],
  ['忘记密码', '一隅没有后门，也无法替你重置作品密码。完整备份会保留加密 vault，但恢复备份不能绕过密码。'],
] as const

export function HelpView() {
  const [diagnosticMessage, setDiagnosticMessage] = useState('诊断包只包含版本、系统、数量、文件大小和脱敏崩溃位置，不含正文、标题或 API Key。')
  const createDiagnostics = async () => { try { setDiagnosticMessage(`诊断包已保存：${await diagnosticRepository.create()}`) } catch (error) { setDiagnosticMessage(error instanceof Error ? error.message : '无法创建诊断包') } }

  return <main className="help-view scroll-view"><header className="page-header"><div><p className="eyebrow">帮助中心</p><h1>让每一份文字都有退路</h1><p>需要时再来查看使用指南和脱敏诊断，不要求完成固定验收清单。</p></div></header>
    <section className="help-grid"><article className="help-card primary"><BookOpenCheck /><h2>常用指南</h2><div className="guide-list">{guides.map(([title, body]) => <details key={title}><summary>{title}</summary><p>{body}</p></details>)}</div></article><article className="help-card"><LifeBuoy /><h2>脱敏诊断包</h2><p>{diagnosticMessage}</p><button className="primary-button" onClick={() => void createDiagnostics()}><Download size={15} />导出诊断包</button><small><ShieldCheck size={13} />导出前仍建议你查看压缩包中的 diagnostics.json。</small></article></section>
    <section className="help-warning"><LockKeyhole /><div><strong>安全提醒</strong><p><KeyRound size={13} />加密密码丢失无法恢复。重要文稿仍建议保留至少一份完整备份；遇到问题时再导出诊断包反馈。</p></div></section>
  </main>
}
