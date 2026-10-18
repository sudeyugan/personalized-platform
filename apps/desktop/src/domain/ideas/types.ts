export type IdeaMode = 'explore' | 'collect'
export interface IdeaFrame {
  version: 1
  title: string
  reflection: string
  question: string
  options: string[]
  manuscript: string
  uncertainties: string[]
  nextStep: string
}
export interface IdeaTurn { id: string; input: string; mode: IdeaMode; frame: IdeaFrame; createdAt: string }
export interface IdeaSession {
  id: string; seed: string; title: string; createdAt: string; updatedAt: string
  revision: number; turns: IdeaTurn[]; draft: string; draftEdited: boolean
  draftVersions: string[]; status: 'exploring' | 'collected'
  pending?: { input: string; mode: IdeaMode }; forkOf?: string; deletedAt?: string
}
export interface IdeaData { sessions: IdeaSession[]; activeId?: string }
export const IDEA_LIMITS = { input: 3000, draft: 3000, turns: 40, options: 4, recent: 6 } as const
