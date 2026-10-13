import type { ToolReceipt } from './types'
import { object } from './safety'

export function pendingAcknowledged(receipt: ToolReceipt) {
  const { call, result } = receipt, data = object(result.data)
  if (call.name === 'system.open') return true // Exact native submission checked by the caller.
  if (call.name === 'task.create') return typeof (data.taskId ?? data.id) === 'string' && ['queued', 'preparing', 'running'].includes(String(data.status))
  if (call.name === 'screen.record_start') return typeof data.recordingId === 'string' && Boolean(data.recordingId)
  return data.prepared === true
}

// Assignment writes return a fresh period snapshot, not an `updated` flag.
// Bind it to the requested period and verify the requested changes only.
export function assignmentAcknowledged(receipt: ToolReceipt) {
  const { call, result } = receipt, args = object(call.arguments), data = object(result.data)
  if (!args.id || !args.key || data.id !== args.id || data.periodKey !== args.key) return false
  if (call.name === 'assignment.set_submitted') {
    return args.submitted === true ? data.status === 'submitted' && typeof data.submittedAt === 'string'
      : args.submitted === false && ['skipped', 'overdue', 'today', 'upcoming'].includes(String(data.status)) && !data.submittedAt
  }
  if (call.name !== 'assignment.set_period') return false
  const fields = ['date', 'time', 'skipped'].filter(key => args[key] !== undefined)
  return fields.length > 0 && fields.every(key => {
    if (key === 'date') return data.date === args.date
    if (key === 'time') return args.time === '' ? !data.time : data.time === args.time
    // A submitted period takes precedence over skipped in the returned status;
    // do not infer a skipped flag that the snapshot does not expose.
    return args.skipped === true ? data.status === 'skipped'
      : args.skipped === false && ['overdue', 'today', 'upcoming'].includes(String(data.status))
  })
}
