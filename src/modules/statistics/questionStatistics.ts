import type { LearningState, Question } from '@/domain/models'

export type StatisticsSortKey = 'INITIAL' | 'ATTEMPTS' | 'WRONGS' | 'ACCURACY'
export type StatisticsSortDirection = 'ASC' | 'DESC'

export interface QuestionStatisticsRow {
  question: Question
  initialOrder: number
  attemptCount: number
  correctCount: number
  wrongCount: number
  correctRate: number
}

export function defaultStatisticsSortDirection(sortKey: StatisticsSortKey): StatisticsSortDirection {
  return sortKey === 'INITIAL' ? 'ASC' : 'DESC'
}

export function buildQuestionStatisticsRows(
  questions: Question[],
  learningMap: Map<string, LearningState>,
): QuestionStatisticsRow[] {
  return questions
    .filter((question) => question.answerMode !== 'NONE')
    .map((question, initialOrder) => {
      const state = learningMap.get(question.id)
      const attemptCount = state?.attemptCount ?? 0
      const correctCount = state?.correctCount ?? 0
      return {
        question,
        initialOrder,
        attemptCount,
        correctCount,
        wrongCount: state?.wrongCount ?? 0,
        correctRate: attemptCount ? correctCount / attemptCount : 0,
      }
    })
}

export function sortQuestionStatisticsRows(
  rows: QuestionStatisticsRow[],
  sortKey: StatisticsSortKey,
  direction: StatisticsSortDirection,
): QuestionStatisticsRow[] {
  const multiplier = direction === 'ASC' ? 1 : -1
  return [...rows].sort((left, right) => {
    if (sortKey === 'INITIAL') return (left.initialOrder - right.initialOrder) * multiplier
    const difference = sortKey === 'ATTEMPTS'
      ? left.attemptCount - right.attemptCount
      : sortKey === 'WRONGS'
        ? left.wrongCount - right.wrongCount
        : left.correctRate - right.correctRate
    return difference * multiplier || left.initialOrder - right.initialOrder
  })
}
