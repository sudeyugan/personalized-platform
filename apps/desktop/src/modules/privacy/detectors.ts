import type { PrivateDictionaryEntry } from '../../domain/models'
import type { PrivacyFinding, PrivacyFindingKind } from './types'

const patterns: { kind: PrivacyFindingKind; severity: PrivacyFinding['severity']; pattern: RegExp; validate?: (value: string, text: string, start: number) => boolean }[] = [
  { kind: 'secret', severity: 'secret', pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g },
  { kind: 'secret', severity: 'secret', pattern: /\b(?:sk-[A-Za-z0-9_-]{16,}|AIza[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{12,})\b/g },
  { kind: 'secret', severity: 'secret', pattern: /\b(?:api[_ -]?key|access[_ -]?token|secret|password|passwd|authorization)\s*[:=]\s*["']?[^\s,"']{8,}/gi },
  { kind: 'email', severity: 'private', pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi },
  { kind: 'phone', severity: 'private', pattern: /(?<!\d)(?:\+?86[- ]?)?1[3-9]\d{9}(?!\d)/g },
  { kind: 'identity', severity: 'private', pattern: /(?<!\d)\d{17}[\dXx](?!\d)/g, validate: isValidChineseId },
  { kind: 'bank_card', severity: 'private', pattern: /(?<!\d)(?:\d[ -]?){15,18}\d(?!\d)/g, validate: isLikelyBankCard },
  { kind: 'ip', severity: 'private', pattern: /\b(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3}\b/g },
  { kind: 'file_path', severity: 'private', pattern: /\b[A-Za-z]:\\(?:[^\\\r\n:*?"<>|]+\\)*[^\\\r\n:*?"<>|]*/g },
]

function isValidLuhn(value: string) {
  const digits = value.replace(/\D/g, '')
  if (digits.length < 16 || digits.length > 19 || /^(\d)\1+$/.test(digits)) return false
  let sum = 0; let double = false
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    let digit = Number(digits[index])
    if (double && (digit *= 2) > 9) digit -= 9
    sum += digit; double = !double
  }
  return sum % 10 === 0
}

function isLikelyBankCard(value: string, text: string, start: number) {
  if (!isValidLuhn(value)) return false
  // Search results commonly contain long numeric article IDs that can pass
  // Luhn by chance. They are public URL identifiers, not payment-card data.
  const prefix = text.slice(Math.max(0, start - 256), start)
  return !/(?:https?:\/\/|www\.)[^\s"'<>]{0,240}$/i.test(prefix)
}

function isValidChineseId(value: string) {
  const weights = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2]
  const checks = '10X98765432'
  const body = value.slice(0, 17)
  if (!/^\d{17}$/.test(body) || /^(\d)\1+$/.test(body)) return false
  return checks[body.split('').reduce((sum, char, index) => sum + Number(char) * weights[index], 0) % 11] === value.at(-1)?.toUpperCase()
}

function overlaps(candidate: PrivacyFinding, findings: PrivacyFinding[]) {
  return findings.some((item) => candidate.start < item.end && item.start < candidate.end)
}

export function detectPrivacy(text: string, dictionary: PrivateDictionaryEntry[] = []): PrivacyFinding[] {
  const findings: PrivacyFinding[] = []
  for (const definition of patterns) {
    for (const match of text.matchAll(definition.pattern)) {
      const value = match[0]; const start = match.index ?? 0
      if (definition.validate && !definition.validate(value, text, start)) continue
      const finding = { kind: definition.kind, severity: definition.severity, start, end: start + value.length, value } satisfies PrivacyFinding
      if (!overlaps(finding, findings)) findings.push(finding)
    }
  }
  for (const entry of dictionary.filter((item) => item.enabled && item.value.trim().length >= 2).sort((a, b) => b.value.length - a.value.length)) {
    let start = 0
    while ((start = text.indexOf(entry.value.trim(), start)) >= 0) {
      const value = entry.value.trim()
      const finding = { kind: entry.category, severity: 'private' as const, start, end: start + value.length, value }
      if (!overlaps(finding, findings)) findings.push(finding)
      start += value.length
    }
  }
  return findings.sort((a, b) => a.start - b.start || b.end - a.end)
}
