export function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}
export function text(value: unknown, limit = 300): string | undefined {
  // eslint-disable-next-line no-control-regex -- Strip nonprinting control characters from untrusted display fields.
  return typeof value === 'string' && value.trim() ? value.trim().replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').slice(0, limit) : undefined
}
export function inlineText(value: string) {
  return value.replace(/[\r\n\u2028\u2029]/g, ' ').replace(/[\\`*[\]#>_~]/g, '\\$&').replace(/^([-+])(?=\s)/, '\\$1').replace(/^(\d+)([.)])(?=\s)/, '$1\\$2')
}
export function safeReplyUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > 1500) return
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash || !url.hostname.includes('.') || url.hostname.includes(':') || /^(?:localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.)/i.test(url.hostname) || /\.(?:local|localhost|internal)$/i.test(url.hostname)) return
    for (const [key,value] of url.searchParams) if (!['p','page','id'].includes(key) || !/^[\w-]{1,80}$/.test(value)) return
    return url.href
  } catch { return }
}
export function safeError(value: unknown) {
  const message = text(value, 250)
  if (message && /不符合 schema|无效参数|参数.*无效/.test(message)) return '参数无效，请调整输入后再试。'
  if (!message || /(?:sk-[\w-]{8,}|bearer\s|cookie\s*[:=]|password\s*[:=]|token\s*[:=]|secret\s*[:=]|-----BEGIN)/i.test(message)) return '操作没有完成，请检查设置或连接后重试。'
  return message.replace(/https?:\/\/\S+/gi, '相关网站').replace(/\b[A-Z][A-Z_]{3,}:\s*/g, '')
}
export function queryTime(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return
  return `${date.toLocaleTimeString('zh-CN', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit' })} 查询`
}
