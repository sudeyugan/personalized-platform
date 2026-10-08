import { lazy, Suspense, useEffect, useState } from 'react'
import { AppShell } from './app/AppShell'
import { ErrorBoundary } from './app/ErrorBoundary'
import { WindowTitleBar } from './app/WindowTitleBar'
import { useLibraryStore } from './state/useLibraryStore'
import { startupRepository, type StorageStatus } from './infrastructure/startupRepository'
import { OnboardingWizard, type OnboardingResult } from './modules/onboarding/OnboardingWizard'
import './styles/tokens.css'
import './styles/layout.css'
import './styles/components.css'
import './styles/settings.css'
import './styles/planner.css'
import './styles/mood.css'
import './styles/diary.css'
import './styles/answerBook.css'
import './styles/companion.css'
import './styles/morningQuestion.css'

const ListeningRuntime = lazy(() => import('./modules/music-companion/ListeningRuntime').then(module => ({ default: module.ListeningRuntime })))
const LyricsWindow = lazy(() => import('./modules/music-companion/lyrics-window/LyricsWindow').then(module => ({ default: module.LyricsWindow })))
const HeartRateRuntime = lazy(() => import('./modules/heart-rate/HeartRateRuntime').then((module) => ({ default: module.HeartRateRuntime })))
const DesktopTaskFeedbackWindow = lazy(() => import('./modules/companion/feedback/DesktopTaskFeedbackWindow').then((module) => ({ default: module.DesktopTaskFeedbackWindow })))
const AgentTaskRuntime = lazy(() => import('./modules/companion/tasks/AgentTaskRuntime').then((module) => ({ default: module.AgentTaskRuntime })))
const CompanionDesktopBridge = lazy(() => import('./modules/companion/CompanionDesktopBridge').then((module) => ({ default: module.CompanionDesktopBridge })))
const DesktopCompanionWindow = lazy(() => import('./modules/companion/DesktopCompanionWindow').then((module) => ({ default: module.DesktopCompanionWindow })))
const DesktopCompanionChatWindow = lazy(() => import('./modules/companion/DesktopCompanionChatWindow').then((module) => ({ default: module.DesktopCompanionChatWindow })))
const PixelPetDebugPage = lazy(() => import('./modules/companion/pixel-pet/PixelPetSettings').then((module) => ({ default: module.PixelPetDebugPage })))
export default function App() {
  const params = new URLSearchParams(window.location.search)
  if (params.has('companion-lyrics')) return <Suspense fallback={null}><LyricsWindow /></Suspense>
  if (params.has('companion-feedback')) return <Suspense fallback={null}><DesktopTaskFeedbackWindow /></Suspense>
  if (params.has('pixel-pet-preview')) return <Suspense fallback={null}><PixelPetDebugPage /></Suspense>
  if (params.has('companion-chat')) return <Suspense fallback={null}><DesktopCompanionChatWindow /></Suspense>
  return params.has('companion') ? <Suspense fallback={null}><DesktopCompanionWindow /></Suspense> : <MainApp />
}

function MainApp() {
  const hydrate = useLibraryStore((state) => state.hydrate)
  const ready = useLibraryStore((state) => state.ready)
  const theme = useLibraryStore((state) => state.data.settings.theme)
  const refreshVaultLocks = useLibraryStore((state) => state.refreshVaultLocks)
  const lockAllWorks = useLibraryStore((state) => state.lockAllWorks)
  const setTheme = useLibraryStore((state) => state.setTheme)
  const setBackupSettings = useLibraryStore((state) => state.setBackupSettings)
  const [storage, setStorage] = useState<StorageStatus | null>(null)
  const [startupError, setStartupError] = useState('')

  useEffect(() => {
    void startupRepository.status().then((status) => { setStorage(status); if (status.libraryExists) void hydrate() }).catch((error) => { setStartupError(error instanceof Error ? error.message : '无法读取资料库状态') })
  }, [hydrate])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  useEffect(() => {
    const timer = window.setInterval(() => { void refreshVaultLocks() }, 30_000)
    const protectOnBackground = () => { if (document.visibilityState === 'hidden') void lockAllWorks() }
    const protectOnBlur = () => { void lockAllWorks() }
    document.addEventListener('visibilitychange', protectOnBackground)
    window.addEventListener('blur', protectOnBlur)
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', protectOnBackground); window.removeEventListener('blur', protectOnBlur) }
  }, [lockAllWorks, refreshVaultLocks])

  const completeOnboarding = async (result: OnboardingResult) => { const configured = await startupRepository.configure(result.libraryDirectory); await hydrate(); setTheme(result.theme); setBackupSettings({ directory: result.backupDirectory }); setStorage({ ...configured, libraryExists: true }) }

  return <div className="app-window"><WindowTitleBar /><ErrorBoundary><div className="app-background">{startupError ? <main className="launch-screen"><div className="brand-mark">隅</div><p>{startupError}</p></main> : storage && !storage.libraryExists ? <OnboardingWizard defaultDirectory={storage.directory} onComplete={completeOnboarding} /> : ready ? <><Suspense fallback={null}><CompanionDesktopBridge /><AgentTaskRuntime /><HeartRateRuntime /><ListeningRuntime /></Suspense><AppShell /></> : <main className="launch-screen"><div className="brand-mark">隅</div><p>正在拾起你的这一隅天地…</p></main>}</div></ErrorBoundary></div>
}
