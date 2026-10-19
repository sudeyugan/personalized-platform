import sprite from './assets/mobile-figurine-v1.png'
export type VoicePhase = 'idle' | 'listening' | 'thinking' | 'speaking' | 'error'
interface Atlas {
  image: HTMLImageElement
  width: number
  height: number
  anchors: { x: number; y: number }[]
}
let pending: Promise<Atlas> | undefined
export function loadFigurine() {
  if (pending) return pending
  pending = new Promise<Atlas>((resolve, reject) => {
    const image = new Image()
    image.onload = () => {
      try {
        const width = image.naturalWidth / 4,
          height = image.naturalHeight / 2
        if (!Number.isInteger(width) || !Number.isInteger(height) || width > 1024 || height > 1024)
          throw Error('手办图集格式不符')
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const context = canvas.getContext('2d', { willReadFrequently: true })!
        const anchors = Array.from({ length: 8 }, (_, frame) => {
          context.clearRect(0, 0, width, height)
          context.drawImage(
            image,
            (frame % 4) * width,
            Math.floor(frame / 4) * height,
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
        resolve({ image, width, height, anchors })
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
    scale = 238 / atlas.height
  const breathe = motion ? Math.sin(time / 1350) * 0.7 : 0
  context.clearRect(0, 0, width, height)
  context.save()
  context.translate(width / 2, 249)
  if (motion && phase === 'thinking') context.rotate(Math.sin(time / 1700) * 0.012)
  context.drawImage(
    atlas.image,
    (frame % 4) * atlas.width,
    Math.floor(frame / 4) * atlas.height,
    atlas.width,
    atlas.height,
    -anchor.x * scale,
    -anchor.y * scale + breathe,
    atlas.width * scale,
    atlas.height * scale,
  )
  context.restore()
}
export function frameFor(phase: VoicePhase, time: number, motion: boolean, greetingAt = 0) {
  if (motion && greetingAt && time - greetingAt < 1100)
    return [4, 5, 6, 5, 6, 7][Math.min(5, Math.floor((time - greetingAt) / 180))]
  if (phase === 'listening') return 2
  if (phase === 'speaking') return motion && Math.floor(time / 190) % 2 ? 3 : 0
  if (motion && time % 5600 > 5440) return 1
  return 0
}
