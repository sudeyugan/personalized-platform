import { normalizeBrowser, browserOrigin, type BrowserSettings } from '../domain/browser'
import { commitLibraryData, type LibraryStoreSetter } from './persistence'
import type { LibraryStore } from './libraryStoreTypes'
export interface BrowserActions { setCompanionBrowser(changes: Partial<BrowserSettings>): void }
export function createBrowserSlice(get: () => LibraryStore, set: LibraryStoreSetter): BrowserActions {
  return { setCompanionBrowser(changes) {
    if (changes.sites && (changes.sites.length > 32 || changes.sites.some(site => browserOrigin(site) !== site.replace(/\/$/u, '')))) throw new Error('网站范围无效或超过32个')
    const data = get().data
    commitLibraryData({ ...data, companion: { ...data.companion, browser: normalizeBrowser({ ...normalizeBrowser(data.companion.browser), ...changes }) } }, set)
  } }
}
