import { useEffect, useRef, useState } from 'react'
import type { Records } from '@yiyu/sync'
import type { IdeaMode, IdeaSession, IdeaTurn } from '../../../desktop/src/domain/ideas/types'
import { normalizeIdeas } from '../../../desktop/src/domain/ideas/normalization'
import { parseIdeaFrame } from '../../../desktop/src/domain/ideas/validation'
import { InkLandscape } from '../../../desktop/src/modules/ideas/InkLandscape'
import { InkWaiting } from '../../../desktop/src/modules/ideas/InkWaiting'
import { IdeaFirstPage } from '../../../desktop/src/modules/ideas/IdeaFirstPage'
import { IdeaScrollChapter } from '../../../desktop/src/modules/ideas/IdeaScrollChapter'
import { IDEA_PROMPT } from '../../../desktop/src/modules/ideas/prompt'
import { holdEdits, modify, update, sync } from '../repository'
import { rows } from '../data'
import { requestModel } from '../model'
import { Sheet } from '../components/Sheet'
import '../../../desktop/src/modules/ideas/ideas.css'
import '../../../desktop/src/modules/ideas/scroll.css'
import '../../../desktop/src/modules/ideas/ink.css'
import '../../../desktop/src/modules/ideas/continuation.css'
export default function IdeasPage({ records, target }: { records: Records; target?: string }) {
  const sessions = normalizeIdeas({ sessions: rows(records, 'ideas') }).sessions.filter(
    (item) => !item.deletedAt,
  )
  const [id, setId] = useState<string | undefined>(target?.split('/')[1])
  const [seed, setSeed] = useState(''),
    [input, setInput] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  const [notebook, setNotebook] = useState(false),
    [drafting, setDrafting] = useState(false),
    [draft, setDraft] = useState(''),
    [arrival, setArrival] = useState('')
  const controller = useRef<AbortController | null>(null),
    locked = useRef(false)
  const session = sessions.find((item) => item.id === id)
  useEffect(
    () => () => {
      controller.current?.abort()
    },
    [],
  )
  const cancel = () => controller.current?.abort()
  const run = async (input: string, mode: IdeaMode = 'explore', existing = session) => {
    if (!input.trim() || locked.current) return
    locked.current = true
    setBusy(true)
    setError('')
    const release = holdEdits()
    const abort = new AbortController()
    controller.current = abort
    try {
      let current = existing
      if (!current) {
        const now = new Date().toISOString()
        current = {
          id: crypto.randomUUID(),
          title: input.slice(0, 24),
          seed: input.slice(0, 3000),
          turns: [],
          draft: '',
          draftEdited: false,
          draftVersions: [],
          status: 'exploring',
          revision: 0,
          createdAt: now,
          updatedAt: now,
        }
        await update(`ideas/${current.id}`, current as unknown as Record<string, unknown>)
        setId(current.id)
        setSeed('')
      }
      if (current.turns.length >= 40) throw new Error('这一卷已有四十折，可以另开一条思路。')
      const material = [
        IDEA_PROMPT,
        `最初的念头：\n${current.seed}`,
        `当前手稿${current.draftEdited ? '（用户已修改，不能覆盖）' : ''}：\n${current.draft}`,
        ...current.turns
          .slice(-6)
          .map((turn) => `此前表达：${turn.input.slice(0, 1000)}\n此前问题：${turn.frame.question}`),
        `本轮方式：${mode === 'collect' ? '阶段收束' : '继续澄清'}`,
        `本轮表达：\n${input.slice(0, 3000)}`,
      ].join('\n\n')
      const raw = await requestModel(material, 'idea', abort.signal),
        frame = parseIdeaFrame(raw)
      if (!frame) throw new Error('这次整理格式不完整，原来的手稿仍保留。')
      if (abort.signal.aborted) return
      const turn: IdeaTurn = {
        id: crypto.randomUUID(),
        input,
        mode,
        frame,
        createdAt: new Date().toISOString(),
      }
      const revision = current.revision
      await modify(`ideas/${current.id}`, (value) => {
        const latest = value as unknown as IdeaSession
        if (latest.revision !== revision) throw new Error('手稿刚有新的修改，本轮没有覆盖它。')
        return {
          ...value,
          title: frame.title,
          turns: [...latest.turns, turn],
          draft: latest.draftEdited ? latest.draft : frame.manuscript,
          draftVersions: [...latest.draftVersions, latest.draft].filter(Boolean).slice(-12),
          status: mode === 'collect' ? 'collected' : 'exploring',
          revision: revision + 1,
          updatedAt: new Date().toISOString(),
        }
      })
      setInput('')
      setArrival(turn.id)
    } catch (cause) {
      if (!abort.signal.aborted) setError(cause instanceof Error ? cause.message : '本轮尚未完成。')
    } finally {
      locked.current = false
      setBusy(false)
      release()
      void sync()
    }
  }
  const fork = async (index: number) => {
    if (!session || busy) return
    const turn = session.turns[index],
      now = new Date().toISOString(),
      id = crypto.randomUUID()
    const branch = {
      ...session,
      id,
      forkOf: session.id,
      title: `${session.title.slice(0, 20)} · 另一路`,
      turns: session.turns.slice(0, index + 1),
      draft: turn.frame.manuscript,
      draftEdited: false,
      draftVersions: [],
      revision: 0,
      status: 'exploring',
      createdAt: now,
      updatedAt: now,
    }
    try {
      await update(`ideas/${id}`, branch)
      setId(id)
      setArrival('')
    } catch {
      setError('分支没有保存成功，原卷仍保留。')
    }
  }
  return (
    <section className="ideas-workshop mobile-ideas" data-scene={!session ? 'opening' : 'branching'}>
      <InkLandscape />
      <div className="idea-workspace-content">
        <header className="idea-page-heading">
          <div className="idea-brand">
            <span className="idea-seal">
              酝<br />酿
            </span>
            <div>
              <span className="idea-eyebrow">一隅 / 想法工坊</span>
              <h1>念起 · 墨间</h1>
            </div>
          </div>
          <button disabled={busy} className="idea-text-button" onClick={() => setNotebook(!notebook)}>
            手稿册
          </button>
        </header>
        {notebook && (
          <section className="paper-card">
            <button
              disabled={busy}
              onClick={() => {
                setId(undefined)
                setNotebook(false)
                setArrival('')
                setInput('')
              }}
            >
              ＋ 新的念头
            </button>
            {sessions.map((item) => (
              <button
                className="notebook-row"
                key={item.id}
                disabled={busy}
                onClick={() => {
                  setId(item.id)
                  setNotebook(false)
                  setArrival('')
                  setInput('')
                }}
              >
                {item.title}
                <small>{item.turns.length} 折</small>
              </button>
            ))}
          </section>
        )}
        <div className="idea-scroll-stage">
          {!session ? (
            <IdeaFirstPage seed={seed} setSeed={setSeed} start={() => void run(seed)} busy={busy} />
          ) : (
            <>
              <div className="idea-scroll-navigation">
                <span>{session.title}</span>
                <button
                  disabled={busy}
                  className="idea-text-button"
                  onClick={() => {
                    setDraft(session.draft)
                    setDrafting(true)
                  }}
                >
                  成稿 · 编辑
                </button>
              </div>
              {session.turns.map((turn, index) => (
                <IdeaScrollChapter
                  key={turn.id}
                  turn={turn}
                  index={index}
                  previous={session.turns[index - 1]}
                  active={index === session.turns.length - 1}
                  chosen={session.turns[index + 1]?.input}
                  busy={busy}
                  reveal={arrival === turn.id}
                  submit={(value) => void run(value)}
                  finishReveal={() => setArrival('')}
                  fork={() => void fork(index)}
                />
              ))}
              {!busy && (
                <form
                  className="idea-mobile-compose"
                  onSubmit={(event) => {
                    event.preventDefault()
                    void run(input || (!session.turns.length ? session.seed : ''))
                  }}
                >
                  <label>
                    也可以补充自己的想法
                    <textarea
                      maxLength={3000}
                      value={input}
                      onChange={(event) => setInput(event.target.value)}
                      placeholder="不在选项里，也可以自己续写…"
                    />
                  </label>
                  <div className="toolbar">
                    <button
                      className="primary"
                      type="submit"
                      disabled={!input.trim() && !!session.turns.length}
                    >
                      {session.turns.length ? '续上一笔' : '继续这一念'}
                    </button>
                    <button
                      type="button"
                      onClick={() => void run('请整理目前已经明确的想法，保留仍未确定的部分。', 'collect')}
                    >
                      暂成一稿
                    </button>
                  </div>
                </form>
              )}
            </>
          )}
          {busy && <InkWaiting reviewing={false} cancel={cancel} />}{' '}
          {error && (
            <p role="alert" className="notice">
              {error}
            </p>
          )}
        </div>
        <p className="footnote">
          仅本份想法与近期推敲参与 DeepSeek 处理；不读取其他资料。原卷与手改成稿保留。
        </p>
      </div>
      {drafting && session && (
        <Sheet
          title="这一念，暂成一稿"
          dirty={draft !== session.draft}
          close={() => setDrafting(false)}
          save={async () => {
            await modify(`ideas/${session.id}`, (value) => ({
              ...value,
              draft,
              draftEdited: true,
              draftVersions: [...((value.draftVersions as string[]) ?? []), String(value.draft ?? '')].slice(
                -12,
              ),
              revision: Number(value.revision) + 1,
              updatedAt: new Date().toISOString(),
            }))
          }}
        >
          <textarea
            className="diary-paper"
            aria-label="想法成稿"
            value={draft}
            maxLength={3000}
            onChange={(event) => setDraft(event.target.value)}
          />
          <details>
            <summary>此前的手稿</summary>
            {session.draftVersions.map((version, index) => (
              <article className="record" key={index}>
                <p>{version}</p>
                <button onClick={() => setDraft(version)}>放回编辑区</button>
              </article>
            ))}
          </details>
          {session.turns.at(-1) && (
            <details>
              <summary>最新模型暂稿（不会覆盖手改稿）</summary>
              <p>{session.turns.at(-1)!.frame.manuscript}</p>
              <button onClick={() => setDraft(session.turns.at(-1)!.frame.manuscript)}>采用到编辑区</button>
            </details>
          )}
        </Sheet>
      )}
    </section>
  )
}
