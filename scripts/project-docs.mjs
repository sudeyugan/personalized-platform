import { execSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { packageCommands, verificationCommands } from './project-gates.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const statePath = join(root, '.agent', 'project-status.json')
const startMarker = (name) => `<!-- generated:${name}:start -->`
const endMarker = (name) => `<!-- generated:${name}:end -->`
const statusLabels = {
  not_started: '未开始',
  in_progress: '进行中',
  auto_verified: '自动验收通过',
  delivered_pending_manual: '已交付待人工验收',
  verified: '已验证',
  blocked: '阻塞',
  cancelled: '取消',
}
const allowedStatuses = new Set(Object.keys(statusLabels))

export function localDate(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function manualAcceptanceItems(milestoneId) {
  if (!['M6', 'M7'].includes(milestoneId)) return [`${milestoneId} 阶段末人工体验与验收`]
  return [
    `安装后自然体验${milestoneId === 'M7' ? '本地音乐与伙伴侧栏' : '核心写作流程'}；如发现问题直接反馈，无固定清单或连续天数要求`,
  ]
}

function loadState() {
  return JSON.parse(readFileSync(statePath, 'utf8'))
}

function saveJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function milestone(state, id) {
  return state.milestones.find((item) => item.id === id)
}

function commonSummary(state) {
  const current = milestone(state, state.currentMilestone)
  const next = milestone(state, state.nextMilestone)
  return {
    current,
    next,
    nextLabel: state.nextMilestone === state.currentMilestone ? '后续方向待用户确认' : `${state.nextMilestone} ${next.name}`,
    status: statusLabels[state.milestoneStatus],
    automated: state.automatedChecks.status === 'passed' ? '已通过' : '未通过',
    manual: state.manualAcceptance.status === 'passed' ? '已通过' : '待验收',
  }
}

const generatedBlocks = [
  {
    path: 'README.md', name: 'project-status', render: (state) => {
      const value = commonSummary(state)
      const installer = state.installer?.path ? `\`${state.installer.path}\`` : '本阶段尚未生成'
      return `> 当前版本：\`${state.appVersion}\`｜当前阶段：${state.currentMilestone} ${value.current.name}｜状态：${value.status}｜下一阶段：${value.nextLabel}\n>\n> 自动门禁：${value.automated}｜人工验收：${value.manual}｜状态更新时间：${state.updatedAt}\n>\n> 最近安装包：${installer}`
    },
  },
  {
    path: 'docs/README.md', name: 'project-status', render: (state) => {
      const value = commonSummary(state)
      return `- 当前应用版本：\`${state.appVersion}\`。\n- 当前阶段：${state.currentMilestone} ${value.current.name}，状态为“${value.status}”。\n- 自动门禁：${value.automated}；人工验收：${value.manual}。\n- 下一里程碑：${value.nextLabel}。\n- 当前事实以 \`.agent/project-status.json\` 为机器源，以 \`.agent/PROJECT_STATE.md\` 保存解释和偏差。`
    },
  },
  {
    path: 'docs/product/README.md', name: 'project-status', render: (state) => {
      const value = commonSummary(state)
      return `> 实现状态（${state.updatedAt}）：应用 \`${state.appVersion}\` 的 ${state.currentMilestone} ${value.current.name}为“${value.status}”；自动门禁${value.automated}，人工验收${value.manual}；下一阶段为${value.nextLabel}。本文档包仍是需求基线，实时机器状态见 \`../../.agent/project-status.json\`。`
    },
  },
  {
    path: 'docs/product/05-AI编程交接指南.md', name: 'project-status', render: (state) => {
      const value = commonSummary(state)
      const installer = state.installer?.path ? `\`${state.installer.path}\`` : '本阶段尚未生成'
      return `- 当前应用：\`${state.appVersion}\`；${state.currentMilestone} ${value.current.name}为“${value.status}”。\n- 自动门禁：${value.automated}；人工验收：${value.manual}。\n- 最近安装包：${installer}。\n- 下一阶段：${value.nextLabel}。\n- 机器状态源：\`.agent/project-status.json\`；解释、偏差和前置任务见 \`.agent/PROJECT_STATE.md\`。`
    },
  },
  {
    path: '.agent/PROJECT_STATE.md', name: 'project-status', render: (state) => {
      const value = commonSummary(state)
      return [
        `最后更新：${state.updatedAt}  `,
        `当前版本：\`${state.appVersion}\`  `,
        `当前阶段：${state.currentMilestone} ${value.current.name}  `,
        `阶段状态：${value.status}  `,
        `下一阶段：${value.nextLabel}  `,
        `自动门禁：${value.automated}  `,
        `人工验收：${value.manual}`,
      ].join('\n')
    },
  },
  {
    path: '.agent/ROADMAP.md', name: 'milestone-status', render: renderMilestoneTable,
  },
  {
    path: 'docs/product/04-开发路线图.md', name: 'milestone-status', render: renderMilestoneTable,
  },
]

function renderMilestoneTable(state) {
  const rows = state.milestones.map((item) => `| ${item.id} | ${item.name} | ${statusLabels[item.status]} | ${item.evidence} |`).join('\n')
  return `| 阶段 | 目标 | 实际状态 | 证据或待办 |\n|---|---|---|---|\n${rows}`
}

function generatedRegion(name, body) {
  return `${startMarker(name)}\n${body}\n${endMarker(name)}`
}

export function replaceRegion(raw, name, body, path) {
  const start = startMarker(name)
  const end = endMarker(name)
  const first = raw.indexOf(start)
  const last = raw.indexOf(end)
  if (first < 0 || last < first) throw new Error(`${path} 缺少自动生成标记 ${name}`)
  if (raw.indexOf(start, first + start.length) >= 0 || raw.indexOf(end, last + end.length) >= 0) {
    throw new Error(`${path} 的自动生成标记 ${name} 不唯一`)
  }
  return `${raw.slice(0, first)}${generatedRegion(name, body)}${raw.slice(last + end.length)}`
}

function syncDocs(state = loadState()) {
  for (const block of generatedBlocks) {
    const path = join(root, block.path)
    const raw = readFileSync(path, 'utf8')
    const next = replaceRegion(raw, block.name, block.render(state), block.path)
    if (next !== raw) writeFileSync(path, next, 'utf8')
  }
}

function readJson(path) {
  return JSON.parse(readFileSync(join(root, path), 'utf8'))
}

function cargoVersion() {
  const raw = readFileSync(join(root, 'apps/desktop/src-tauri/Cargo.toml'), 'utf8')
  const packageSection = raw.match(/\[package\]([\s\S]*?)(?=\n\[|$)/)?.[1] ?? ''
  return packageSection.match(/^version\s*=\s*"([^"]+)"/m)?.[1]
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex').toUpperCase()
}

function markdownFiles(directory) {
  const output = []
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry)
    const stat = statSync(path)
    if (stat.isDirectory()) output.push(...markdownFiles(path))
    else if (path.endsWith('.md')) output.push(path)
  }
  return output
}

