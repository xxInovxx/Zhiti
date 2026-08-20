export type AnswerMode = 'SINGLE' | 'MULTIPLE' | 'JUDGE' | 'FILL' | 'NONE'
export type QuestionNodeType = 'NORMAL' | 'CASE' | 'CASE_ITEM'
export type PracticeMode = 'EXAM' | 'RANDOM_CYCLE' | 'ORDERED' | 'WRONG_REVIEW' | 'FAVORITE_REVIEW' | 'NOTE_REVIEW'
export type PracticeEntryKind = 'STANDARD' | 'SINGLE_QUESTION'
export type PracticeScope = 'ALL' | 'HISTORICAL_WRONG'
export type SessionStatus = 'ACTIVE' | 'COMPLETED'

export interface QuestionOption {
  key: string
  text: string
}

export interface Question {
  id: string
  sourceFileId: string
  sheetName: string
  sourceRow: number
  parentId: string | null
  nodeType: QuestionNodeType
  answerMode: AnswerMode
  stem: string
  normalizedAnswer: string
  acceptedAnswers: string[]
  /** Disabled questions remain with their XLSX source so a source can re-enable a type later. */
  enabled?: boolean
  explanation: string
  sortOrder: number
  fingerprint: string
  options: QuestionOption[]
}

export interface SourceFile {
  id: string
  name: string
  sha256: string
  importedAt: string
  sheets: string[]
  questionCount: number
  caseCount: number
}

export interface QuizProject {
  id: string
  name: string
  description: string
  createdAt: string
  updatedAt: string
  sourceIds: string[]
}

export interface LearningState {
  questionId: string
  attemptCount: number
  correctCount: number
  wrongCount: number
  unansweredCount: number
  isWrongActive: boolean
  isFavorite: boolean
  note: string
  lastAnswer: string
  lastResult: 'CORRECT' | 'WRONG' | 'UNANSWERED' | null
  lastAnsweredAt: string | null
  totalDurationMs: number
}

export interface AnswerRecord {
  questionId: string
  selectedAnswer: string
  isCorrect: boolean
  isUnanswered: boolean
  durationMs: number
}

export interface PracticeSession {
  id: string
  projectId: string | null
  mode: PracticeMode
  entryKind: PracticeEntryKind
  status: SessionStatus
  startedAt: string
  completedAt: string | null
  deadline: string | null
  unitIds: string[]
  currentIndex: number
  answers: Record<string, string>
  gradedQuestionIds: string[]
  correctCount: number
  wrongCount: number
  unansweredCount: number
  durationMs: number
  questionDurationMs: Record<string, number>
  config: ExamConfig | null
  /** Whether this EXAM/RANDOM_CYCLE session should display shuffled options. */
  randomizeOptions?: boolean
}

export interface ModeProgress {
  projectId: string
  orderedCursor: number
  randomQueue: string[]
  randomCursor: number
  randomSignature: string
}

export interface ExamConfig {
  singleCount: number
  multipleCount: number
  judgeCount: number
  fillCount: number
  caseCount: number
  timeLimitMinutes: number
  /** Score ratio assigned to each question type in an exam. */
  singleRatio?: number
  multipleRatio?: number
  judgeRatio?: number
  fillRatio?: number
  caseRatio?: number
  /** Legacy per-question score fields retained for old saved sessions. */
  singleScore?: number
  multipleScore?: number
  judgeScore?: number
  fillScore?: number
  caseScore?: number
}

export interface AppSettings {
  splitCaseQuestions: boolean
  /** Enabled by default: random modes keep the original option order. */
  randomKeepOptionOrder?: boolean
  totalPracticeDurationMs: number
  totalPracticeCount: number
  projectOrder: string[]
}

export interface AppSnapshot {
  schemaVersion: number
  settings: AppSettings
  sources: SourceFile[]
  questions: Question[]
  projects: QuizProject[]
  learningStates: LearningState[]
  sessions: PracticeSession[]
  modeProgress: ModeProgress[]
}

export interface PracticeUnit {
  id: string
  context: Question | null
  questions: Question[]
}

export interface ProjectStats {
  total: number
  attempted: number
  correct: number
  wrongActive: number
  favorites: number
  attempts: number
  correctRate: number
  byMode: Record<Exclude<AnswerMode, 'NONE'>, { total: number; attempted: number; attempts: number; correctRate: number }>
}
