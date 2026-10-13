import type { AgentTool } from './toolRegistry'
import type { AssignmentDraft, AssignmentPeriod } from '../../../domain/assignments/types'
import type { AgentJsonSchemaProperty } from './types'

export interface AgentAssignmentServices {
  listAssignments?(status?: string, through?: string): unknown[]
  createAssignment?(draft: AssignmentDraft): unknown
  setAssignmentSubmitted?(id: string, key: string, submitted: boolean): unknown
  changeAssignmentPeriod?(id: string, key: string, changes: AssignmentPeriod): unknown
}
const text = (value: unknown) => typeof value === 'string' ? value : undefined
const string: AgentJsonSchemaProperty = { type: 'string' }
const identifier: AgentJsonSchemaProperty = { type: 'string', minLength: 1 }
const periodProperties = { id: identifier, key: { ...identifier, description: 'assignment.list 返回的原始 periodKey，不能用提交当天替换' } }
export function createAssignmentTools(): AgentTool[] {
  return [
    {
      definition: { name: 'assignment.list', description: '读取作业截止及每一期状态，返回 id 和 periodKey。逾期保留，已交与停交可用 all 查看。', inputSchema: { type: 'object', properties: { status: { type: 'string', enum: ['pending', 'all'] }, through: { ...string, description: '周作业预览到 YYYY-MM-DD，默认未来三周' } }, additionalProperties: false }, capability: 'read', risk: 'read_only', scope: 'todos' },
      execute: (args, services) => { if (!services.listAssignments) throw new Error('作业读取尚未接入'); return services.listAssignments(text(args.status), text(args.through)) },
    },
    {
      definition: { name: 'assignment.create', description: '添加单次或每周作业。date 是单次截止日期或周规则开始日期；不填 time 按截止当天结束。weekly 必须填写星期 weekdays（1=周一，7=周日）。', inputSchema: { type: 'object', properties: { title: identifier, subject: string, note: string, repeat: { type: 'string', enum: ['once', 'weekly'] }, date: identifier, time: string, endDate: string, weekdays: { type: 'array', items: { type: 'number', minimum: 1, maximum: 7 } } }, required: ['title', 'repeat', 'date'], additionalProperties: false }, capability: 'modify', risk: 'low', scope: 'todos' },
      execute: (args, services) => {
        if (!services.createAssignment) throw new Error('添加作业尚未接入')
        return services.createAssignment({ title: String(args.title), subject: text(args.subject) ?? '', note: text(args.note) ?? '', rule: { repeat: args.repeat as 'once' | 'weekly', startDate: String(args.date), time: text(args.time) || undefined, endDate: text(args.endDate) || undefined, weekdays: (args.weekdays ?? []) as AssignmentDraft['rule']['weekdays'] } })
      },
    },
    {
      definition: { name: 'assignment.set_submitted', description: '把指定作业的指定一期标为已交或撤销；可提前交或补交，不改其他周。先 assignment.list 获取 id 和 periodKey。', inputSchema: { type: 'object', properties: { ...periodProperties, submitted: { type: 'boolean' } }, required: ['id', 'key', 'submitted'], additionalProperties: false }, capability: 'modify', risk: 'medium', scope: 'todos' },
      execute: (args, services) => { if (!services.setAssignmentSubmitted) throw new Error('作业提交尚未接入'); return services.setAssignmentSubmitted(String(args.id), String(args.key), args.submitted === true) },
    },
    {
      definition: { name: 'assignment.set_period', description: '只调整指定一期的截止日期/时间或停交状态，不修改后续每周规则。time 空字符串表示当天结束；skipped=false 恢复本期。', inputSchema: { type: 'object', properties: { ...periodProperties, date: string, time: string, skipped: { type: 'boolean' } }, required: ['id', 'key'], additionalProperties: false }, capability: 'modify', risk: 'medium', scope: 'todos' },
      execute: (args, services) => {
        if (!services.changeAssignmentPeriod) throw new Error('本期作业设置尚未接入')
        const changes = { ...(args.date !== undefined ? { date: String(args.date) } : {}), ...(args.time !== undefined ? { time: args.time === '' ? null : String(args.time) } : {}), ...(args.skipped !== undefined ? { skipped: args.skipped === true } : {}) }
        if (!Object.keys(changes).length) throw new Error('请指定本期要修改的内容')
        return services.changeAssignmentPeriod(String(args.id), String(args.key), changes)
      },
    },
  ]
}
