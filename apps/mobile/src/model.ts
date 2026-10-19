import { PrivacySession } from '../../desktop/src/modules/privacy/privacySession'
import './native'
export async function requestModel(
  material: string,
  kind: 'chat' | 'idea',
  signal?: AbortSignal,
): Promise<string> {
  if (signal?.aborted) throw new Error('本轮已暂停。')
  const native = window.YiyuMobile
  if (!native || (kind === 'idea' && !native.ideaRound))
    throw new Error('请安装本次更新的安卓版，并在手机设置中配置模型密钥。')
  const privacy = new PrivacySession([]),
    clean = privacy.sanitize(material)
  if (
    clean.findings.length &&
    !confirm(`将把已脱敏的文字发送给 DeepSeek：\n\n${clean.text.slice(0, 600)}\n\n是否继续？`)
  )
    throw new Error('已取消，内容没有发送。')
  if (signal?.aborted) throw new Error('本轮已暂停。')
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID()
    const finish = (content?: string, error?: string) => {
      clearTimeout(timer)
      window.removeEventListener('yiyu-chat-result', listener)
      signal?.removeEventListener('abort', abort)
      if (error) reject(new Error(error))
      else if (!content?.trim()) reject(new Error('模型没有返回可用文字，原内容仍保留。'))
      else resolve(privacy.restore(content ?? ''))
    }
    const listener = (event: Event) => {
      const result = (event as CustomEvent<{ id: string; content: string; success: boolean }>).detail
      if (result?.id === id) finish(result.content, result.success ? undefined : result.content)
    }
    const abort = () => finish(undefined, '本轮已暂停；已发送的模型请求可能仍计入额度。')
    const timer = setTimeout(
      () => finish(undefined, '这次模型返回较慢，原有内容仍保留，可以稍后重试。'),
      55_000,
    )
    window.addEventListener('yiyu-chat-result', listener)
    signal?.addEventListener('abort', abort, { once: true })
    try {
      if (kind === 'idea') native.ideaRound!(id, clean.text)
      else native.chat(id, clean.text)
    } catch {
      finish(undefined, '手机模型连接暂不可用。')
    }
  })
}
