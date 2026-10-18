import { IDEA_LIMITS, type IdeaFrame } from './types'

const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
const bounded = (value: unknown, max: number, empty = false): value is string => typeof value === 'string' && (empty || Boolean(value.trim())) && value.length <= max
export function parseIdeaFrame(raw: unknown): IdeaFrame | undefined {
  let value = raw
  if (typeof value === 'string') {
    if (value.length > 18000) return
    try { value = JSON.parse(value.trim().replace(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i, '$1')) } catch { return }
  }
  const data = record(value)
  if (data.version !== 1 || Object.keys(data).some(key => !['version', 'title', 'reflection', 'question', 'options', 'manuscript', 'uncertainties', 'nextStep'].includes(key))) return
  if (!bounded(data.title, 40) || !bounded(data.reflection, 320) || !bounded(data.question, 200) || !bounded(data.manuscript, IDEA_LIMITS.draft) || !bounded(data.nextStep, 300, true)) return
  if (!Array.isArray(data.options) || data.options.length < 2 || data.options.length > IDEA_LIMITS.options || !data.options.every(item => bounded(item, 100)) || new Set(data.options.map(item => item.trim())).size !== data.options.length) return
  if (!Array.isArray(data.uncertainties) || data.uncertainties.length > 5 || !data.uncertainties.every(item => bounded(item, 180))) return
  return { version: 1, title: data.title.trim(), reflection: data.reflection.trim(), question: data.question.trim(), options: data.options.map(item => item.trim()), manuscript: data.manuscript.trim(), uncertainties: data.uncertainties.map(item => item.trim()), nextStep: data.nextStep.trim() }
}
export function validateIdeaInput(value: string) {
  if (!value.trim() || value.length > IDEA_LIMITS.input) throw new Error(`请写下一点想法，最多 ${IDEA_LIMITS.input} 字。`)
  return value.trim()
}
export { record as ideaRecord }
