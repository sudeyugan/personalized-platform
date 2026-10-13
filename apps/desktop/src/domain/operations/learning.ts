export const validOperationPattern = (value: unknown): value is string => typeof value === 'string' && value.length <= 800 && /^(?:[a-z_]+\.[a-z_]+)(?:\|[a-z_]+\.[a-z_]+)*(?:@https:\/\/[a-z0-9.-]+)?$/u.test(value)
export function normalizeOperationLearning(value?: { enabled?: boolean; ignoredPatterns?: string[] }) {
  return { enabled: value?.enabled !== false, ignoredPatterns: Array.isArray(value?.ignoredPatterns) ? [...new Set(value.ignoredPatterns.filter(validOperationPattern))].slice(-100) : [] }
}
