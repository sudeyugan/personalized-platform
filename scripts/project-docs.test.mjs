import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { packageCommands, quickTestArgs, verificationCommands } from './project-gates.mjs'
import { isNextPatchVersion, localDate, manualAcceptanceItems, releasePatchCommands, replaceRegion, validateState } from './project-docs.mjs'

const state = JSON.parse(readFileSync(new URL('../.agent/project-status.json', import.meta.url), 'utf8'))

test('current project status is structurally valid', () => {
  const errors = []
  validateState(structuredClone(state), errors)
  assert.deepEqual(errors, [])
})

test('delivered status requires pending manual acceptance with checklist items', () => {
  const changed = structuredClone(state)
  changed.milestoneStatus = 'delivered_pending_manual'
  changed.automatedChecks = { status: 'passed', verifiedAt: changed.updatedAt }
  changed.milestones.find((item) => item.id === changed.currentMilestone).status = 'delivered_pending_manual'
  changed.manualAcceptance = { status: 'passed', items: [] }
  const errors = []
  validateState(changed, errors)
  assert(errors.some((error) => error.includes('manualAcceptance=pending')))
  assert(errors.some((error) => error.includes('人工验收项')))
})

test('current milestone and top-level status cannot diverge', () => {
  const changed = structuredClone(state)
  changed.milestones.find((item) => item.id === changed.currentMilestone).status = 'verified'
  const errors = []
  validateState(changed, errors)
  assert(errors.some((error) => error.includes('milestoneStatus 不一致')))
})

test('generated regions are replaced exactly and markers are mandatory', () => {
  const source = 'before\n<!-- generated:test:start -->\nold\n<!-- generated:test:end -->\nafter\n'
  assert.equal(
    replaceRegion(source, 'test', 'new', 'fixture.md'),
    'before\n<!-- generated:test:start -->\nnew\n<!-- generated:test:end -->\nafter\n',
  )
  assert.throws(() => replaceRegion('no markers', 'test', 'new', 'fixture.md'), /缺少自动生成标记/)
})

test('project dates use the local calendar day instead of UTC', () => {
  assert.equal(localDate(new Date(2026, 7, 9, 0, 15)), '2026-08-09')
})

test('combined milestones remain valid machine state', () => {
  const changed = structuredClone(state)
  changed.currentMilestone = 'M4–M5'
  changed.nextMilestone = 'M6'
  changed.milestoneStatus = 'in_progress'
  changed.automatedChecks = { status: 'pending', verifiedAt: null }
  changed.manualAcceptance = { status: 'pending', items: [] }
  changed.milestones = changed.milestones.map((item) => item.id === 'M4–M5' ? { ...item, status: 'in_progress' } : item)
  const errors = []
  validateState(changed, errors)
  assert.deepEqual(errors, [])
})

test('M6 and M7 release automation keep manual acceptance lightweight', () => {
  assert.deepEqual(manualAcceptanceItems('M6'), ['安装后自然体验核心写作流程；如发现问题直接反馈，无固定清单或连续天数要求'])
  assert.deepEqual(manualAcceptanceItems('M7'), ['安装后自然体验本地音乐与伙伴侧栏；如发现问题直接反馈，无固定清单或连续天数要求'])
})

test('quick verification strips pnpm separator and requires test filters', () => {
  assert.deepEqual(quickTestArgs(['--', 'src/domain/wordCount.test.ts']).slice(-1), ['src/domain/wordCount.test.ts'])
  assert.throws(() => quickTestArgs(['--']), /test-file/)
})

test('verification and packaging gates stay separate', () => {
  assert.deepEqual(verificationCommands('ui'), [
    'pnpm typecheck',
    'pnpm lint',
    'pnpm build',
  ])
  assert(verificationCommands('full').includes('pnpm test'))
  assert(verificationCommands('full').includes('cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml'))
  assert.deepEqual(packageCommands(), ['pnpm tauri:build'])
  assert(!verificationCommands('ui').some((command) => command.includes('tauri:build')))
})

test('formal patch versions cannot overwrite an already published binary', () => {
  assert.equal(isNextPatchVersion('2.0.0', '2.0.1'), true)
  assert.equal(isNextPatchVersion('2.0.1', '2.0.1'), false)
  assert.equal(isNextPatchVersion('2.0.1', '2.1.0'), false)
})

test('formal patch release still packages after its risk-matched verification', () => {
  assert.deepEqual(releasePatchCommands('ui'), [
    'pnpm typecheck',
    'pnpm lint',
    'pnpm tauri:build',
  ])
  assert(releasePatchCommands('full').includes('cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml'))
  assert.throws(() => releasePatchCommands('storage'), /仅支持 full 或 ui/)
})