function checkLinks(errors) {
  const files = [join(root, 'README.md'), join(root, 'AGENTS.md'), ...markdownFiles(join(root, 'docs')), ...markdownFiles(join(root, '.agent'))]
  const linkPattern = /\[[^\]]+\]\(([^)]+)\)/g
  for (const path of files) {
    const raw = readFileSync(path, 'utf8')
    for (const match of raw.matchAll(linkPattern)) {
      const target = match[1].replace(/^<|>$/g, '')
      if (/^(https?:\/\/|mailto:|#)/.test(target)) continue
      const local = target.split('#')[0]
      if (local && !existsSync(resolve(dirname(path), local))) errors.push(`${relative(root, path)} 的链接不存在：${target}`)
    }
  }
}

export function validateState(state, errors) {
  if (state.schemaVersion !== 1) errors.push('project-status.json schemaVersion 必须为 1')
  if (!/^\d+\.\d+\.\d+$/.test(state.appVersion)) errors.push('appVersion 必须是 SemVer')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(state.updatedAt)) errors.push('updatedAt 必须是 YYYY-MM-DD')
  if (!allowedStatuses.has(state.milestoneStatus)) errors.push(`未知里程碑状态：${state.milestoneStatus}`)
  for (const item of state.milestones) if (!allowedStatuses.has(item.status)) errors.push(`${item.id} 使用未知状态：${item.status}`)
  const current = milestone(state, state.currentMilestone)
  const next = milestone(state, state.nextMilestone)
  if (!current) errors.push(`找不到当前里程碑 ${state.currentMilestone}`)
  if (!next) errors.push(`找不到下一里程碑 ${state.nextMilestone}`)
  if (current && current.status !== state.milestoneStatus) errors.push('当前里程碑状态与 milestoneStatus 不一致')
  if (state.milestoneStatus === 'delivered_pending_manual' && state.manualAcceptance.status !== 'pending') errors.push('待人工验收状态必须对应 manualAcceptance=pending')
  if (state.milestoneStatus === 'delivered_pending_manual' && !state.manualAcceptance.items?.length) errors.push('待人工验收状态必须列出人工验收项')
  if (['auto_verified', 'delivered_pending_manual', 'verified'].includes(state.milestoneStatus) && state.automatedChecks.status !== 'passed') errors.push('已自动验收/交付状态必须有通过的自动门禁')
}

