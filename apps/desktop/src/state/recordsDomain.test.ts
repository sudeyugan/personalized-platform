import { describe, expect, it } from 'vitest'
import { createSeedLibrary } from '../domain/seed'
import { compareEvents, eventsInSortGroup, linksFor } from './recordsSlice'

describe('M3 record domain', () => {
  it('keeps approximate time stable and unknown time last', () => {
    const data = createSeedLibrary()
    const unknown = { ...data.events[0], id: 'unknown', precision: 'unknown' as const, sortTime: undefined, manualOrder: 9 }
    const earlier = { ...data.events[0], id: 'earlier', precision: 'year' as const, sortTime: '1990', manualOrder: 0 }
    expect([unknown, data.events[0], earlier].sort(compareEvents).map((event) => event.id)).toEqual(['earlier', 'event-1', 'unknown'])
  })

  it('finds reverse chapter references without duplicating links', () => {
    const data = createSeedLibrary()
    expect(linksFor(data, 'person', 'person-2')).toHaveLength(1)
    expect(linksFor(data, 'chapter', 'chapter-welcome')).toHaveLength(1)
  })

  it('limits manual ordering to events in the same time segment', () => {
    const data = createSeedLibrary()
    const sameTime = { ...data.events[0], id: 'same-time', manualOrder: 2 }
    const otherTime = { ...data.events[0], id: 'other-time', sortTime: '2030', manualOrder: 1 }
    expect(eventsInSortGroup([otherTime, sameTime, data.events[0]], sameTime).map((event) => event.id)).toEqual(['event-1', 'same-time'])
  })
})
