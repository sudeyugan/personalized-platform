import type { CharacterPackage } from '../character/CharacterConfig'

export class MotionPlayer {
  private timer?: ReturnType<typeof setTimeout>
  private resolve?: () => void

  play(character: CharacterPackage, name: string, onFrame: (frame: number) => void): Promise<void> {
    this.stop()
    const motion = character.motions[name]
    if (!motion?.frameAssetIds.length) return Promise.reject(new Error(`角色包没有动作：${name}`))
    return new Promise((resolve) => {
      this.resolve = resolve
      let frame = 0
      const next = () => {
        onFrame(frame)
        if (!motion.loop && frame >= motion.frameAssetIds.length - 1) { this.stop(); return }
        frame = (frame + 1) % motion.frameAssetIds.length
        this.timer = setTimeout(next, 1000 / motion.fps)
      }
      next()
    })
  }

  stop() {
    if (this.timer) clearTimeout(this.timer)
    this.timer = undefined
    const done = this.resolve
    this.resolve = undefined
    done?.()
  }

  isPlaying() { return Boolean(this.resolve) }
}
