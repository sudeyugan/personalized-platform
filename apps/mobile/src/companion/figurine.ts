import sprite from './assets/mobile-companion-v2.png'
import registrationJson from './assets/mobile-companion-v2.frames.json?raw'
interface FrameRect { x: number; y: number; width: number; height: number }
const registration = JSON.parse(registrationJson) as { width: number; height: number; referenceHeight: number; frames: FrameRect[] }
export type VoicePhase = 'idle' | 'listening' | 'thinking' | 'speaking' | 'error'
interface Atlas {
  image: HTMLImageElement
  frames: FrameRect[]
  referenceHeight: number
  anchors: { x: number; y: number }[]
}
let pending: Promise<Atlas> | undefined
export function loadFigurine() {
  if (pending) return pending
  pending = new Promise<Atlas>((resolve, reject) => {
    const image = new Image()
    image.onload = () => {
      try {
        if (image.naturalWidth !== registration.width || image.naturalHeight !== registration.height || registration.frames.length !== 8 || !Number.isFinite(registration.referenceHeight) || registration.referenceHeight <= 0)
          throw Error('手办图集格式不符')
        const canvas = document.createElement('canvas')
        const context = canvas.getContext('2d', { willReadFrequently: true })!
        const anchors = registration.frames.map(rect => {
          const { x, y, width, height } = rect
          if (![x, y, width, height].every(Number.isInteger) || x < 0 || y < 0 || width < 1 || height < 1 || x + width > image.naturalWidth || y + height > image.naturalHeight) throw Error('手办帧范围不符')
          canvas.width = width
          canvas.height = height
          context.clearRect(0, 0, width, height)
          context.drawImage(
            image,
            x,
            y,
            width,
            height,
            0,
            0,
            width,
            height,
          )
          const top = Math.floor(height * 0.87),
            pixels = context.getImageData(0, top, width, height - top).data
          let sum = 0,
            weight = 0,
            bottom = top
          for (let y = top; y < height; y++)
            for (let x = 0; x < width; x++) {
              const alpha = pixels[((y - top) * width + x) * 4 + 3]
              if (alpha > 160) {
                sum += x * alpha
                weight += alpha
                bottom = Math.max(bottom, y)
              }
            }
          return { x: weight ? sum / weight : width / 2, y: bottom }
        })
        resolve({ image, frames: registration.frames, referenceHeight: registration.referenceHeight, anchors })
      } catch (error) {
        pending = undefined
        reject(error)
      }
    }
    image.onerror = () => {
      pending = undefined
      reject(Error('小鱼的形象暂未加载，请重新打开。'))
    }
    image.src = sprite
  })
  return pending
}
export function drawFigurine(
  context: CanvasRenderingContext2D,
  atlas: Atlas,
  frame: number,
  phase: VoicePhase,
  time: number,
  motion: boolean,
) {
  const width = 192,
    height = 256,
    anchor = atlas.anchors[frame],
    rect = atlas.frames[frame],
    scale = 238 / atlas.referenceHeight
  const breathe = motion ? Math.sin(time / 1350) * 0.7 : 0
  context.clearRect(0, 0, width, height)
  context.save()
  context.translate(width / 2, 249)
  if (motion && phase === 'thinking') context.rotate(Math.sin(time / 1700) * 0.012)
  context.drawImage(
    atlas.image,
    rect.x,
    rect.y,
    rect.width,
    rect.height,
    -anchor.x * scale,
    -anchor.y * scale + breathe,
    rect.width * scale,
    rect.height * scale,
  )
  context.restore()
}
export function frameFor(phase: VoicePhase, time: number, motion: boolean, greetingAt = 0, seated = false, resting = false) {
  if (resting) return seated ? 6 : 1
  if (seated) {
    if (phase === 'speaking') return motion && Math.floor(time / 240) % 2 ? 7 : 5
    return motion && time % 5600 > 5440 ? 6 : 5
  }
  if (motion && greetingAt && time - greetingAt < 1100)
    return 4
  if (phase === 'listening') return 2
  if (phase === 'speaking') return motion && Math.floor(time / 190) % 2 ? 3 : 0
  if (motion && time % 5600 > 5440) return 1
  return 0
}
