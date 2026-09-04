import type { AnswerMode, ExamConfig, PracticeSession, PracticeUnit, Question } from '@/domain/models'
import { questionAnswerIsCorrect, seededShuffle, shuffle } from '@/domain/utils'

const DISPLAY_ANSWER_KEYS = 'ABCDEFGHI'

export function randomizeChoiceOptions(question: Question, seed: string): Question {
  if (!['SINGLE', 'MULTIPLE'].includes(question.answerMode) || question.options.length <= 1) return question
  const shuffled = seededShuffle(question.options, seed)
  if (shuffled.every((option, index) => option.key === question.options[index]?.key)) {
    shuffled.push(shuffled.shift() as Question['options'][number])
  }
  return {
    ...question,
    options: shuffled.map((option, index) => ({
      ...option,
      displayKey: DISPLAY_ANSWER_KEYS[index] ?? option.key,
    })),
  }
}

export function buildPracticeUnits(questions: Question[], splitCaseQuestions = true): PracticeUnit[] {
  const questionMap = new Map(questions.map((question) => [question.id, question]))
  if (!splitCaseQuestions) {
    const groupedUnits: PracticeUnit[] = []
    questions.forEach((question) => {
      if (question.nodeType === 'CASE') {
        const children = questions.filter((item) => item.parentId === question.id && item.answerMode !== 'NONE')
        if (children.length) groupedUnits.push({ id: question.id, context: question, questions: children })
        return
      }
      if (question.answerMode === 'NONE' || (question.parentId && questionMap.has(question.parentId))) return
      groupedUnits.push({ id: question.id, context: null, questions: [question] })
    })
    return groupedUnits
  }
  return questions
    .filter((question) => question.answerMode !== 'NONE')
    .map((question) => ({
      id: question.id,
      context: question.parentId ? questionMap.get(question.parentId) ?? null : null,
      questions: [question],
    }))
}

export function buildSingleQuestionUnit(questions: Question[], questionId: string): PracticeUnit | null {
  const question = questions.find((item) => item.id === questionId && item.answerMode !== 'NONE')
  if (!question) return null
  const context = question.parentId
    ? questions.find((item) => item.id === question.parentId && item.nodeType === 'CASE') ?? null
    : null
  return { id: question.id, context, questions: [question] }
}

export function buildLegacyCaseUnit(questions: Question[], caseId: string): PracticeUnit | null {
  const context = questions.find((question) => question.id === caseId && question.nodeType === 'CASE')
  if (!context) return null
  const children = questions.filter((question) => question.parentId === caseId && question.answerMode !== 'NONE')
  return children.length ? { id: context.id, context, questions: children } : null
}

export function reshuffleRemainingUnitIds(unitIds: string[], pendingIndex: number): string[] {
  const completed = unitIds.slice(0, pendingIndex)
  const originalRemaining = unitIds.slice(pendingIndex)
  const randomized = shuffle(originalRemaining)
  if (randomized.length > 1 && randomized.every((id, index) => id === originalRemaining[index])) {
    randomized.push(randomized.shift() as string)
  }
  return [...completed, ...randomized]
}

export function hasSameUnitPool(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false
  const expected = new Set(right)
  return expected.size === right.length && new Set(left).size === left.length && left.every((id) => expected.has(id))
}

export function selectExamUnits(units: PracticeUnit[], config: ExamConfig): PracticeUnit[] {
  const pools: Record<'SINGLE' | 'MULTIPLE' | 'JUDGE' | 'FILL' | 'CASE', PracticeUnit[]> = {
    SINGLE: [], MULTIPLE: [], JUDGE: [], FILL: [], CASE: [],
  }
  units.forEach((unit) => {
    if (unit.context?.nodeType === 'CASE') pools.CASE.push(unit)
    else {
      const mode = unit.questions[0]?.answerMode
      if (mode && mode !== 'NONE') pools[mode].push(unit)
    }
  })
  const requests: Array<[keyof typeof pools, number]> = [
    ['SINGLE', config.singleCount], ['MULTIPLE', config.multipleCount],
    ['JUDGE', config.judgeCount], ['FILL', config.fillCount ?? 0], ['CASE', config.caseCount],
  ]
  for (const [type, count] of requests) {
    if (count < 0 || count > pools[type].length) throw new Error(`${type} 题目数量不足：需要 ${count}，现有 ${pools[type].length}`)
  }
  return requests.flatMap(([type, count]) => shuffle(pools[type]).slice(0, count))
}

export function gradeQuestion(question: Question, selected: string): { correct: boolean; unanswered: boolean } {
  const unanswered = !selected
  return { correct: !unanswered && questionAnswerIsCorrect(question, selected), unanswered }
}

export function countAnswerable(units: PracticeUnit[]): number {
  return units.reduce((total, unit) => total + unit.questions.length, 0)
}

export function completedPracticeUnitIds(units: PracticeUnit[], gradedQuestionIds: string[]): string[] {
  return completedPracticeUnits(units, gradedQuestionIds).map((unit) => unit.id)
}

export function completedPracticeUnits(units: PracticeUnit[], gradedQuestionIds: string[]): PracticeUnit[] {
  const graded = new Set(gradedQuestionIds)
  return units
    .filter((unit) => unit.questions.length > 0 && unit.questions.every((question) => graded.has(question.id)))
}

export function cycleProgressNumber(cursor: number, total: number, currentGraded: boolean): number {
  if (total <= 0) return 0
  const currentCursor = cursor - Number(currentGraded)
  return ((currentCursor % total) + total) % total + 1
}

export function cycleSessionProgressNumber(
  cursor: number,
  total: number,
  completedUnitCount: number,
  currentIndex: number,
): number {
  if (total <= 0) return 0
  const sessionStart = ((cursor - completedUnitCount) % total + total) % total
  return (sessionStart + Math.max(0, currentIndex)) % total + 1
}

export function isCycleSessionComplete(current: number, total: number, currentGraded: boolean): boolean {
  return currentGraded && total > 0 && current === total
}

export function isCycleProgressComplete(cursor: number, total: number, currentGraded: boolean): boolean {
  return currentGraded && total > 0 && cycleProgressNumber(cursor, total, true) === total
}

export function isGroupReviewSession(session: PracticeSession): boolean {
  return session.entryKind === 'STANDARD'
    && ['WRONG_REVIEW', 'FAVORITE_REVIEW', 'NOTE_REVIEW'].includes(session.mode)
}

export function shouldCompleteGroupReviewOnLeave(
  session: PracticeSession,
  unitCount: number,
  currentUnitGraded: boolean,
): boolean {
  return session.status === 'ACTIVE'
    && isGroupReviewSession(session)
    && unitCount > 0
    && session.currentIndex === unitCount - 1
    && currentUnitGraded
}

export function shouldShowSingleQuestionResultOnLeave(session: PracticeSession): boolean {
  return session.entryKind === 'SINGLE_QUESTION'
    && session.status === 'COMPLETED'
    && session.gradedQuestionIds.length > 0
}

export function modeLabel(mode: AnswerMode): string {
  return { SINGLE: '单选题', MULTIPLE: '多选题', JUDGE: '判断题', FILL: '填空题', NONE: '案例题' }[mode]
}
