import { describe, expect, it } from 'vitest'
import type { PracticeSession, PracticeUnit, Question } from '@/domain/models'
import { buildSessionReviewItems } from './sessionReview'

const question: Question = {
  id: 'q1', sourceFileId: 'source-1', sheetName: '题库', sourceRow: 2,
  parentId: null, nodeType: 'NORMAL', answerMode: 'SINGLE', stem: '题目',
  options: [{ key: 'A', text: '选项 A' }], normalizedAnswer: 'A', acceptedAnswers: [], explanation: '',
  sortOrder: 0, fingerprint: 'fingerprint-1',
}

const session: PracticeSession = {
  id: 'session-1', projectId: 'project-1', mode: 'ORDERED', entryKind: 'STANDARD', status: 'COMPLETED',
  startedAt: '2026-01-01T00:00:00.000Z', completedAt: '2026-01-01T00:01:00.000Z',
  deadline: null, unitIds: ['q1'], currentIndex: 0, answers: { q1: 'A' },
  gradedQuestionIds: ['q1'], correctCount: 1, wrongCount: 0, unansweredCount: 0,
  durationMs: 12_000, questionDurationMs: { q1: 12_000 }, config: null,
}

describe('练习解析数据', () => {
  it('按练习顺序构建题目解析并保留答案与用时', () => {
    const units: PracticeUnit[] = [{ id: 'q1', context: null, questions: [question] }]
    expect(buildSessionReviewItems(session, units)).toMatchObject([
      { question, ownAnswer: 'A', durationMs: 12_000, correct: true, index: 0 },
    ])
  })
})
