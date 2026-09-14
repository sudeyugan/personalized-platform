import type { EntityRef, EntityType, LibraryData, Person, Place, RecordType, TimelineEvent } from '../domain/models'
import { libraryRepository } from '../infrastructure/libraryRepository'
import type { LibraryStore } from './libraryStoreTypes'

type SetStore = (partial: Partial<LibraryStore>) => void
const keyFor = (type: RecordType) => type === 'person' ? 'people' : type === 'place' ? 'places' : 'events'
const makeId = (prefix: string) => `${prefix}-${crypto.randomUUID()}`
const commit = (data: LibraryData, set: SetStore) => { set({ data }); void libraryRepository.save(data) }

export function createRecordsSlice(get: () => LibraryStore, set: SetStore): Pick<LibraryStore, 'addPerson' | 'addPlace' | 'addEvent' | 'createRecordFromText' | 'updatePerson' | 'updatePlace' | 'updateEvent' | 'trashRecord' | 'restoreRecord' | 'permanentlyDeleteRecord' | 'setChapterLink' | 'setRecordLink' | 'openRecord' | 'pinRecord' | 'addPersonRelation' | 'deletePersonRelation' | 'moveEvent'> {
  const update = (key: 'people' | 'places' | 'events', id: string, changes: object) => commit({ ...get().data, [key]: get().data[key].map((record) => record.id === id ? { ...record, ...changes } : record) } as LibraryData, set)
  return {
    addPerson: () => { const current = get().data; const record: Person = { id: makeId('person'), name: '新人物', aliases: [], summary: '继续完善这段人物记忆。', importantExperiences: '', tags: [], customFields: [], chapterIds: [] }; commit({ ...current, people: [...current.people, record] }, set) },
    addPlace: () => { const current = get().data; const record: Place = { id: makeId('place'), name: '新地点', aliases: [], region: '未填写', address: '', relatedPeriod: '', description: '这里发生过怎样的故事？', tags: [], customFields: [], chapterIds: [] }; commit({ ...current, places: [...current.places, record] }, set) },
    addEvent: () => { const current = get().data; const record: TimelineEvent = { id: makeId('event'), title: '新事件', displayTime: '时间待定', precision: 'unknown', description: '记录当时发生的事。', manualOrder: current.events.length, customFields: [], chapterIds: [] }; commit({ ...current, events: [...current.events, record] }, set) },
    createRecordFromText: (type, label, chapterId, anchor) => {
      const current = get().data; const id = makeId(type); const cleanLabel = label.trim().slice(0, 80)
      const entityLinks = [...current.entityLinks, { id: makeId('link'), sourceType: 'chapter' as const, sourceId: chapterId, targetType: type, targetId: id, relationType: type === 'person' ? 'mentions' as const : type === 'place' ? 'occurs_at' as const : 'related' as const, anchor, createdAt: new Date().toISOString() }]
      const data = type === 'person'
        ? { ...current, people: [...current.people, { id, name: cleanLabel, aliases: [], summary: '从正文标记创建，继续完善这段人物记忆。', importantExperiences: '', tags: [], customFields: [], chapterIds: [chapterId] }], entityLinks }
        : type === 'place'
          ? { ...current, places: [...current.places, { id, name: cleanLabel, aliases: [], region: '未填写', address: '', relatedPeriod: '', description: '从正文标记创建，继续完善这个地点。', tags: [], customFields: [], chapterIds: [chapterId] }], entityLinks }
          : { ...current, events: [...current.events, { id, title: cleanLabel, displayTime: '时间待定', precision: 'unknown' as const, description: '从正文标记创建，继续完善这件事。', manualOrder: current.events.length, customFields: [], chapterIds: [chapterId] }], entityLinks }
      commit(data, set); return { type, id }
    },
    updatePerson: (id, changes) => update('people', id, changes), updatePlace: (id, changes) => update('places', id, changes), updateEvent: (id, changes) => update('events', id, changes),
    trashRecord: (type, id) => update(keyFor(type), id, { deletedAt: new Date().toISOString() }), restoreRecord: (type, id) => update(keyFor(type), id, { deletedAt: undefined }),
    permanentlyDeleteRecord: (type, id) => { const current = get().data; const key = keyFor(type); commit({ ...current, [key]: current[key].filter((record) => record.id !== id), entityLinks: current.entityLinks.filter((link) => !(link.sourceType === type && link.sourceId === id) && !(link.targetType === type && link.targetId === id)), personRelations: type === 'person' ? current.personRelations.filter((relation) => relation.fromPersonId !== id && relation.toPersonId !== id) : current.personRelations } as LibraryData, set) },
    setChapterLink: (chapterId, target, linked, anchor) => { const current = get().data; let entityLinks = current.entityLinks.filter((link) => !(link.sourceType === 'chapter' && link.sourceId === chapterId && link.targetType === target.type && link.targetId === target.id)); if (linked) entityLinks.push({ id: makeId('link'), sourceType: 'chapter', sourceId: chapterId, targetType: target.type, targetId: target.id, relationType: target.type === 'place' ? 'occurs_at' : target.type === 'person' ? 'mentions' : 'related', anchor, createdAt: new Date().toISOString() }); const key = keyFor(target.type); const records = current[key].map((record) => record.id === target.id ? { ...record, chapterIds: linked ? [...new Set([...record.chapterIds, chapterId])] : record.chapterIds.filter((id) => id !== chapterId) } : record); commit({ ...current, [key]: records, entityLinks } as LibraryData, set) },
    setRecordLink: (source, target, linked) => { const current = get().data; const matches = (link: LibraryData['entityLinks'][number]) => (link.sourceType === source.type && link.sourceId === source.id && link.targetType === target.type && link.targetId === target.id) || (link.sourceType === target.type && link.sourceId === target.id && link.targetType === source.type && link.targetId === source.id); let entityLinks = current.entityLinks.filter((link) => !matches(link)); if (linked) entityLinks.push({ id: makeId('link'), sourceType: source.type, sourceId: source.id, targetType: target.type, targetId: target.id, relationType: source.type === 'event' || target.type === 'event' ? 'involves' : source.type === 'place' || target.type === 'place' ? 'occurs_at' : 'related', createdAt: new Date().toISOString() }); commit({ ...current, entityLinks }, set) },
    openRecord: (activeRecord) => { const current = get().data; const activeView = activeRecord.type === 'person' ? 'people' : activeRecord.type === 'place' ? 'places' : 'timeline'; commit({ ...current, session: { ...current.session, activeView, activeRecord } }, set) },
    pinRecord: (pinnedRecord) => { const current = get().data; commit({ ...current, session: { ...current.session, pinnedRecord } }, set) },
    addPersonRelation: (fromPersonId, toPersonId, relationType, description) => { if (fromPersonId === toPersonId) return; const current = get().data; commit({ ...current, personRelations: [...current.personRelations, { id: makeId('relation'), fromPersonId, toPersonId, relationType, description }] }, set) },
    deletePersonRelation: (id) => { const current = get().data; commit({ ...current, personRelations: current.personRelations.filter((relation) => relation.id !== id) }, set) },
    moveEvent: (id, direction) => {
      const current = get().data
      const selected = current.events.find((event) => event.id === id)
      if (!selected) return
      const group = eventsInSortGroup(current.events, selected)
      const index = group.findIndex((event) => event.id === id)
      const target = index + direction
      if (target < 0 || target >= group.length) return
      const other = group[target]
      commit({
        ...current,
        events: current.events.map((event) => event.id === selected.id
          ? { ...event, manualOrder: other.manualOrder }
          : event.id === other.id
            ? { ...event, manualOrder: selected.manualOrder }
            : event),
      }, set)
    },
  }
}

export function recordByRef(data: LibraryData, ref?: EntityRef) { return !ref ? undefined : data[keyFor(ref.type)].find((record) => record.id === ref.id) }
export function linksFor(data: LibraryData, type: EntityType, id: string) { return data.entityLinks.filter((link) => link.sourceType === type && link.sourceId === id || link.targetType === type && link.targetId === id) }
export function eventSortKey(event: TimelineEvent) { return event.precision === 'unknown' ? '9999-12-31' : event.sortTime ?? event.startDate ?? '9999-12-31' }
export function compareEvents(a: TimelineEvent, b: TimelineEvent) { return eventSortKey(a).localeCompare(eventSortKey(b)) || a.manualOrder - b.manualOrder || a.id.localeCompare(b.id) }
export function eventsInSortGroup(events: TimelineEvent[], selected: TimelineEvent) { return events.filter((event) => eventSortKey(event) === eventSortKey(selected)).sort(compareEvents) }
