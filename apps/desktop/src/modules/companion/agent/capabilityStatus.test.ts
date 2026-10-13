import { describe, expect, it } from 'vitest'
import { createSeedLibrary } from '../../../domain/seed'
import { describeCapabilityStatus } from './capabilityStatus'
import { createCompanionToolRegistry } from './tools'

const actions = (data: ReturnType<typeof createSeedLibrary>, temporary: string[] = []) => {
  const result = describeCapabilityStatus(data, temporary)
  return [...result.features.flatMap(feature => feature.actions), ...result.global]
}
describe('capabilities use the real execution permission contract', () => {
  it('covers every registered tool without invoking services or exposing configuration secrets', () => {
    const data = createSeedLibrary(), snapshot = JSON.stringify(data)
    expect(new Set(actions(data).map(action => action.name))).toEqual(new Set(createCompanionToolRegistry().definitions().map(tool => tool.name)))
    expect(JSON.stringify(data)).toBe(snapshot)
  })
  it('reflects full access, independent computer access and the write confirmation policy', () => {
    const data = createSeedLibrary()
    data.companion.permissions.fullAccess = false; data.companion.permissions.todos = false
    expect(actions(data).find(action => action.name === 'todo.list')?.status).toBe('暂不可用')
    data.companion.permissions.fullAccess = true; data.companion.permissions.writeActions = false
    data.companion.permissions.writePolicy = 'balanced'
    expect(actions(data).find(action => action.name === 'todo.create')?.status).toBe('可以执行')
    data.companion.permissions.writePolicy = 'always_ask'
    expect(actions(data).find(action => action.name === 'todo.create')?.status).toBe('需要确认')
    expect(actions(data).find(action => action.name === 'system.open')?.status).toBe('暂不可用')
    data.companion.computer.enabled = true
    expect(actions(data).find(action => action.name === 'system.open')?.status).toBe('按目标复核')
  })
  it('disabling writing also disables its child pages and app navigation', () => {
    const data = createSeedLibrary(); data.companion.permissions.fullAccess = true
    data.settings.modules.find(module => module.id === 'writing')!.enabled = false
    for (const name of ['diary.search', 'chapter.get']) {
      const action = actions(data).find(action => action.name === name)
      expect(action?.status).toBe('暂不可用'); expect(action?.reason).toContain('功能已关闭')
    }
  })
  it('does not let full program access imply an encrypted work session grant', () => {
    const data = createSeedLibrary(); data.companion.permissions.fullAccess = true
    data.works.forEach(work => { work.encrypted = true; work.locked = false })
    expect(actions(data).find(action => action.name === 'chapter.get')?.status).toBe('暂不可用')
    expect(actions(data, [data.works[0].id]).find(action => action.name === 'chapter.get')?.status).toBe('可以执行')
    data.works[0].locked = true
    expect(actions(data, [data.works[0].id]).find(action => action.name === 'chapter.get')?.status).toBe('暂不可用')
  })
})
