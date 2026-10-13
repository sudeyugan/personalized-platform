import { describe, expect, it, vi } from 'vitest'
import { createTakeoverAudit } from './audit'
const add = vi.hoisted(() => vi.fn())
vi.mock('../../state/useLibraryStore', () => ({ useLibraryStore: { getState: () => ({ addCompanionAudit: add }) } }))
describe('takeover metadata audit', () => {
  it('records only safe categories/status, never observed text or field values', async () => {
    add.mockClear(); const audit = createTakeoverAudit()
    await audit('observe', false, async () => ({ windowTitle: '私人标题', controls: ['私有正文'] }))
    await audit('fill', true, async () => ({ text: '私有输入', verified: true }))
    const records = add.mock.calls.flatMap(call => call[0])
    expect(records).toHaveLength(2)
    expect(JSON.stringify(records)).not.toMatch(/私人标题|私有正文|私有输入/)
    expect(records[1]).toMatchObject({ toolName: 'computer.takeover.fill', arguments: { operation: 'fill' }, confirmed: true, resultStatus: 'success' })
  })
  it('records a denial without persisting raw error details', async () => {
    add.mockClear(); const audit = createTakeoverAudit()
    await expect(audit('fill', false, async () => { throw new Error('COMPUTER_PERMISSION_DENIED:私人控件信息') })).rejects.toThrow()
    expect(add.mock.calls[0]![0][0]).toMatchObject({ permissionDecision: 'denied', resultStatus: 'error' })
    expect(JSON.stringify(add.mock.calls)).not.toContain('私人控件信息')
  })
})
