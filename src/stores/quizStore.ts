import { computed, reactive, ref } from 'vue'
import { defineStore } from 'pinia'
import type {
  AppSnapshot, ExamConfig, LearningState, ModeProgress, PracticeMode, PracticeSession,
  PracticeScope, PracticeUnit, ProjectStats, Question, QuizProject, SourceFile,
} from '@/domain/models'
import { createId, shuffle } from '@/domain/utils'
import { isReservedProjectName } from '@/domain/projectNames'
import { repository } from '@/infrastructure/database'
import { IMPORT_QUESTION_TYPES, questionImportType, type ImportQuestionType, type ParsedWorkbook } from '@/modules/import/importTypes'
import { buildAnswerCorrection } from '@/modules/practice/fillAnswerCorrection'
import {
  buildLegacyCaseUnit, buildPracticeUnits, buildSingleQuestionUnit, gradeQuestion, hasSameUnitPool,
  completedPracticeUnitIds, completedPracticeUnits, randomizeChoiceOptions, reshuffleRemainingUnitIds, selectExamUnits,
} from '@/modules/practice/practiceEngine'

function blankLearning(questionId: string): LearningState {
  return {
    questionId, attemptCount: 0, correctCount: 0, wrongCount: 0, unansweredCount: 0,
    isWrongActive: false, isFavorite: false, note: '', lastAnswer: '', lastResult: null,
    lastAnsweredAt: null, totalDurationMs: 0,
  }
}

function blankProgress(projectId: string): ModeProgress {
  return { projectId, orderedCursor: 0, randomQueue: [], randomCursor: 0, randomSignature: '' }
}

