import type {
  AppSnapshot,
  AppSettings,
  LearningState,
  ModeProgress,
  PracticeSession,
  Question,
  QuizProject,
  SourceFile,
} from '@/domain/models'
import type { ImportQuestionType } from '@/modules/import/importTypes'

export interface QuizRepository {
  init(): Promise<void>
  getSnapshot(): Promise<AppSnapshot>
  importSource(source: SourceFile, questions: Question[]): Promise<void>
  updateSourceSelection(source: SourceFile, questions: Question[], enabledTypes: ImportQuestionType[]): Promise<void>
  deleteSource(sourceId: string): Promise<void>
  saveProject(project: QuizProject): Promise<void>
  deleteProject(projectId: string): Promise<void>
  saveLearningState(state: LearningState): Promise<void>
  applyFillAnswerCorrection(question: Question, state: LearningState, sessions: PracticeSession[]): Promise<void>
  saveSession(session: PracticeSession): Promise<void>
  deleteSessions(sessionIds: string[]): Promise<void>
  saveModeProgress(progress: ModeProgress): Promise<void>
  saveSettings(settings: AppSettings): Promise<void>
  replaceSnapshot(snapshot: AppSnapshot): Promise<void>
}

export const DEFAULT_SETTINGS: AppSettings = {
  splitCaseQuestions: true,
  randomKeepOptionOrder: true,
  totalPracticeDurationMs: 0,
  totalPracticeCount: 0,
  projectOrder: [],
}

export function normalizeSnapshot(snapshot: AppSnapshot): AppSnapshot {
  const legacySettings = (snapshot as AppSnapshot & { settings?: Partial<AppSettings> }).settings
  const usedSourceHashes = new Set<string>()
  const normalizedSources = snapshot.sources.map((source, index) => {
    const rawHash = typeof source.sha256 === 'string' ? source.sha256.trim() : ''
    const baseHash = rawHash || `legacy-source-${source.id || index}`
    let sha256 = baseHash
    let suffix = 1
    while (usedSourceHashes.has(sha256)) {
      sha256 = `${baseHash}-duplicate-${source.id || index}-${suffix}`
      suffix += 1
    }
    usedSourceHashes.add(sha256)
    return { ...source, sha256 }
  })
  const normalizedSessions = snapshot.sessions.map((session) => ({
    ...session,
    entryKind: (session as Partial<PracticeSession>).entryKind === 'SINGLE_QUESTION'
      ? 'SINGLE_QUESTION' as const : 'STANDARD' as const,
    durationMs: Number.isFinite((session as Partial<PracticeSession>).durationMs)
      ? Math.max(0, (session as Partial<PracticeSession>).durationMs as number) : 0,
    questionDurationMs: (session as Partial<PracticeSession>).questionDurationMs
      && typeof (session as Partial<PracticeSession>).questionDurationMs === 'object'
      ? { ...(session as Partial<PracticeSession>).questionDurationMs } : {},
    randomizeOptions: (session as Partial<PracticeSession>).randomizeOptions === true,
  }))
  const legacyDuration = normalizedSessions
    .filter((session) => session.status === 'COMPLETED')
    .reduce((total, session) => total + session.durationMs, 0)
  const legacyPracticeCount = normalizedSessions.filter((session) => session.status === 'COMPLETED').length
  const projectIds = new Set(snapshot.projects.map((project) => project.id))
  const savedProjectOrder = Array.isArray(legacySettings?.projectOrder) ? legacySettings.projectOrder : []
  const projectOrder = [
    ...savedProjectOrder.filter((id, index) => projectIds.has(id) && savedProjectOrder.indexOf(id) === index),
    ...snapshot.projects.map((project) => project.id).filter((id) => !savedProjectOrder.includes(id)),
  ]
  return {
    ...snapshot,
    sources: normalizedSources,
    questions: snapshot.questions.map((question) => ({
      ...question,
      enabled: question.enabled !== false,
      acceptedAnswers: Array.isArray((question as Partial<Question>).acceptedAnswers)
        ? [...(question as Partial<Question>).acceptedAnswers as string[]] : [],
    })),
    learningStates: snapshot.learningStates.map((state) => ({
      ...state,
      note: typeof (state as Partial<LearningState>).note === 'string' ? (state as Partial<LearningState>).note as string : '',
    })),
    sessions: normalizedSessions,
    settings: {
      splitCaseQuestions: legacySettings?.splitCaseQuestions !== false,
      randomKeepOptionOrder: legacySettings?.randomKeepOptionOrder !== false,
      totalPracticeDurationMs: Number.isFinite(legacySettings?.totalPracticeDurationMs)
        ? Math.max(0, legacySettings?.totalPracticeDurationMs as number)
        : legacyDuration,
      totalPracticeCount: Number.isFinite(legacySettings?.totalPracticeCount)
        ? Math.max(0, Math.floor(legacySettings?.totalPracticeCount as number))
        : legacyPracticeCount,
      projectOrder,
    },
  }
}

export function emptySnapshot(): AppSnapshot {
  return {
    schemaVersion: 1,
    settings: { ...DEFAULT_SETTINGS },
    sources: [],
    questions: [],
    projects: [],
    learningStates: [],
    sessions: [],
    modeProgress: [],
  }
}
