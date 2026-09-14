export type EyeState = 'open' | 'half' | 'closed'

export class BlinkController {
  private timer?: ReturnType<typeof setTimeout>
  private readonly allowed: () => boolean
  private readonly update: (state: EyeState) => void
  private readonly random: () => number
  constructor(allowed: () => boolean, update: (state: EyeState) => void, random = Math.random) { this.allowed = allowed; this.update = update; this.random = random }

  start() { this.stop(); this.schedule() }
  stop() { if (this.timer) clearTimeout(this.timer); this.timer = undefined; this.update('open') }

  private schedule() {
    this.timer = setTimeout(() => this.blink(), 2000 + this.random() * 4000)
  }

  private blink() {
    if (!this.allowed()) { this.schedule(); return }
    const frames: Array<[EyeState, number]> = [['half', 50], ['closed', 60], ['half', 50], ['open', 50]]
    const step = (index: number) => {
      if (index >= frames.length) { this.schedule(); return }
      const [state, duration] = frames[index]
      this.update(state)
      this.timer = setTimeout(() => step(index + 1), duration)
    }
    step(0)
  }
}
