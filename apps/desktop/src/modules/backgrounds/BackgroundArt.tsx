import type { BackgroundSettings } from '../../domain/models'
import { backgroundPresentation } from './backgroundPresentation'
import { useBackgroundImage } from './useBackgroundImage'
import './backgrounds.css'

export function BackgroundArt({ source, settings }: { source?: string; settings: BackgroundSettings }) {
  const url = useBackgroundImage(source)
  const presentation = backgroundPresentation(settings)
  return url ? <div aria-hidden="true" className={'unified-background ' + presentation.mode} style={presentation.style}><img alt="" src={url} /></div> : null
}
