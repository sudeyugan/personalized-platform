import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSeedLibrary } from '../../../domain/seed'
import { useLibraryStore } from '../../../state/useLibraryStore'
import { createAssignmentWriteServices } from '../assignmentServices'
import { withLiveAgentReads } from '../liveAgentReads'
import { createAgentApplicationServices } from './applicationServices'
import { buildAgentAccess } from './context'
import { createCompanionToolRegistry } from './tools'
import { AgentPermissionEngine } from './permission'

vi.mock('../../../state/persistence', () => ({ commitLibraryData: (data: unknown, set: (value: unknown) => void) => set({ data }), queueLibrarySave: vi.fn() }))
describe('assignment tools and existing todo scope', () => {
  beforeEach(() => { useLibraryStore.setState({ data: createSeedLibrary(), temporaryCompanionWorkIds: [] }) })
  const setup = () => { const data = useLibraryStore.getState().data, access = buildAgentAccess(data, []); return { data, access, registry: createCompanionToolRegistry(), services: withLiveAgentReads(createAgentApplicationServices(data, access, createAssignmentWriteServices())) } }
  it('creates and submits a real selected period with boolean schema, leaving normal todos alone', async () => {
    const { registry, services } = setup()
    expect((await registry.execute({ id: 'create', name: 'assignment.create', arguments: { title: '论文', repeat: 'once', date: '2026-12-12' } }, services)).success).toBe(true)
    const items = services.listAssignments!() as { id: string; periodKey: string }[]
    expect(items).toHaveLength(1)
    expect((await registry.execute({ id: 'submit', name: 'assignment.set_submitted', arguments: { id: items[0].id, key: items[0].periodKey, submitted: true } }, services)).success).toBe(true)
    expect(services.listAssignments!()).toEqual([])
    expect(useLibraryStore.getState().data.planner.todos).toEqual([])
    expect((await registry.execute({ id: 'bad', name: 'assignment.set_submitted', arguments: { id: items[0].id, key: items[0].periodKey, submitted: 'true' } }, services)).error?.code).toBe('InvalidArguments')
  })
  it('checks live todo read permissions after revocation', () => {
    const { services } = setup()
    useLibraryStore.getState().saveAssignment({ title: '报告', subject: '', note: '', rule: { repeat: 'once', startDate: '2026-12-12', weekdays: [] } })
    expect(services.listAssignments!()).toHaveLength(1)
    const data = useLibraryStore.getState().data
    useLibraryStore.setState({ data: { ...data, companion: { ...data.companion, permissions: { ...data.companion.permissions, fullAccess: false, planner: false, todos: false } } } })
    expect(services.listAssignments!()).toEqual([])
  })
  it('requires todo scope and confirmation for medium-risk period edits', async () => {
    const { data, registry } = setup(); data.companion.permissions.fullAccess = false; data.companion.permissions.todos = false
    const tool = registry.lookup('assignment.set_period')!.definition
    const engine = new AgentPermissionEngine({ policy: { autoAllow: ['read'] }, resourcePermissions: data.companion.permissions, access: buildAgentAccess(data, []) })
    expect(engine.check(tool, { id: 'id', key: 'rule@2026-12-12', skipped: true }).allowed).toBe(false)
    data.companion.permissions.todos = true; data.companion.permissions.writeActions = true
    const allowed = new AgentPermissionEngine({ policy: { autoAllow: ['read'] }, resourcePermissions: data.companion.permissions, access: buildAgentAccess(data, []) })
    expect(allowed.check(tool, { id: 'id', key: 'rule@2026-12-12', skipped: true }).requiresConfirmation).toBe(true)
    expect(registry.lookup('assignment.delete')).toBeUndefined()
  })
  it('rejects bad dates, empty weekly days and unknown periods without saving', async () => {
    const { registry, services } = setup()
    for (const args of [{ title: '报告', repeat: 'once', date: '2026-02-29' }, { title: '报告', repeat: 'weekly', date: '2026-10-11', weekdays: [] }]) expect((await registry.execute({ id: 'invalid', name: 'assignment.create', arguments: args }, services)).success).toBe(false)
    expect(useLibraryStore.getState().data.planner.assignments ?? []).toEqual([])
    expect((await registry.execute({ id: 'period', name: 'assignment.set_period', arguments: { id: 'none', key: 'none@2026-10-11', date: '2026-10-12' } }, services)).success).toBe(false)
  })
})
