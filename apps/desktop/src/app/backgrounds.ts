import type { LibraryData, ViewId } from '../domain/models'

export type ContentBackgroundScene = 'default' | 'daily' | 'creation' | 'immersive'

const dailyViews: ViewId[] = ['home', 'calendar', 'todos']
const creationViews: ViewId[] = ['writing', 'diary', 'people', 'places', 'timeline', 'assets']
const immersiveViews: ViewId[] = ['answerBook', 'music']

export function backgroundSceneForView(view: ViewId): ContentBackgroundScene {
  if (dailyViews.includes(view)) return 'daily'
  if (creationViews.includes(view)) return 'creation'
  if (immersiveViews.includes(view)) return 'immersive'
  return 'default'
}

export function resolveContentBackground(settings: LibraryData['settings'], view: ViewId) {
  const scene = backgroundSceneForView(view)
  const images = settings.backgrounds?.images ?? {}
  return { scene, image: images[scene] ?? images.default ?? settings.backgroundImage }
}