export const useQuizStore = defineStore('quiz', () => {
  const data = reactive<AppSnapshot>({
    schemaVersion: 1, settings: { splitCaseQuestions: true, randomKeepOptionOrder: true, themeMode: 'SYSTEM', totalPracticeDurationMs: 0, totalPracticeCount: 0, projectPracticeCounts: {}, projectOrder: [] },
    sources: [], questions: [], projects: [], learningStates: [], sessions: [], modeProgress: [],
  })
  const ready = ref(false)
  const loading = ref(false)
  const error = ref('')

  const learningMap = computed(() => new Map(data.learningStates.map((state) => [state.questionId, state])))
  const questionMap = computed(() => new Map(data.questions.map((question) => [question.id, question])))

  async function init(): Promise<void> {
    if (ready.value || loading.value) return
    loading.value = true
    try {
      await repository.init()
      assignSnapshot(await repository.getSnapshot())
      ready.value = true
    } catch (cause) {
      error.value = (cause as Error).message
      throw cause
    } finally {
      loading.value = false
    }
  }

  function assignSnapshot(snapshot: AppSnapshot): void {
    data.schemaVersion = snapshot.schemaVersion
    data.settings.splitCaseQuestions = snapshot.settings?.splitCaseQuestions !== false
    data.settings.randomKeepOptionOrder = snapshot.settings?.randomKeepOptionOrder !== false
    data.settings.themeMode = ['LIGHT', 'DARK', 'SYSTEM'].includes(snapshot.settings?.themeMode ?? '')
      ? snapshot.settings.themeMode : 'SYSTEM'
    data.settings.totalPracticeDurationMs = Math.max(0, snapshot.settings?.totalPracticeDurationMs ?? 0)
    data.settings.totalPracticeCount = Math.max(0, snapshot.settings?.totalPracticeCount ?? 0)
    data.settings.projectPracticeCounts = { ...(snapshot.settings?.projectPracticeCounts ?? {}) }
    const snapshotOrder = Array.isArray(snapshot.settings?.projectOrder) ? snapshot.settings.projectOrder : []
    const projectIds = new Set(snapshot.projects.map((project) => project.id))
    const projectOrder = [
      ...snapshotOrder.filter((id, index) => projectIds.has(id) && snapshotOrder.indexOf(id) === index),
      ...snapshot.projects.map((project) => project.id).filter((id) => !snapshotOrder.includes(id)),
    ]
    data.settings.projectOrder = projectOrder
    data.sources.splice(0, data.sources.length, ...snapshot.sources)
    data.questions.splice(0, data.questions.length, ...snapshot.questions)
    const projectMap = new Map(snapshot.projects.map((project) => [project.id, project]))
    data.projects.splice(0, data.projects.length, ...projectOrder.map((id) => projectMap.get(id)).filter(Boolean) as QuizProject[])
    data.learningStates.splice(0, data.learningStates.length, ...snapshot.learningStates)
    data.sessions.splice(0, data.sessions.length, ...snapshot.sessions)
    data.modeProgress.splice(0, data.modeProgress.length, ...snapshot.modeProgress)
  }

  async function importWorkbook(parsed: ParsedWorkbook, enabledTypes: ImportQuestionType[] = [...IMPORT_QUESTION_TYPES]): Promise<void> {
    if (parsed.issues.some((issue) => issue.level === 'error')) throw new Error('请先修复导入错误')
    if (data.sources.some((source) => source.sha256 === parsed.source.sha256)) throw new Error('该 XLSX 已经导入')
    const enabled = new Set(enabledTypes)
    const questions = parsed.questions.map((question) => ({
      ...question,
      enabled: enabled.has(questionImportType(question)),
    }))
    const source = withSourceCounts(parsed.source, questions)
    if (!source.questionCount) throw new Error('所选题型没有可作答题目')
    await repository.importSource(source, questions)
    data.sources.unshift(source)
    data.questions.push(...questions)
  }

  async function updateSourceSelection(sourceId: string, enabledTypes: ImportQuestionType[]): Promise<void> {
    const source = data.sources.find((item) => item.id === sourceId)
    if (!source) throw new Error('找不到该 XLSX 题库')
    const enabled = new Set(enabledTypes)
    const questions = data.questions
      .filter((question) => question.sourceFileId === sourceId)
      .map((question) => ({ ...question, enabled: enabled.has(questionImportType(question)) }))
    const updatedSource = withSourceCounts(source, questions)
    await repository.updateSourceSelection(updatedSource, questions, enabledTypes)
    data.sources.splice(data.sources.indexOf(source), 1, updatedSource)
    const questionMap = new Map(questions.map((question) => [question.id, question]))
    data.questions.forEach((question, index) => {
      const updated = questionMap.get(question.id)
      if (updated) data.questions[index] = updated
    })
  }

  async function deleteSource(sourceId: string): Promise<void> {
    await repository.deleteSource(sourceId)
    assignSnapshot(await repository.getSnapshot())
  }

  async function saveProject(input: { id?: string; name: string; description: string; sourceIds: string[] }): Promise<QuizProject> {
    const now = new Date().toISOString()
    const existing = input.id ? data.projects.find((project) => project.id === input.id) : undefined
    const project: QuizProject = {
      id: existing?.id ?? createId(), name: input.name.trim(), description: input.description.trim(),
      sourceIds: [...input.sourceIds], createdAt: existing?.createdAt ?? now, updatedAt: now,
    }
    if (!project.name) throw new Error('请输入项目名称')
    if (isReservedProjectName(project.name)) throw new Error('项目名称不能与统计中心的默认重练名称相同')
    if (!project.sourceIds.length) throw new Error('请至少选择一个 XLSX 题库')
    await repository.saveProject(project)
    const index = data.projects.findIndex((item) => item.id === project.id)
    if (index >= 0) data.projects[index] = project
    else {
      data.projects.unshift(project)
      await persistProjectOrder(data.projects.map((item) => item.id))
    }
    return project
  }

  async function deleteProject(projectId: string): Promise<void> {
    await repository.deleteProject(projectId)
    data.projects.splice(0, data.projects.length, ...data.projects.filter((project) => project.id !== projectId))
    data.sessions.splice(0, data.sessions.length, ...data.sessions.filter((session) => session.projectId !== projectId))
    data.modeProgress.splice(0, data.modeProgress.length, ...data.modeProgress.filter((progress) => progress.projectId !== projectId))
    const projectPracticeCounts = { ...(data.settings.projectPracticeCounts ?? {}) }
    delete projectPracticeCounts[projectId]
    data.settings.projectPracticeCounts = projectPracticeCounts
    await persistProjectOrder(data.projects.map((project) => project.id))
  }

  async function reorderProjects(projectIds: string[]): Promise<void> {
    const currentIds = data.projects.map((project) => project.id)
    if (projectIds.length !== currentIds.length || new Set(projectIds).size !== currentIds.length
      || projectIds.some((id) => !currentIds.includes(id))) {
      throw new Error('项目排序数据无效')
    }
    const projectMap = new Map(data.projects.map((project) => [project.id, project]))
    const previousProjects = [...data.projects]
    data.projects.splice(0, data.projects.length, ...projectIds.map((id) => projectMap.get(id)) as QuizProject[])
    try {
      await persistProjectOrder(projectIds)
    } catch (error) {
      data.projects.splice(0, data.projects.length, ...previousProjects)
      throw error
    }
  }

  async function persistProjectOrder(projectIds: string[]): Promise<void> {
    const settings = { ...data.settings, projectOrder: [...projectIds] }
    await repository.saveSettings(settings)
    data.settings.projectOrder = [...projectIds]
  }

  function getProjectQuestions(projectId: string): Question[] {
    const project = data.projects.find((item) => item.id === projectId)
    if (!project) return []
    const sourceOrder = new Map(project.sourceIds.map((id, index) => [id, index]))
    return data.questions
      .filter((question) => sourceOrder.has(question.sourceFileId) && question.enabled !== false)
      .sort((left, right) => {
        const sourceDiff = (sourceOrder.get(left.sourceFileId) ?? 0) - (sourceOrder.get(right.sourceFileId) ?? 0)
        return sourceDiff || left.sortOrder - right.sortOrder
      })
  }

  function getProjectUnits(projectId: string): PracticeUnit[] {
    return buildPracticeUnits(getProjectQuestions(projectId), data.settings.splitCaseQuestions)
  }

  function getScopedProjectUnits(projectId: string, scope: PracticeScope): PracticeUnit[] {
    const units = getProjectUnits(projectId)
    if (scope === 'ALL') return units
    return units.filter((unit) => unit.questions.some((question) => (learningMap.value.get(question.id)?.wrongCount ?? 0) > 0))
  }

  async function startPractice(
    projectId: string,
    mode: PracticeMode,
    examConfig?: ExamConfig,
    scope: PracticeScope = 'ALL',
  ): Promise<PracticeSession> {
    const units = getScopedProjectUnits(projectId, scope)
    if (!units.length) throw new Error(scope === 'HISTORICAL_WRONG' ? '项目中没有历史错题' : '项目中没有可刷的题目')

    if (mode === 'ORDERED') {
      const scopedIds = units.map((unit) => unit.id)
      const unfinished = data.sessions.find((session) => (
        session.projectId === projectId
        && session.mode === 'ORDERED'
        && session.status === 'ACTIVE'
        && session.currentIndex < session.unitIds.length
        && hasSameUnitPool(session.unitIds, scopedIds)
      ))
      if (unfinished) return unfinished
    }

    let selectedUnits: PracticeUnit[] = []
    let progress = data.modeProgress.find((item) => item.projectId === projectId) ?? blankProgress(projectId)

    if (mode === 'EXAM') {
      if (!examConfig) throw new Error('缺少组卷配置')
      selectedUnits = selectExamUnits(units, examConfig)
      if (!selectedUnits.length) throw new Error('请至少选择一道题')
    } else if (mode === 'RANDOM_CYCLE') {
      const ids = units.map((unit) => unit.id)
      const signature = [...ids].sort().join('|')
      if (progress.randomSignature !== signature || progress.randomCursor >= progress.randomQueue.length) {
        progress = { ...progress, randomQueue: shuffle(ids), randomCursor: 0, randomSignature: signature }
        await persistProgress(progress)
      }
      const unitMap = new Map(units.map((unit) => [unit.id, unit]))
      selectedUnits = progress.randomQueue.slice(progress.randomCursor).map((id) => unitMap.get(id)).filter(Boolean) as PracticeUnit[]
    } else {
      if (progress.orderedCursor >= units.length) progress = { ...progress, orderedCursor: 0 }
      selectedUnits = [...units.slice(progress.orderedCursor), ...units.slice(0, progress.orderedCursor)]
    }

    const now = Date.now()
    const session: PracticeSession = {
      id: createId(), projectId, mode, entryKind: 'STANDARD', status: 'ACTIVE', startedAt: new Date(now).toISOString(),
      completedAt: null,
      deadline: mode === 'EXAM' && examConfig?.timeLimitMinutes
        ? new Date(now + examConfig.timeLimitMinutes * 60_000).toISOString() : null,
      unitIds: selectedUnits.map((unit) => unit.id), currentIndex: 0, answers: {}, gradedQuestionIds: [],
      correctCount: 0, wrongCount: 0, unansweredCount: 0,
      durationMs: 0, questionDurationMs: {}, config: examConfig ?? null,
      randomizeOptions: ['EXAM', 'RANDOM_CYCLE'].includes(mode) && data.settings.randomKeepOptionOrder === false,
    }
    await repository.saveSession(session)
    data.sessions.unshift(session)
    return session
  }

  async function startGlobalReview(mode: 'WRONG_REVIEW' | 'FAVORITE_REVIEW' | 'NOTE_REVIEW'): Promise<PracticeSession> {
    const eligible = new Set(data.learningStates
      .filter((state) => mode === 'WRONG_REVIEW'
        ? state.isWrongActive
        : mode === 'FAVORITE_REVIEW' ? state.isFavorite : Boolean(state.note.trim()))
      .map((state) => state.questionId))
    const units = buildPracticeUnits(data.questions.filter((question) => question.enabled !== false), data.settings.splitCaseQuestions)
      .filter((unit) => unit.questions.some((question) => eligible.has(question.id)))
    if (!units.length) throw new Error(mode === 'WRONG_REVIEW'
      ? '当前没有错题'
      : mode === 'FAVORITE_REVIEW' ? '当前没有收藏题' : '当前没有备注题目')
    const session: PracticeSession = {
      id: createId(), projectId: null, mode, entryKind: 'STANDARD', status: 'ACTIVE', startedAt: new Date().toISOString(), completedAt: null,
      deadline: null, unitIds: units.map((unit) => unit.id), currentIndex: 0, answers: {}, gradedQuestionIds: [],
      correctCount: 0, wrongCount: 0, unansweredCount: 0,
      durationMs: 0, questionDurationMs: {}, config: null, randomizeOptions: false,
    }
    await repository.saveSession(session)
    data.sessions.unshift(session)
    return session
  }

  async function startSingleQuestion(
    questionId: string,
    mode: 'WRONG_REVIEW' | 'FAVORITE_REVIEW' | 'NOTE_REVIEW',
  ): Promise<PracticeSession> {
    const question = data.questions.find((item) => item.id === questionId && item.enabled !== false && item.answerMode !== 'NONE')
    if (!question) throw new Error('找不到该题目')
    const session: PracticeSession = {
      id: createId(), projectId: null, mode, entryKind: 'SINGLE_QUESTION', status: 'ACTIVE', startedAt: new Date().toISOString(), completedAt: null,
      deadline: null, unitIds: [question.id], currentIndex: 0, answers: {}, gradedQuestionIds: [],
      correctCount: 0, wrongCount: 0, unansweredCount: 0,
      durationMs: 0, questionDurationMs: {}, config: null, randomizeOptions: false,
    }
    await repository.saveSession(session)
    data.sessions.unshift(session)
    return session
  }

  function getSessionUnits(session: PracticeSession): PracticeUnit[] {
    const questions = session.projectId ? getProjectQuestions(session.projectId) : data.questions.filter((question) => question.enabled !== false)
    const units = new Map(buildPracticeUnits(questions, data.settings.splitCaseQuestions).map((unit) => [unit.id, unit]))
    const resolved = session.unitIds
      .map((id) => units.get(id) ?? buildSingleQuestionUnit(questions, id) ?? buildLegacyCaseUnit(questions, id))
      .filter(Boolean) as PracticeUnit[]
    const ordered = session.randomizeOptions
      ? resolved.map((unit) => ({
        ...unit,
        questions: unit.questions.map((question) => randomizeChoiceOptions(question, `${session.id}:${question.id}`)),
      }))
      : resolved
    if (session.status === 'COMPLETED' && ['ORDERED', 'RANDOM_CYCLE'].includes(session.mode)) {
      return completedPracticeUnits(ordered, session.gradedQuestionIds)
    }
    return ordered
  }

  async function saveSession(session: PracticeSession): Promise<void> {
    await repository.saveSession(session)
  }

  async function deleteSessions(sessionIds: string[]): Promise<void> {
    if (!sessionIds.length) return
    await repository.deleteSessions(sessionIds)
    const ids = new Set(sessionIds)
    data.sessions.splice(0, data.sessions.length, ...data.sessions.filter((session) => !ids.has(session.id)))
  }

  async function restartCycleSession(session: PracticeSession): Promise<number> {
    if (!session.projectId || !['ORDERED', 'RANDOM_CYCLE'].includes(session.mode)) {
      throw new Error('当前模式不支持重刷')
    }
    const progress = data.modeProgress.find((item) => item.projectId === session.projectId) ?? blankProgress(session.projectId)
    let restartedIds: string[]
    let nextProgress: ModeProgress

    if (session.mode === 'RANDOM_CYCLE') {
      const pool = progress.randomQueue.length ? [...new Set(progress.randomQueue)] : [...new Set(session.unitIds)]
      restartedIds = reshuffleRemainingUnitIds(pool, 0)
      nextProgress = { ...progress, randomQueue: restartedIds, randomCursor: 0 }
    } else {
      const sessionPool = new Set(session.unitIds)
      const sourceOrderIds = getProjectUnits(session.projectId)
        .map((unit) => unit.id)
        .filter((id) => sessionPool.has(id))
      restartedIds = sourceOrderIds.length === sessionPool.size ? sourceOrderIds : [...session.unitIds]
      nextProgress = { ...progress, orderedCursor: 0 }
    }

    session.unitIds.splice(0, session.unitIds.length, ...restartedIds)
    session.currentIndex = 0
    session.answers = {}
    session.gradedQuestionIds.splice(0)
    session.correctCount = 0
    session.wrongCount = 0
    session.unansweredCount = 0
    session.durationMs = 0
    session.questionDurationMs = {}
    session.startedAt = new Date().toISOString()
    session.completedAt = null
    session.status = 'ACTIVE'
    await persistProgress(nextProgress)
    await repository.saveSession(session)
    return restartedIds.length
  }

  async function gradeUnit(session: PracticeSession, unit: PracticeUnit): Promise<void> {
    for (const question of unit.questions) {
      if (session.gradedQuestionIds.includes(question.id)) continue
      const selected = session.answers[question.id] ?? ''
      const result = gradeQuestion(question, selected)
      await recordLearning(
        question.id, selected, result.correct, result.unanswered, session.mode,
        session.questionDurationMs[question.id] ?? 0,
      )
      session.gradedQuestionIds.push(question.id)
      if (result.correct) session.correctCount += 1
      else if (result.unanswered) session.unansweredCount += 1
      else session.wrongCount += 1
    }
    if (session.projectId) await advanceProgress(session)
    await repository.saveSession(session)
  }

  async function finishSession(session: PracticeSession): Promise<void> {
    if (session.status === 'COMPLETED') return
    const units = getSessionUnits(session)
    if (session.mode === 'EXAM') await gradeExamUnits(session, units)
    else for (const unit of units) await gradeUnit(session, unit)
    const completedSession: PracticeSession = {
      ...session,
      status: 'COMPLETED',
      completedAt: new Date().toISOString(),
    }
    await repository.saveSession(completedSession)
    await recordCompletedPractice(completedSession.durationMs, completedSession.projectId)
    Object.assign(session, completedSession)
  }

  async function gradeExamUnits(session: PracticeSession, units: PracticeUnit[]): Promise<void> {
    const graded = new Set(session.gradedQuestionIds)
    const newlyGradedIds: string[] = []
    const learningStates: LearningState[] = []
    let correctCount = session.correctCount
    let wrongCount = session.wrongCount
    let unansweredCount = session.unansweredCount

    for (const question of units.flatMap((unit) => unit.questions)) {
      if (graded.has(question.id)) continue
      const selected = session.answers[question.id] ?? ''
      const result = gradeQuestion(question, selected)
      if (!result.unanswered) {
        learningStates.push(buildLearningState(
          question.id, selected, result.correct, false, session.mode,
          session.questionDurationMs[question.id] ?? 0,
        ))
      }
      graded.add(question.id)
      newlyGradedIds.push(question.id)
      if (result.correct) correctCount += 1
      else if (result.unanswered) unansweredCount += 1
      else wrongCount += 1
    }

    await repository.saveLearningStates(learningStates)
    applyLearningStates(learningStates)
    session.gradedQuestionIds.push(...newlyGradedIds)
    session.correctCount = correctCount
    session.wrongCount = wrongCount
    session.unansweredCount = unansweredCount
  }

  async function finishPartialPracticeSession(session: PracticeSession): Promise<boolean> {
    if (!['ORDERED', 'RANDOM_CYCLE'].includes(session.mode) || session.status !== 'ACTIVE') return false
    const sessionUnits = getSessionUnits(session)
    const completedIds = completedPracticeUnitIds(sessionUnits, session.gradedQuestionIds)
    if (!completedIds.length) return false

    const completedIdSet = new Set(completedIds)
    const completedQuestionIds = new Set(sessionUnits
      .filter((unit) => completedIdSet.has(unit.id))
      .flatMap((unit) => unit.questions.map((question) => question.id)))
    const summarizedSession: PracticeSession = {
      ...session,
      unitIds: completedIds,
      currentIndex: Math.min(session.currentIndex, Math.max(0, completedIds.length - 1)),
      answers: Object.fromEntries(Object.entries(session.answers)
        .filter(([questionId]) => completedQuestionIds.has(questionId))),
      gradedQuestionIds: session.gradedQuestionIds
        .filter((questionId) => completedQuestionIds.has(questionId)),
      status: 'COMPLETED',
      completedAt: new Date().toISOString(),
    }
    await repository.saveSession(summarizedSession)
    await recordCompletedPractice(summarizedSession.durationMs, summarizedSession.projectId)
    Object.assign(session, summarizedSession)
    return true
  }

  async function recordCompletedPractice(durationMs: number, projectId: string | null): Promise<void> {
    const projectPracticeCounts = { ...(data.settings.projectPracticeCounts ?? {}) }
    if (projectId) projectPracticeCounts[projectId] = (projectPracticeCounts[projectId] ?? 0) + 1
    const settings = {
      ...data.settings,
      totalPracticeDurationMs: data.settings.totalPracticeDurationMs + Math.max(0, durationMs),
      totalPracticeCount: data.settings.totalPracticeCount + 1,
      projectPracticeCounts,
    }
    await repository.saveSettings(settings)
    data.settings.totalPracticeDurationMs = settings.totalPracticeDurationMs
    data.settings.totalPracticeCount = settings.totalPracticeCount
    data.settings.projectPracticeCounts = settings.projectPracticeCounts
  }

  async function recordLearning(
    questionId: string, selected: string, correct: boolean, unanswered: boolean, mode: PracticeMode,
    durationMs: number,
  ): Promise<void> {
    const state = buildLearningState(questionId, selected, correct, unanswered, mode, durationMs)
    await repository.saveLearningState(state)
    applyLearningState(state)
  }

  function buildLearningState(
    questionId: string, selected: string, correct: boolean, unanswered: boolean, mode: PracticeMode,
    durationMs: number,
  ): LearningState {
    const current = learningMap.value.get(questionId) ?? blankLearning(questionId)
    return {
      ...current,
      attemptCount: current.attemptCount + 1,
      correctCount: current.correctCount + Number(correct),
      wrongCount: current.wrongCount + Number(!correct && !unanswered),
      unansweredCount: current.unansweredCount + Number(unanswered),
      isWrongActive: correct && mode === 'WRONG_REVIEW' ? false : (!correct ? true : current.isWrongActive),
      lastAnswer: selected,
      lastResult: correct ? 'CORRECT' : unanswered ? 'UNANSWERED' : 'WRONG',
      lastAnsweredAt: new Date().toISOString(),
      totalDurationMs: current.totalDurationMs + Math.max(0, durationMs),
    }
  }

  function applyLearningState(state: LearningState): void {
    const index = data.learningStates.findIndex((item) => item.questionId === state.questionId)
    if (index >= 0) data.learningStates[index] = state
    else data.learningStates.push(state)
  }

  function applyLearningStates(states: LearningState[]): void {
    const indexes = new Map(data.learningStates.map((state, index) => [state.questionId, index]))
    for (const state of states) {
      const index = indexes.get(state.questionId)
      if (index === undefined) {
        indexes.set(state.questionId, data.learningStates.length)
        data.learningStates.push(state)
      } else {
        data.learningStates[index] = state
      }
    }
  }

  async function toggleFavorite(questionId: string): Promise<void> {
    const current = learningMap.value.get(questionId) ?? blankLearning(questionId)
    const state = { ...current, isFavorite: !current.isFavorite }
    await repository.saveLearningState(state)
    const index = data.learningStates.findIndex((item) => item.questionId === questionId)
    if (index >= 0) data.learningStates[index] = state
    else data.learningStates.push(state)
  }

  async function saveQuestionNote(questionId: string, note: string): Promise<void> {
    const current = learningMap.value.get(questionId) ?? blankLearning(questionId)
    const state = { ...current, note: note.trim() }
    await repository.saveLearningState(state)
    const index = data.learningStates.findIndex((item) => item.questionId === questionId)
    if (index >= 0) data.learningStates[index] = state
    else data.learningStates.push(state)
  }

  async function correctAnswer(questionId: string, answer: string): Promise<number> {
    const question = data.questions.find((item) => item.id === questionId)
    if (!question) throw new Error('找不到该题目')
    const currentLearning = learningMap.value.get(questionId) ?? blankLearning(questionId)
    const correction = buildAnswerCorrection(question, answer, currentLearning, data.sessions)
    await repository.applyAnswerCorrection(correction.question, correction.learningState, correction.sessions)

    const questionIndex = data.questions.findIndex((item) => item.id === questionId)
    if (questionIndex >= 0) Object.assign(data.questions[questionIndex] as Question, correction.question)
    const learningIndex = data.learningStates.findIndex((item) => item.questionId === questionId)
    if (learningIndex >= 0) data.learningStates[learningIndex] = correction.learningState
    else data.learningStates.push(correction.learningState)
    const correctedSessionMap = new Map(correction.sessions.map((session) => [session.id, session]))
    data.sessions.forEach((session, index) => {
      const corrected = correctedSessionMap.get(session.id)
      if (corrected) data.sessions[index] = corrected
    })
    return correction.correctedAttemptCount
  }

  async function setSplitCaseQuestions(value: boolean): Promise<void> {
    const settings = { ...data.settings, splitCaseQuestions: value }
    await repository.saveSettings(settings)
    data.settings.splitCaseQuestions = value
  }

  async function setRandomKeepOptionOrder(value: boolean): Promise<void> {
    const settings = { ...data.settings, randomKeepOptionOrder: value }
    await repository.saveSettings(settings)
    data.settings.randomKeepOptionOrder = value
  }

  async function setThemeMode(value: 'LIGHT' | 'DARK' | 'SYSTEM'): Promise<void> {
    const settings = { ...data.settings, themeMode: value }
    await repository.saveSettings(settings)
    data.settings.themeMode = value
  }

  async function advanceProgress(session: PracticeSession): Promise<void> {
    if (!session.projectId || !['ORDERED', 'RANDOM_CYCLE'].includes(session.mode)) return
    const current = data.modeProgress.find((item) => item.projectId === session.projectId) ?? blankProgress(session.projectId)
    const next = session.mode === 'ORDERED'
      ? { ...current, orderedCursor: (current.orderedCursor + 1) % Math.max(1, session.unitIds.length) }
      : { ...current, randomCursor: Math.min(current.randomCursor + 1, current.randomQueue.length) }
    await persistProgress(next)
  }

  async function persistProgress(progress: ModeProgress): Promise<void> {
    await repository.saveModeProgress(progress)
    const index = data.modeProgress.findIndex((item) => item.projectId === progress.projectId)
    if (index >= 0) data.modeProgress[index] = progress
    else data.modeProgress.push(progress)
  }

  function getProjectStats(projectId: string): ProjectStats {
    const questions = getProjectQuestions(projectId).filter((question) => question.answerMode !== 'NONE')
    return calculateStats(questions)
  }

  function calculateStats(questions: Question[]): ProjectStats {
    const states = questions.map((question) => learningMap.value.get(question.id)).filter(Boolean) as LearningState[]
    const attempts = states.reduce((sum, state) => sum + state.attemptCount, 0)
    const correct = states.reduce((sum, state) => sum + state.correctCount, 0)
    const modes = ['SINGLE', 'MULTIPLE', 'JUDGE', 'FILL'] as const
    const byMode = Object.fromEntries(modes.map((mode) => {
      const modeQuestions = questions.filter((question) => question.answerMode === mode)
      const modeStates = modeQuestions.map((question) => learningMap.value.get(question.id)).filter(Boolean) as LearningState[]
      const modeAttempts = modeStates.reduce((sum, state) => sum + state.attemptCount, 0)
      const modeCorrect = modeStates.reduce((sum, state) => sum + state.correctCount, 0)
      return [mode, {
        total: modeQuestions.length,
        attempted: modeStates.filter((state) => state.attemptCount > 0).length,
        attempts: modeAttempts,
        correctRate: modeAttempts ? modeCorrect / modeAttempts : 0,
      }]
    })) as ProjectStats['byMode']
    return {
      total: questions.length, attempted: states.filter((state) => state.attemptCount > 0).length,
      correct, wrongActive: states.filter((state) => state.isWrongActive).length,
      favorites: states.filter((state) => state.isFavorite).length, attempts,
      correctRate: attempts ? correct / attempts : 0, byMode,
    }
  }

  async function restoreSnapshot(snapshot: AppSnapshot): Promise<void> {
    await repository.replaceSnapshot(snapshot)
    assignSnapshot(await repository.getSnapshot())
  }

  function exportSnapshot(): AppSnapshot {
    return JSON.parse(JSON.stringify(data)) as AppSnapshot
  }

  return {
    data, ready, loading, error, learningMap, questionMap,
    init, importWorkbook, updateSourceSelection, deleteSource, saveProject, deleteProject, reorderProjects, getProjectQuestions, getProjectUnits, getScopedProjectUnits,
    startPractice, startGlobalReview, startSingleQuestion, getSessionUnits, saveSession, deleteSessions, restartCycleSession, gradeUnit, finishSession,
    finishPartialPracticeSession,
    toggleFavorite, saveQuestionNote, correctAnswer, setSplitCaseQuestions, setRandomKeepOptionOrder, setThemeMode, getProjectStats, calculateStats, restoreSnapshot, exportSnapshot,
  }
})

function withSourceCounts(source: SourceFile, questions: Question[]): SourceFile {
  const enabled = questions.filter((question) => question.enabled !== false)
  return {
    ...source,
    questionCount: enabled.filter((question) => question.answerMode !== 'NONE').length,
    caseCount: enabled.filter((question) => question.nodeType === 'CASE').length,
  }
}
