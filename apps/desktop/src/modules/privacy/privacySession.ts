import type { PrivateDictionaryEntry } from '../../domain/models'
import { detectPrivacy } from './detectors'
import { PrivacyEgressError, type PrivacyFinding, type PrivacyFindingKind } from './types'

const labels: Record<PrivacyFindingKind, string> = {
  person: 'PERSON', place: 'PLACE', organization: 'ORG', project: 'PROJECT', account: 'ACCOUNT', other: 'PRIVATE',
  email: 'EMAIL', phone: 'PHONE', identity: 'IDENTITY', bank_card: 'BANK_CARD', ip: 'IP', file_path: 'FILE_PATH', secret: 'SECRET',
}

export class PrivacySession {
  private readonly originalToAlias = new Map<string, string>()
  private readonly aliasToOriginal = new Map<string, string>()
  private readonly counters = new Map<PrivacyFindingKind, number>()
  private readonly dictionary: PrivateDictionaryEntry[]
  constructor(dictionary: PrivateDictionaryEntry[]) { this.dictionary = dictionary }

  sanitize(text: string) {
    const findings = detectPrivacy(text, this.dictionary)
    if (findings.some((item) => item.severity === 'secret')) throw new PrivacyEgressError()
    let cursor = 0; let output = ''
    for (const finding of findings) {
      output += text.slice(cursor, finding.start) + this.aliasFor(finding)
      cursor = finding.end
    }
    return { text: output + text.slice(cursor), findings }
  }

  restore(text: string) {
    let result = text
    for (const [alias, original] of this.aliasToOriginal) result = result.split(alias).join(original)
    return result
  }

  private aliasFor(finding: PrivacyFinding) {
    const key = `${finding.kind}:${finding.value}`
    const existing = this.originalToAlias.get(key)
    if (existing) return existing
    const count = (this.counters.get(finding.kind) ?? 0) + 1
    this.counters.set(finding.kind, count)
    const alias = `[${labels[finding.kind]}_${count}]`
    this.originalToAlias.set(key, alias); this.aliasToOriginal.set(alias, finding.value)
    return alias
  }
}
