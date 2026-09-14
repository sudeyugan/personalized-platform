import type { CompanionCharacterPackage } from '../../../domain/models'
import { requiredExpressions, type CharacterPackagePlan, type CharacterSourceConfig } from './CharacterConfig'

const normalizePath = (path: string) => path.replaceAll('\\', '/').replace(/^\.\//, '').replace(/^\/+|\/+$/g, '')
const isObject = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
const natural = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

function assertConfig(value: unknown): asserts value is CharacterSourceConfig {
  if (!isObject(value) || typeof value.id !== 'string' || typeof value.name !== 'string') throw new Error('character.json 缺少 id 或 name')
  if (!isObject(value.canvas) || !Number.isFinite(value.canvas.width) || !Number.isFinite(value.canvas.height) || Number(value.canvas.width) <= 0 || Number(value.canvas.height) <= 0) throw new Error('character.json 的 canvas 尺寸无效')
  if (!isObject(value.base) || typeof value.base.body !== 'string') throw new Error('character.json 缺少 base.body')
  for (const key of ['eyes', 'brows', 'mouth', 'expressions'] as const) if (!isObject(value[key])) throw new Error(`character.json 缺少 ${key}`)
  for (const expression of requiredExpressions) if (!isObject((value.expressions as Record<string, unknown>)[expression])) throw new Error(`character.json 缺少 ${expression} 表情`)
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
  const exactPaths = [source.base.body]
  Object.values(source.eyes).forEach((states) => Object.values(states).forEach((path) => path && exactPaths.push(path)))
  exactPaths.push(...Object.values(source.brows), ...Object.values(source.mouth), ...Object.values(source.overlays ?? {}))
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
    version: 1,
    id: plan.source.id,
    name: plan.source.name,
    canvas: plan.source.canvas,
    baseAssetId: id(plan.source.base.body),
    eyes: Object.fromEntries(Object.entries(plan.source.eyes).map(([name, states]) => [name, Object.fromEntries(Object.entries(states).map(([state, path]) => [state, path ? id(path) : undefined]))])),
    brows: Object.fromEntries(Object.entries(plan.source.brows).map(([name, path]) => [name, id(path)])),
    mouth: Object.fromEntries(Object.entries(plan.source.mouth).map(([name, path]) => [name, id(path)])),
    overlays: Object.fromEntries(Object.entries(plan.source.overlays ?? {}).map(([name, path]) => [name, id(path)])),
    expressions: Object.fromEntries(Object.entries(plan.source.expressions).map(([name, expression]) => [name, { ...expression, overlay: expression.overlay ?? undefined }])),
    motions: Object.fromEntries(Object.entries(plan.source.motions ?? {}).map(([name, motion]) => [name, { frameAssetIds: plan.motionPaths[name].map(id), fps: motion.fps, loop: motion.loop }])),
  }
}

export function characterPackagePaths(plan: CharacterPackagePlan) {
  const paths = new Set<string>([normalizePath(plan.source.base.body)])
  Object.values(plan.source.eyes).forEach((states) => Object.values(states).forEach((path) => path && paths.add(normalizePath(path))))
  Object.values(plan.source.brows).forEach((path) => paths.add(normalizePath(path)))
  Object.values(plan.source.mouth).forEach((path) => paths.add(normalizePath(path)))
  Object.values(plan.source.overlays ?? {}).forEach((path) => paths.add(normalizePath(path)))
  Object.values(plan.motionPaths).forEach((frames) => frames.forEach((path) => paths.add(path)))
  return [...paths]
}

export async function validateCharacterCanvas(plan: CharacterPackagePlan) {
  for (const path of characterPackagePaths(plan)) {
    const file = plan.filesByPath.get(path)
    if (!file) continue
    const bitmap = await createImageBitmap(file)
    const matches = bitmap.width === plan.source.canvas.width && bitmap.height === plan.source.canvas.height
    bitmap.close()
    if (!matches) throw new Error(`${path} 的画布不是 ${plan.source.canvas.width} × ${plan.source.canvas.height}`)
  }
}
