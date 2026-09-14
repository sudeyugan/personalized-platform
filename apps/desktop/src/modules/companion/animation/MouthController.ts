export type MouthState = 'closed' | 'half' | 'open'

export class MouthController {
  private timer?: ReturnType<typeof setTimeout>
  private readonly allowed: () => boolean
  private readonly update: (state: MouthState) => void
  private readonly random: () => number
  constructor(allowed: () => boolean, update: (state: MouthState) => void, random = Math.random) { this.allowed = allowed; this.update = update; this.random = random }

  start() {
    this.stop()
    const speak = () => {
      if (!this.allowed()) return
      const states: MouthState[] = ['closed', 'half', 'open', 'half', 'open']
      this.update(states[Math.floor(this.random() * states.length)])
      this.timer = setTimeout(speak, 80 + this.random() * 70)
    }
    speak()
  }
  stop() { if (this.timer) clearTimeout(this.timer); this.timer = undefined; this.update('closed') }
}
