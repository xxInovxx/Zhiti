import { describe, expect, it } from 'vitest'
import type { LearningState, PracticeSession, Question } from '@/domain/models'
import { buildFillAnswerCorrection } from './fillAnswerCorrection'

const question: Question = {
  id: 'q1', sourceFileId: 's1', sheetName: '题库', sourceRow: 2, parentId: null,
  nodeType: 'NORMAL', answerMode: 'FILL', stem: '填空', normalizedAnswer: '标准答案。',
  acceptedAnswers: [], explanation: '', sortOrder: 0, fingerprint: 'q1', options: [],
}
const state: LearningState = {
  questionId: 'q1', attemptCount: 2, correctCount: 0, wrongCount: 2, unansweredCount: 0,
  isWrongActive: true, isFavorite: false, note: '', lastAnswer: '补充答案！', lastResult: 'WRONG',
  lastAnsweredAt: '2026-01-01T00:00:00.000Z', totalDurationMs: 1_000,
}
const session: PracticeSession = {
  id: 'session', projectId: 'project', mode: 'ORDERED', entryKind: 'STANDARD', status: 'COMPLETED',
  startedAt: '2026-01-01T00:00:00.000Z', completedAt: '2026-01-01T00:01:00.000Z', deadline: null,
  unitIds: ['q1'], currentIndex: 0, answers: { q1: '补充答案!' }, gradedQuestionIds: ['q1'],
  correctCount: 0, wrongCount: 1, unansweredCount: 0, durationMs: 1_000,
  questionDurationMs: { q1: 1_000 }, config: null,
}

describe('填空题答案修正', () => {
  it('新增正确答案并把对应会话和全局学习次数改判为正确', () => {
    const result = buildFillAnswerCorrection(question, '补充答案！', state, [session])
    expect(result.question.acceptedAnswers).toEqual(['补充答案!'])
    expect(result.sessions[0]).toMatchObject({ correctCount: 1, wrongCount: 0 })
    expect(result.learningState).toMatchObject({ correctCount: 1, wrongCount: 1, lastResult: 'CORRECT', isWrongActive: false })
    expect(result.correctedAttemptCount).toBe(1)
  })

  it('拒绝重复添加已等价的中英文标点答案', () => {
    expect(() => buildFillAnswerCorrection(question, '标准答案.', state, [session]))
      .toThrow('该答案已经是正确答案')
  })
})
