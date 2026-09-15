import type { CompanionCharacterPackage } from '../../../domain/models'
import { requiredExpressions, resolveSpriteAsset, spriteSourcePath, type CharacterPackagePlan, type CharacterSourceConfig, type CharacterSpriteSourceReference } from './CharacterConfig'

const normalizePath = (path: string) => path.replaceAll('\\', '/').replace(/^\.\//, '').replace(/^\/+|\/+$/g, '')
const isObject = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
const natural = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

function assertOptionalNumber(value: unknown, label: string, positive = false) {
  if (value === undefined) return
  if (!Number.isFinite(value) || (positive && Number(value) <= 0)) throw new Error(`character.json 的 ${label} 无效`)
}

function assertSprite(value: unknown, label: string): asserts value is CharacterSpriteSourceReference {
  if (typeof value === 'string' && value.trim()) return
  if (!isObject(value) || typeof value.src !== 'string' || !value.src.trim()) throw new Error(`character.json 的 ${label} 资源无效`)
  if (value.slot !== undefined && (typeof value.slot !== 'string' || !value.slot.trim())) throw new Error(`character.json 的 ${label}.slot 无效`)
  if (value.offset !== undefined) {
    if (!isObject(value.offset)) throw new Error(`character.json 的 ${label}.offset 无效`)
    assertOptionalNumber(value.offset.x, `${label}.offset.x`)
    assertOptionalNumber(value.offset.y, `${label}.offset.y`)
  }
}

function sourceSprites(source: CharacterSourceConfig) {
  const sprites: CharacterSpriteSourceReference[] = [source.base.body]
  Object.values(source.eyes).forEach((states) => Object.values(states).forEach((sprite) => sprite && sprites.push(sprite)))
  Object.values(source.brows).forEach((sprite) => sprites.push(sprite))
  Object.values(source.mouth).forEach((sprite) => sprites.push(sprite))
  Object.values(source.overlays ?? {}).forEach((sprite) => sprites.push(sprite))
  return sprites
}

function assertConfig(value: unknown): asserts value is CharacterSourceConfig {
  if (!isObject(value) || typeof value.id !== 'string' || typeof value.name !== 'string') throw new Error('character.json 缺少 id 或 name')
  if (!isObject(value.canvas) || !Number.isFinite(value.canvas.width) || !Number.isFinite(value.canvas.height) || Number(value.canvas.width) <= 0 || Number(value.canvas.height) <= 0) throw new Error('character.json 的 canvas 尺寸无效')
  if (value.renderer !== undefined && (!isObject(value.renderer) || value.renderer.type !== 'sprite')) throw new Error('character.json 的 renderer.type 目前仅支持 sprite')
  if (value.slots !== undefined) {
    if (!isObject(value.slots)) throw new Error('character.json 的 slots 无效')
    Object.entries(value.slots).forEach(([name, slot]) => {
      if (!isObject(slot) || !Number.isFinite(slot.x) || !Number.isFinite(slot.y)) throw new Error(`character.json 的 slot ${name} 缺少有效 x/y`)
      assertOptionalNumber(slot.width, `slots.${name}.width`, true)
      assertOptionalNumber(slot.height, `slots.${name}.height`, true)
    })
  }
  if (!isObject(value.base) || value.base.body === undefined) throw new Error('character.json 缺少 base.body')
  for (const key of ['eyes', 'brows', 'mouth', 'expressions'] as const) if (!isObject(value[key])) throw new Error(`character.json 缺少 ${key}`)
  for (const expression of requiredExpressions) if (!isObject((value.expressions as Record<string, unknown>)[expression])) throw new Error(`character.json 缺少 ${expression} 表情`)
  assertSprite(value.base.body, 'base.body')
  Object.entries(value.eyes as Record<string, unknown>).forEach(([set, states]) => {
    if (!isObject(states)) throw new Error(`character.json 的 eyes.${set} 无效`)
    Object.entries(states).forEach(([state, sprite]) => assertSprite(sprite, `eyes.${set}.${state}`))
  })
  for (const key of ['brows', 'mouth'] as const) Object.entries(value[key] as Record<string, unknown>).forEach(([name, sprite]) => assertSprite(sprite, `${key}.${name}`))
  if (value.overlays !== undefined) {
    if (!isObject(value.overlays)) throw new Error('character.json 的 overlays 无效')
    Object.entries(value.overlays).forEach(([name, sprite]) => assertSprite(sprite, `overlays.${name}`))
  }
}

function relativeEntries(files: File[]) {
  const configFile = files.find((file) => normalizePath((file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name).endsWith('character.json'))
  if (!configFile) throw new Error('所选文件夹中没有 character.json')
  const configPath = normalizePath((configFile as File & { webkitRelativePath?: string }).webkitRelativePath || configFile.name)
  const root = configPath.slice(0, -'character.json'.length)
  const entries = new Map<string, File>()
  files.forEach((file) => {
    const fullPath = normalizePath((file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name)
    const relative = normalizePath(fullPath.startsWith(root) ? fullPath.slice(root.length) : fullPath)
    entries.set(relative, file)
  })
  return { configFile, entries }
}

export async function planCharacterPackage(files: File[]): Promise<CharacterPackagePlan> {
  const { configFile, entries } = relativeEntries(files)
  let source: unknown
  try { source = JSON.parse(await configFile.text()) } catch { throw new Error('character.json 不是有效 JSON') }
  assertConfig(source)
  const exactPaths = sourceSprites(source).map(spriteSourcePath)
  exactPaths.forEach((path) => { if (!entries.has(normalizePath(path))) throw new Error(`角色包缺少图片：${path}`) })
  const motionPaths: Record<string, string[]> = {}
  Object.entries(source.motions ?? {}).forEach(([name, motion]) => {
    if (!isObject(motion) || typeof motion.directory !== 'string' || !Number.isFinite(motion.fps) || Number(motion.fps) < 1 || Number(motion.fps) > 60) throw new Error(`动作 ${name} 的配置无效`)
    const directory = `${normalizePath(motion.directory)}/`
    const frames = [...entries.keys()].filter((path) => path.startsWith(directory) && path.toLowerCase().endsWith('.png')).sort(natural.compare)
    if (!frames.length) throw new Error(`动作 ${name} 没有 PNG 序列帧`)
    motionPaths[name] = frames
  })
  return { source, filesByPath: entries, motionPaths }
}

export function resolveCharacterPackage(plan: CharacterPackagePlan, assetIdByPath: Map<string, string>): CompanionCharacterPackage {
  const id = (path: string) => {
    const value = assetIdByPath.get(normalizePath(path))
    if (!value) throw new Error(`角色素材尚未导入：${path}`)
    return value
  }
  return {
    version: 2,
    id: plan.source.id,
    name: plan.source.name,
    canvas: plan.source.canvas,
    renderer: plan.source.renderer ?? { type: 'sprite' },
    slots: plan.source.slots,
    baseAssetId: id(spriteSourcePath(plan.source.base.body)),
    baseSprite: typeof plan.source.base.body === 'string' ? undefined : resolveSpriteAsset(plan.source.base.body, id(spriteSourcePath(plan.source.base.body))),
    eyes: Object.fromEntries(Object.entries(plan.source.eyes).map(([name, states]) => [name, Object.fromEntries(Object.entries(states).map(([state, sprite]) => [state, sprite ? resolveSpriteAsset(sprite, id(spriteSourcePath(sprite))) : undefined]))])),
    brows: Object.fromEntries(Object.entries(plan.source.brows).map(([name, sprite]) => [name, resolveSpriteAsset(sprite, id(spriteSourcePath(sprite)))])),
    mouth: Object.fromEntries(Object.entries(plan.source.mouth).map(([name, sprite]) => [name, resolveSpriteAsset(sprite, id(spriteSourcePath(sprite)))])),
    overlays: Object.fromEntries(Object.entries(plan.source.overlays ?? {}).map(([name, sprite]) => [name, resolveSpriteAsset(sprite, id(spriteSourcePath(sprite)))])),
    expressions: Object.fromEntries(Object.entries(plan.source.expressions).map(([name, expression]) => [name, { ...expression, overlay: expression.overlay ?? undefined }])),
    motions: Object.fromEntries(Object.entries(plan.source.motions ?? {}).map(([name, motion]) => [name, { frameAssetIds: plan.motionPaths[name].map(id), fps: motion.fps, loop: motion.loop }])),
  }
}

export function characterPackagePaths(plan: CharacterPackagePlan) {
  const paths = new Set(sourceSprites(plan.source).map((sprite) => normalizePath(spriteSourcePath(sprite))))
  Object.values(plan.motionPaths).forEach((frames) => frames.forEach((path) => paths.add(path)))
  return [...paths]
}

export async function validateCharacterCanvas(plan: CharacterPackagePlan) {
  const warnings = new Set<string>()
  for (const sprite of sourceSprites(plan.source)) {
    const path = normalizePath(spriteSourcePath(sprite))
    const file = plan.filesByPath.get(path)
    if (!file) continue
    const bitmap = await createImageBitmap(file)
    if (typeof sprite === 'string' || !sprite.slot) {
      if (bitmap.width !== plan.source.canvas.width || bitmap.height !== plan.source.canvas.height) {
        bitmap.close()
        throw new Error(`${path} 的画布不是 ${plan.source.canvas.width} × ${plan.source.canvas.height}；局部图片需要声明 slot`)
      }
    } else {
      const slot = plan.source.slots?.[sprite.slot]
      if (!slot) warnings.add(`Character sprite references missing slot: ${sprite.slot} (${path})`)
      else if ((slot.width !== undefined && slot.width !== bitmap.width) || (slot.height !== undefined && slot.height !== bitmap.height)) {
        warnings.add(`${path} 为 ${bitmap.width} × ${bitmap.height}，与 slot ${sprite.slot} 的参考尺寸 ${slot.width ?? '未指定'} × ${slot.height ?? '未指定'} 不一致；仍按图片原始尺寸渲染`)
      }
    }
    bitmap.close()
  }
  for (const paths of Object.values(plan.motionPaths)) {
    for (const path of paths) {
      const file = plan.filesByPath.get(path)
      if (!file) continue
      const bitmap = await createImageBitmap(file)
      const matches = bitmap.width === plan.source.canvas.width && bitmap.height === plan.source.canvas.height
      bitmap.close()
      if (!matches) throw new Error(`动作帧 ${path} 的画布不是 ${plan.source.canvas.width} × ${plan.source.canvas.height}`)
    }
  }
  if (import.meta.env.DEV) warnings.forEach((warning) => console.warn(warning))
  return [...warnings]
}
