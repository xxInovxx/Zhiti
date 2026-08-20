import type { AppSettings, AppSnapshot, LearningState, ModeProgress, PracticeSession, Question, QuizProject, SourceFile } from '@/domain/models'
import { emptySnapshot, normalizeSnapshot, type QuizRepository } from './repository'
import type { ImportQuestionType } from '@/modules/import/importTypes'

const STORAGE_KEY = 'quiz-app-snapshot-v1'

export class WebRepository implements QuizRepository {
  private data = emptySnapshot()

  async init(): Promise<void> {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (!saved) return
    try {
      this.data = this.validate(JSON.parse(saved) as AppSnapshot)
    } catch {
      localStorage.removeItem(STORAGE_KEY)
    }
  }

  async getSnapshot(): Promise<AppSnapshot> {
    return structuredClone(this.data)
  }

  async importSource(source: SourceFile, questions: Question[]): Promise<void> {
    if (this.data.sources.some((item) => item.sha256 === source.sha256)) throw new Error('该 XLSX 已经导入')
    this.data.sources.push(source)
    this.data.questions.push(...questions)
    this.persist()
  }

  async updateSourceSelection(source: SourceFile, questions: Question[], _enabledTypes: ImportQuestionType[]): Promise<void> {
    this.upsert(this.data.sources, source)
    const questionMap = new Map(questions.map((question) => [question.id, question]))
    this.data.questions = this.data.questions.map((question) => questionMap.get(question.id) ?? question)
    this.persist()
  }

  async deleteSource(sourceId: string): Promise<void> {
    this.data.sources = this.data.sources.filter((source) => source.id !== sourceId)
    const removedIds = new Set(this.data.questions.filter((question) => question.sourceFileId === sourceId).map((question) => question.id))
    this.data.questions = this.data.questions.filter((question) => question.sourceFileId !== sourceId)
    this.data.learningStates = this.data.learningStates.filter((state) => !removedIds.has(state.questionId))
    this.data.projects = this.data.projects.map((project) => ({
      ...project,
      sourceIds: project.sourceIds.filter((id) => id !== sourceId),
    }))
    this.persist()
  }

  async saveProject(project: QuizProject): Promise<void> {
    this.upsert(this.data.projects, project)
    this.persist()
  }

  async deleteProject(projectId: string): Promise<void> {
    this.data.projects = this.data.projects.filter((project) => project.id !== projectId)
    this.data.sessions = this.data.sessions.filter((session) => session.projectId !== projectId)
    this.data.modeProgress = this.data.modeProgress.filter((progress) => progress.projectId !== projectId)
    this.persist()
  }

  async saveLearningState(state: LearningState): Promise<void> {
    this.upsert(this.data.learningStates, state, 'questionId')
    this.persist()
  }

  async applyFillAnswerCorrection(question: Question, state: LearningState, sessions: PracticeSession[]): Promise<void> {
    this.upsert(this.data.questions, question)
    this.upsert(this.data.learningStates, state, 'questionId')
    sessions.forEach((session) => this.upsert(this.data.sessions, session))
    this.persist()
  }

  async saveSession(session: PracticeSession): Promise<void> {
    this.upsert(this.data.sessions, session)
    this.persist()
  }

  async deleteSessions(sessionIds: string[]): Promise<void> {
    const ids = new Set(sessionIds)
    this.data.sessions = this.data.sessions.filter((session) => !ids.has(session.id))
    this.persist()
  }

  async saveModeProgress(progress: ModeProgress): Promise<void> {
    this.upsert(this.data.modeProgress, progress, 'projectId')
    this.persist()
  }

  async saveSettings(settings: AppSettings): Promise<void> {
    this.data.settings = { ...settings }
    this.persist()
  }

  async replaceSnapshot(snapshot: AppSnapshot): Promise<void> {
    this.data = this.validate(structuredClone(snapshot))
    this.persist()
  }

  private upsert<T>(items: T[], value: T, key: keyof T = 'id' as keyof T): void {
    const index = items.findIndex((item) => item[key] === value[key])
    if (index >= 0) items[index] = value
    else items.push(value)
  }

  private persist(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data))
    } catch (error) {
      throw new Error(`浏览器存储失败：${(error as Error).message}`)
    }
  }

  private validate(snapshot: AppSnapshot): AppSnapshot {
    if (snapshot.schemaVersion !== 1 || !Array.isArray(snapshot.questions) || !Array.isArray(snapshot.projects)) {
      throw new Error('备份数据格式或版本不受支持')
    }
    return normalizeSnapshot(snapshot)
  }
}
