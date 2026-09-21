import { useEffect, useState } from 'react'
import { AppShell } from './app/AppShell'
import { ErrorBoundary } from './app/ErrorBoundary'
import { WindowTitleBar } from './app/WindowTitleBar'
import { useLibraryStore } from './state/useLibraryStore'
import { startupRepository, type StorageStatus } from './infrastructure/startupRepository'
import { OnboardingWizard, type OnboardingResult } from './modules/onboarding/OnboardingWizard'
import { CompanionDesktopBridge } from './modules/companion/CompanionDesktopBridge'
import { DesktopCompanionWindow } from './modules/companion/DesktopCompanionWindow'
import { DesktopCompanionChatWindow } from './modules/companion/DesktopCompanionChatWindow'
import './styles/tokens.css'
import './styles/layout.css'
import './styles/components.css'
import './styles/planner.css'
import './styles/mood.css'
import './styles/diary.css'
import './styles/answerBook.css'
import './styles/companion.css'
import './styles/morningQuestion.css'

export default function App() {
  const params = new URLSearchParams(window.location.search)
  if (params.has('companion-chat')) return <DesktopCompanionChatWindow />
  return params.has('companion') ? <DesktopCompanionWindow /> : <MainApp />
}

function MainApp() {
  const hydrate = useLibraryStore((state) => state.hydrate)
  const ready = useLibraryStore((state) => state.ready)
  const theme = useLibraryStore((state) => state.data.settings.theme)
  const backgroundImage = useLibraryStore((state) => state.data.settings.backgroundImage)
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

  return <div className="app-window"><WindowTitleBar /><ErrorBoundary><div className="app-background" style={backgroundImage ? { backgroundImage: `linear-gradient(color-mix(in srgb, var(--app-bg) 88%, transparent), color-mix(in srgb, var(--app-bg) 88%, transparent)), url(${backgroundImage})` } : undefined}>{startupError ? <main className="launch-screen"><div className="brand-mark">隅</div><p>{startupError}</p></main> : storage && !storage.libraryExists ? <OnboardingWizard defaultDirectory={storage.directory} onComplete={completeOnboarding} /> : ready ? <><CompanionDesktopBridge /><AppShell /></> : <main className="launch-screen"><div className="brand-mark">隅</div><p>正在拾起你的这一隅天地…</p></main>}</div></ErrorBoundary></div>
}
