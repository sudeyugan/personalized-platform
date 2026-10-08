export interface RememberedHeartDevice { id: string; name: string }
export interface HeartConnectionPreferences { version: 1; device: RememberedHeartDevice | null; autoConnect: boolean }
export const HEART_CONNECTION_KEY = 'yiyu.heart-rate.connection.v1'
export const emptyConnectionPreferences: HeartConnectionPreferences = { version: 1, device: null, autoConnect: false }

export function normalizeConnectionPreferences(value: unknown): HeartConnectionPreferences {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ...emptyConnectionPreferences }
  const input = value as Partial<HeartConnectionPreferences>, device = input.device
  if (input.version !== 1 || !device || typeof device.id !== 'string' || !/^hr-[a-f0-9]{64}$/.test(device.id)
    || typeof device.name !== 'string' || !device.name.trim() || device.name.length > 160) return { ...emptyConnectionPreferences }
  return { version: 1, device: { id: device.id, name: device.name }, autoConnect: input.autoConnect === true }
}
export function readConnectionPreferences(): HeartConnectionPreferences {
  try { return normalizeConnectionPreferences(JSON.parse(localStorage.getItem(HEART_CONNECTION_KEY) ?? 'null')) }
  catch { return { ...emptyConnectionPreferences } }
}
export function saveConnectionPreferences(value: HeartConnectionPreferences): boolean {
  try {
    if (value.device) localStorage.setItem(HEART_CONNECTION_KEY, JSON.stringify(normalizeConnectionPreferences(value)))
    else localStorage.removeItem(HEART_CONNECTION_KEY)
    return true
  } catch { return false }
}

// Two bounded retries after the first scan. Never match by name or connect outside the current scan.
export function nextHeartRetry(attempt: number, now: number) {
  return attempt < 3 ? now + (attempt < 2 ? 15_000 : 45_000) : null
}
