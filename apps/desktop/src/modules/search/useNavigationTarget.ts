import { useEffect } from 'react'
import { useLibraryStore } from '../../state/useLibraryStore'

// Navigation highlights a result without running the page action (e.g. playing a song).
export function useNavigationTarget(destination: string) {
  const intent = useLibraryStore(state => state.data.session.agentNavigation)
  const target = intent?.destination === destination ? intent.targetId : undefined
  useEffect(() => {
    if (!target) return
    const element = [...document.querySelectorAll<HTMLElement>('[data-navigation-target]')].find(item => item.dataset.navigationTarget === target)
    element?.scrollIntoView?.({ block: 'center', behavior: 'auto' })
  }, [intent?.id, target])
  return target
}
