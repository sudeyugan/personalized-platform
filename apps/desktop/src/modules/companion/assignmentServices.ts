import { useLibraryStore } from '../../state/useLibraryStore'
import type { AgentAssignmentServices } from './agent/assignmentTools'
import { assignmentOccurrence } from '../../domain/assignments/dates'

export function createAssignmentWriteServices(): Omit<AgentAssignmentServices, 'listAssignments'> {
  const result = (id: string, key: string) => {
    const assignment = useLibraryStore.getState().data.planner.assignments?.find(item => item.id === id)
    const item = assignment && assignmentOccurrence(assignment, key)
    return item ? { id, title: assignment.title, periodKey: key, date: item.date, time: item.time, status: item.status, submittedAt: item.submittedAt } : undefined
  }
  return {
    createAssignment(draft) {
      const id = useLibraryStore.getState().saveAssignment(draft)
      return { created: true, id, title: draft.title.trim(), rule: draft.rule }
    },
    setAssignmentSubmitted(id, key, submitted) {
      useLibraryStore.getState().setAssignmentPeriod(id, key, { submittedAt: submitted ? new Date().toISOString() : undefined })
      return result(id, key)
    },
    changeAssignmentPeriod(id, key, changes) {
      useLibraryStore.getState().setAssignmentPeriod(id, key, changes)
      return result(id, key)
    },
  }
}
