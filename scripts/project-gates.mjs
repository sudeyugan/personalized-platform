import { execFileSync, execSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

export function verificationCommands(scope = 'ui', { includeBuild = true } = {}) {
  if (!['ui', 'full'].includes(scope)) {
    throw new Error(`未知验证范围：${scope}；仅支持 ui 或 full`)
  }
  const commands = ['pnpm typecheck', 'pnpm lint']
  if (scope === 'full') {
    commands.push('pnpm test')
    commands.push('cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml')
  }
  if (includeBuild) commands.push('pnpm build')
  return commands
}

export function packageCommands() {
  return ['pnpm tauri:build']
}

function run(command) {
  console.log(`\n> ${command}`)
  const cargoBin = process.env.USERPROFILE ? join(process.env.USERPROFILE, '.cargo', 'bin') : ''
  execSync(command, {
    cwd: root,
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, PATH: cargoBin ? `${cargoBin};${process.env.PATH}` : process.env.PATH },
  })
}

export function quickTestArgs(args = []) {
  const filters = args.filter((item) => item !== '--')
  if (filters.length === 0) throw new Error('用法：pnpm verify:quick -- <test-file...>')
  return ['--filter', '@yiyu/desktop', 'exec', 'vitest', 'run', '--pool=threads', '--maxWorkers=2', '--reporter=dot', ...filters]
}

function main(command, args = []) {
  if (command === 'quick') {
    const pnpmArgs = quickTestArgs(args)
    if (process.platform === 'win32') {
      execFileSync(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', 'pnpm.cmd', ...pnpmArgs], { cwd: root, stdio: 'inherit' })
    } else {
      execFileSync('pnpm', pnpmArgs, { cwd: root, stdio: 'inherit' })
    }
    return
  }
  if (command === 'ui' || command === 'full') {
    console.log(command === 'ui' ? '验证门禁：前端/UI，不生成安装包' : '验证门禁：跨层完整验证，不生成安装包')
    for (const item of verificationCommands(command)) run(item)
    return
  }
  if (command === 'package') {
    console.log('候选打包：仅生成本机 Tauri/NSIS 产物，不更新发布状态或哈希记录')
    for (const item of packageCommands()) run(item)
    return
  }
  throw new Error('用法：node scripts/project-gates.mjs <quick|ui|full|package>')
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) main(process.argv[2], process.argv.slice(3))