function checkDocs({ requireArtifact = false } = {}) {
  const state = loadState()
  const errors = []
  validateState(state, errors)
  const versions = {
    'package.json': readJson('package.json').version,
    'apps/desktop/package.json': readJson('apps/desktop/package.json').version,
    'tauri.conf.json': readJson('apps/desktop/src-tauri/tauri.conf.json').version,
    'Cargo.toml': cargoVersion(),
  }
  for (const [path, version] of Object.entries(versions)) if (version !== state.appVersion) errors.push(`${path} 版本 ${version} 与状态源 ${state.appVersion} 不一致`)
  for (const block of generatedBlocks) {
    const path = join(root, block.path)
    const raw = readFileSync(path, 'utf8')
    try {
      const expected = replaceRegion(raw, block.name, block.render(state), block.path)
      if (expected !== raw) errors.push(`${block.path} 的自动生成区块已过期，请运行 pnpm docs:sync`)
    } catch (error) { errors.push(error.message) }
  }
  const feedback = readFileSync(join(root, 'docs/体验反馈与需求补充.md'), 'utf8')
  if (!new RegExp(`^## ${state.appVersion.replaceAll('.', '\\.')}\\s*$`, 'm').test(feedback)) errors.push(`体验反馈缺少 ${state.appVersion} 章节`)
  if (['delivered_pending_manual', 'verified'].includes(state.milestoneStatus)) {
    const installer = join(root, state.installer?.path ?? '')
    const expectedName = `一隅_${state.appVersion}_x64-setup.exe`
    if (!state.installer?.path || !state.installer.path.endsWith(expectedName)) errors.push('已交付状态缺少与版本一致的安装包路径')
    if (!/^[A-F0-9]{64}$/.test(state.installer?.sha256 ?? '')) errors.push('安装包 SHA-256 格式无效')
    if (requireArtifact && !existsSync(installer)) errors.push('发布检查找不到安装包文件')
    else if (requireArtifact && sha256(installer) !== state.installer.sha256) errors.push('安装包 SHA-256 与状态源不一致')
  }
  checkLinks(errors)
  if (errors.length) {
    console.error('文档一致性检查失败：')
    for (const error of errors) console.error(`- ${error}`)
    process.exitCode = 1
    return
  }
  console.log(`文档一致性检查通过：${state.appVersion} / ${state.currentMilestone} / ${statusLabels[state.milestoneStatus]}`)
}

