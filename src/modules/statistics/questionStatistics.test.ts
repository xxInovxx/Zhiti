import { describe, expect, it } from 'vitest'
import type { LearningState, Question } from '@/domain/models'
import { buildQuestionStatisticsRows, defaultStatisticsSortDirection, sortQuestionStatisticsRows } from './questionStatistics'

function question(id: string, sortOrder: number): Question {
  return {
    id, sortOrder, sourceFileId: 'source', sheetName: '题库', sourceRow: sortOrder,
    parentId: null, nodeType: 'NORMAL', answerMode: 'SINGLE', stem: id,
    normalizedAnswer: 'A', acceptedAnswers: [], explanation: '', fingerprint: id, options: [{ key: 'A', text: '答案' }],
  }
}

function learning(questionId: string, attempts: number, correct: number, wrong: number): LearningState {
  return {
    questionId, attemptCount: attempts, correctCount: correct, wrongCount: wrong, unansweredCount: 0,
    isWrongActive: false, isFavorite: false, note: '', lastAnswer: '', lastResult: null,
    lastAnsweredAt: null, totalDurationMs: 0,
  }
}

describe('题目学习统计排序', () => {
  const questions = [question('q1', 1), question('q2', 2), question('q3', 3)]
  const states = new Map([
    ['q1', learning('q1', 5, 4, 1)],
    ['q2', learning('q2', 2, 0, 2)],
  ])
  const rows = buildQuestionStatisticsRows(questions, states)

  it('初始顺序默认正序，统计指标默认倒序', () => {
    expect(defaultStatisticsSortDirection('INITIAL')).toBe('ASC')
    expect(defaultStatisticsSortDirection('ATTEMPTS')).toBe('DESC')
    expect(defaultStatisticsSortDirection('WRONGS')).toBe('DESC')
    expect(defaultStatisticsSortDirection('ACCURACY')).toBe('DESC')
  })

  it('显示未作答题目并计算累计正确率', () => {
    expect(rows).toHaveLength(3)
    expect(rows[0]?.correctRate).toBe(0.8)
    expect(rows[2]?.attemptCount).toBe(0)
  })

  it('支持按做过次数正序和倒序', () => {
    expect(sortQuestionStatisticsRows(rows, 'ATTEMPTS', 'ASC').map((row) => row.question.id)).toEqual(['q3', 'q2', 'q1'])
    expect(sortQuestionStatisticsRows(rows, 'ATTEMPTS', 'DESC').map((row) => row.question.id)).toEqual(['q1', 'q2', 'q3'])
  })

  it('支持按错误次数和初始顺序倒序', () => {
    expect(sortQuestionStatisticsRows(rows, 'WRONGS', 'DESC').map((row) => row.question.id)).toEqual(['q2', 'q1', 'q3'])
    expect(sortQuestionStatisticsRows(rows, 'INITIAL', 'DESC').map((row) => row.question.id)).toEqual(['q3', 'q2', 'q1'])
  })

  it('支持按总正确率正序和倒序', () => {
    expect(sortQuestionStatisticsRows(rows, 'ACCURACY', 'ASC').map((row) => row.question.id)).toEqual(['q2', 'q3', 'q1'])
    expect(sortQuestionStatisticsRows(rows, 'ACCURACY', 'DESC').map((row) => row.question.id)).toEqual(['q1', 'q2', 'q3'])
  })
})
