import type { TakeoverNative } from './service'
import type { TakeoverAction, TakeoverObservation, TakeoverProgress } from './types'
import type { TakeoverDecision } from './model'
import { describeTakeoverError } from './errors'
import { ExecutionSession } from '../task-kernel/session'

export interface TakeoverRunnerOptions {
  native: TakeoverNative
  windowId: string
  control: boolean
  decide(observation: TakeoverObservation, result: string, signal: AbortSignal): Promise<TakeoverDecision>
  progress(progress: TakeoverProgress): void
  assertAllowed(): void
  result?(status: 'awaiting_review' | 'handoff' | 'error' | 'cancelled', actions: number): void
}

export class TakeoverRunner {
  private readonly executionState=new ExecutionSession('window',20)
  private abort = new AbortController()
  private session?: string
  private running = false
  private actions = 0
  private rounds = 0
  private expires = Date.now() + 180_000
  private lastResult = '尚未操作'
  private pending?: { action: TakeoverAction; revision: number }
  private readonly options: TakeoverRunnerOptions
  private execution?: Promise<void>
  private interruption = 0
  private expiryTimer?: ReturnType<typeof setTimeout>
  private stopped = false
  private resuming = false
  private reported = false
  constructor(options: TakeoverRunnerOptions) { this.options = options }
  private report(status: 'awaiting_review' | 'handoff' | 'error' | 'cancelled') { if (!this.reported) { this.reported = true; this.options.result?.(status, this.actions) } }
  get resumable() { return !this.stopped && (this.running || this.resuming || Boolean(this.pending) || this.abort.signal.aborted) }
  private update(phase: TakeoverProgress['phase'], message: string, target?: string) { this.options.progress({ phase, actions: this.actions, message, target, pending: this.pending?.action }) }
  private guard() {
    if (this.abort.signal.aborted) throw new DOMException('接管已暂停或停止', 'AbortError')
    if (Date.now() >= this.expires) throw new Error('本次接管达到时间上限，请重新确认后开始')
    this.options.assertAllowed()
  }
  async start() {
    this.expiryTimer = setTimeout(() => { void this.stop().then(() => this.update('error', '本次接管已到3分钟上限，请重新确认后开始。')) }, Math.max(0, this.expires - Date.now()))
    this.execution = this.run(false); await this.execution
  }
  async resume() {
    if (this.stopped || this.resuming) return
    this.resuming = true
    try {
      this.update('paused', '正在等待上一轮退出，随后重新观察；不会重放旧操作。')
      const interruption = this.interruption
      await this.execution
      if (this.stopped || interruption !== this.interruption) return
      this.abort = new AbortController(); this.pending = undefined
      this.execution = this.run(false); await this.execution
    } finally { this.resuming = false }
  }
  async confirmAction() { if (this.stopped || this.resuming || !this.pending || this.running) return; this.abort = new AbortController(); this.execution = this.run(true); await this.execution }
  async pause() {
    this.interruption += 1
    this.abort.abort(); this.pending = undefined
    const id = this.session; this.session = undefined
    if (id) await this.options.native.end(id).catch(() => undefined)
    this.update('paused', '已暂停。继续时重新观察，不重放上一项操作。')
  }
  async stop() { this.stopped = true; clearTimeout(this.expiryTimer); await this.pause(); this.report('cancelled'); this.update('stopped', '接管已停止；已发出的当前动作无法撤回，不会继续下一步。') }
  private async run(confirm: boolean) {
    if (this.running) return
    this.running = true
    try {
      this.guard()
      if (!this.session) this.session = await this.options.native.begin(this.options.windowId, this.options.control ? 'control' : 'read')
      if (confirm && this.pending) {
        const pending = this.pending; this.pending = undefined; this.guard(); this.update('acting', '正在执行你确认的控件操作')
        this.actions += 1
        const result = await this.options.native.act(this.session, pending.revision, pending.action, true)
        this.lastResult = result.verified ? '填写值已由原生接口核对一致' : '动作已发出，尚需观察验证'
      }
      while (true) {
        this.executionState.transition('observing')
        this.guard(); this.update('observing', '正在观察选定窗口')
        const observation = await this.options.native.observe(this.session)
        this.guard()
        if (this.rounds >= 8 || this.actions >= 8) { this.report('handoff'); this.update('finished', '已达到步骤上限并重新观察窗口，请你核对结果；不再继续操作。'); break }
        this.update('thinking', '小鱼正在决定下一步')
        this.rounds += 1
        const decision = await this.options.decide(observation, this.lastResult, this.abort.signal)
        // Recheck live authority after every asynchronous model response.
        if (this.abort.signal.aborted) break
        this.options.assertAllowed()
        if (decision.type === 'result') {
          this.report(decision.status === 'handoff' ? 'handoff' : 'awaiting_review')
          this.update('finished', decision.status === 'verified' ? `模型判断已达成，请核对：${decision.evidence}` : decision.status === 'observed' ? `观察结束：${decision.evidence}` : `交还你处理：${decision.evidence}`)
          break
        }
        if (Date.now() >= this.expires || this.actions >= 8) throw new Error('本次接管达到时间或步骤上限')
        const control = observation.controls.find(control => control.id === decision.action.elementId)
        this.executionState.transition('acting')
        this.update('acting', decision.action.operation === 'fill' ? '正在填写普通输入框' : '正在调用按钮', control?.name)
        try {
          this.actions += 1
          const result = await this.options.native.act(this.session, observation.revision, decision.action, false)
          this.lastResult = result.verified ? '填写值已由原生接口核对一致' : '按钮调用已发出，不代表目标完成；请检查当前观察'
          this.update('checking', '正在重新观察并核对结果')
        } catch (error) {
          const reason = String(error)
          if (reason.includes('TAKEOVER_ACTION_CONFIRMATION_REQUIRED')) {
            this.actions -= 1; this.pending = { action: decision.action, revision: observation.revision }; this.update('waiting', decision.action.operation === 'fill' ? '普通输入框的用途需要你核对，确认本次填写后才执行。' : '这个按钮的作用不明确，请你确认后才执行。', control?.name)
            return
          }
          // Do not retry a write: failure may occur after dispatch.
          throw error
        }
      }
    } catch (error) {
      if (!this.abort.signal.aborted) { this.report('error'); this.update('error', describeTakeoverError(error)) }
    } finally {
      this.running = false
      if (!this.pending) { const id = this.session; this.session = undefined; if (id) await this.options.native.end(id).catch(() => undefined); if (!this.abort.signal.aborted) clearTimeout(this.expiryTimer) }
    }
  }
}