function updateVersionFiles(version) {
  for (const path of ['package.json', 'apps/desktop/package.json']) {
    const full = join(root, path)
    const value = JSON.parse(readFileSync(full, 'utf8'))
    value.version = version
    saveJson(full, value)
  }
  const tauriPath = join(root, 'apps/desktop/src-tauri/tauri.conf.json')
  const tauri = JSON.parse(readFileSync(tauriPath, 'utf8'))
  tauri.version = version
  saveJson(tauriPath, tauri)
  const cargoPath = join(root, 'apps/desktop/src-tauri/Cargo.toml')
  const cargo = readFileSync(cargoPath, 'utf8')
  writeFileSync(cargoPath, cargo.replace(/(\[package\][\s\S]*?^version\s*=\s*)"[^"]+"/m, `$1"${version}"`), 'utf8')
}

function run(command) {
  console.log(`\n> ${command}`)
  const cargoBin = process.env.USERPROFILE ? join(process.env.USERPROFILE, '.cargo', 'bin') : ''
  execSync(command, { cwd: root, stdio: 'inherit', shell: true, env: { ...process.env, PATH: cargoBin ? `${cargoBin};${process.env.PATH}` : process.env.PATH } })
}

function ensureFeedback(version, summary) {
  const path = join(root, 'docs/体验反馈与需求补充.md')
  const raw = readFileSync(path, 'utf8')
  if (new RegExp(`^## ${version.replaceAll('.', '\\.')}\\s*$`, 'm').test(raw)) return
  writeFileSync(path, `${raw.trimEnd()}\n\n## ${version}\n\n本版实现：${summary}\n\n### 发现的问题\n\n- 暂无，等待体验后填写。\n\n### 希望补充的点\n\n- 暂无，等待体验后填写。\n`, 'utf8')
}

function releasePrepare(args) {
  const [version, currentMilestone, nextMilestone, ...summaryParts] = args
  const summary = summaryParts.join(' ').trim()
  const milestoneId = /^M\d+(?:–M\d+)?$/
  if (!/^\d+\.\d+\.\d+$/.test(version ?? '') || !milestoneId.test(currentMilestone ?? '') || !milestoneId.test(nextMilestone ?? '') || !summary) {
    throw new Error('用法：pnpm release:prepare <版本> <当前里程碑> <下一里程碑> <本版实现摘要>')
  }
  const state = loadState()
  if (!milestone(state, currentMilestone) || !milestone(state, nextMilestone)) throw new Error('状态源中不存在指定里程碑')
  if (state.currentMilestone !== currentMilestone || state.nextMilestone !== nextMilestone || !['in_progress', 'auto_verified'].includes(state.milestoneStatus)) {
    throw new Error('只能发布当前处于“进行中/自动验收通过”的里程碑，且下一里程碑必须与状态源一致')
  }
  updateVersionFiles(version)
  state.appVersion = version
  state.currentMilestone = currentMilestone
  state.nextMilestone = nextMilestone
  state.milestoneStatus = 'in_progress'
  milestone(state, currentMilestone).status = 'in_progress'
  milestone(state, currentMilestone).evidence = summary
  state.automatedChecks = { status: 'pending', verifiedAt: null }
  state.manualAcceptance.status = 'pending'
  state.installer = null
  state.updatedAt = localDate()
  saveJson(statePath, state)
  ensureFeedback(version, summary)
  syncDocs(state)
  for (const command of verificationCommands('full', { includeBuild: false })) run(command)
  for (const command of packageCommands()) run(command)
  const installerPath = `apps/desktop/src-tauri/target/release/bundle/nsis/一隅_${version}_x64-setup.exe`
  const installer = join(root, installerPath)
  if (!existsSync(installer)) throw new Error(`构建成功但找不到安装包：${installerPath}`)
  state.milestoneStatus = 'delivered_pending_manual'
  milestone(state, currentMilestone).status = 'delivered_pending_manual'
  state.automatedChecks = { status: 'passed', verifiedAt: state.updatedAt }
  state.manualAcceptance = { status: 'pending', items: manualAcceptanceItems(currentMilestone) }
  state.installer = { path: installerPath, sha256: sha256(installer) }
  saveJson(statePath, state)
  syncDocs(state)
  checkDocs({ requireArtifact: true })
}

export function releasePatchCommands(scope = 'full') {
  if (!['full', 'ui'].includes(scope)) {
    throw new Error(`未知补丁门禁范围：${scope}；仅支持 full 或 ui`)
  }
  return [
    ...verificationCommands(scope, { includeBuild: false }),
    ...packageCommands(),
  ]
}

export function isNextPatchVersion(current, next) {
  const parse = (value) => /^(\d+)\.(\d+)\.(\d+)$/.exec(value ?? '')?.slice(1).map(Number)
  const from = parse(current)
  const to = parse(next)
  return Boolean(from && to && from[0] === to[0] && from[1] === to[1] && to[2] > from[2])
}

function releasePatch(args = []) {
  const [scope = 'full', version, ...summaryParts] = args.filter((item) => item !== '--')
  const summary = summaryParts.join(' ').trim()
  const state = loadState()
  if (!['full', 'ui'].includes(scope) || !isNextPatchVersion(state.appVersion, version) || !summary) {
    throw new Error('用法：pnpm release:patch -- <更高补丁版本> <修复摘要>，或 pnpm release:patch:ui -- <更高补丁版本> <修复摘要>')
  }
  if (state.milestoneStatus !== 'delivered_pending_manual') throw new Error('正式补丁只能用于当前“已交付待人工验收”的里程碑')
  updateVersionFiles(version)
  state.appVersion = version
  state.automatedChecks = { status: 'pending', verifiedAt: null }
  state.installer = null
  state.updatedAt = localDate()
  ensureFeedback(version, summary)
  saveJson(statePath, state)
  syncDocs(state)
  console.log(scope === 'ui'
    ? '正式补丁门禁：纯前端/UI（跳过独立 Rust 测试，生成新版本 NSIS）'
    : '正式补丁门禁：完整（生成新版本 NSIS）')
  for (const command of releasePatchCommands(scope)) run(command)
  const installerPath = `apps/desktop/src-tauri/target/release/bundle/nsis/一隅_${version}_x64-setup.exe`
  const installer = join(root, installerPath)
  if (!existsSync(installer)) throw new Error(`构建成功但找不到安装包：${installerPath}`)
  state.updatedAt = localDate()
  state.automatedChecks = { status: 'passed', verifiedAt: state.updatedAt }
  state.installer = { path: installerPath, sha256: sha256(installer) }
  saveJson(statePath, state)
  syncDocs(state)
  checkDocs({ requireArtifact: true })
}

function acceptRelease(args) {
  const [milestoneId] = args
  const state = loadState()
  if (milestoneId !== state.currentMilestone || state.milestoneStatus !== 'delivered_pending_manual') {
    throw new Error('只能验收当前处于“已交付待人工验收”的里程碑')
  }
  state.milestoneStatus = 'verified'
  milestone(state, milestoneId).status = 'verified'
  state.manualAcceptance.status = 'passed'
  state.updatedAt = localDate()
  saveJson(statePath, state)
  syncDocs(state)
  checkDocs()
}

function startMilestone(args) {
  const [milestoneId, nextMilestone] = args
  const state = loadState()
  if (!milestone(state, milestoneId) || !milestone(state, nextMilestone)) throw new Error('用法：pnpm milestone:start <当前里程碑> <下一里程碑>')
  if (state.milestoneStatus !== 'verified') throw new Error('上一里程碑尚未完成人工验收，不能开始下一里程碑')
  if (milestoneId !== state.nextMilestone) throw new Error(`只能开始计划中的下一里程碑 ${state.nextMilestone}`)
  if (milestone(state, milestoneId).status !== 'not_started') throw new Error(`${milestoneId} 不是“未开始”状态`)
  state.currentMilestone = milestoneId
  state.nextMilestone = nextMilestone
  state.milestoneStatus = 'in_progress'
  milestone(state, milestoneId).status = 'in_progress'
  state.automatedChecks = { status: 'pending', verifiedAt: null }
  state.manualAcceptance = { status: 'pending', items: [] }
  state.updatedAt = localDate()
  saveJson(statePath, state)
  syncDocs(state)
  checkDocs()
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  const [command = 'check', ...args] = process.argv.slice(2)
  if (command === 'sync') syncDocs()
  else if (command === 'check') checkDocs()
  else if (command === 'check-release') checkDocs({ requireArtifact: true })
  else if (command === 'release') releasePrepare(args)
  else if (command === 'patch') releasePatch(args)
  else if (command === 'accept') acceptRelease(args)
  else if (command === 'start') startMilestone(args)
  else throw new Error(`未知命令：${command}`)
}
