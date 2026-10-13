import { useEffect, useState } from 'react'
import type { LibraryData } from '../../domain/models'
import { searchApplication, type ApplicationSearchHit } from './applicationSearch'

export type ApplicationSearcher = (data: LibraryData, query: string) => Promise<ApplicationSearchHit[]>
const localSearch: ApplicationSearcher = async (data, query) => searchApplication(data, query)
export function useApplicationSearch(data: LibraryData, query: string, open: boolean, search: ApplicationSearcher = localSearch) {
  const [state, setState] = useState({ results: [] as ApplicationSearchHit[], loading: false, error: false, data, query })
  useEffect(() => {
    let current = true
    if (!open || !query.trim()) { setState({ results: [], loading: false, error: false, data, query }); return }
    setState({ results: [], loading: true, error: false, data, query })
    const timer = setTimeout(() => {
      void search(data, query).then(results => { if (current) setState({ results, loading: false, error: false, data, query }) })
        .catch(() => { if (current) setState({ results: [], loading: false, error: true, data, query }) })
    }, 120)
    return () => { current = false; clearTimeout(timer) }
  }, [data, query, open, search])
  // Data identity invalidates even already-rendered excerpts immediately on lock/deletion.
  return state.data === data && state.query === query && open ? state : { results: [], loading: Boolean(open && query.trim()), error: false }
}
