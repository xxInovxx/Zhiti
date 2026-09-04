import { describe, expect, it } from 'vitest'
import type { PracticeSession, QuizProject } from '@/domain/models'
import { buildPracticeHistory, filterPracticeHistory, practiceHistoryProjectKey, practiceModeLabel } from './practiceHistory'

function session(partial: Partial<PracticeSession>): PracticeSession {
  return {
    id: 'session', projectId: 'project', mode: 'ORDERED', entryKind: 'STANDARD', status: 'COMPLETED',
    startedAt: '2026-01-01T08:00:00.000Z', completedAt: '2026-01-01T08:10:00.000Z',
    deadline: null, unitIds: [], currentIndex: 0, answers: {}, gradedQuestionIds: [],
    correctCount: 8, wrongCount: 1, unansweredCount: 1,
    durationMs: 600_000, questionDurationMs: {}, config: null, ...partial,
  }
}

const project: QuizProject = {
  id: 'project', name: '安规练习', description: '', sourceIds: [],
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
}

describe('学习历史', () => {
  it('仅显示已完成会话并计算题量和正确率', () => {
    const rows = buildPracticeHistory([
      session({ id: 'done' }),
      session({ id: 'active', status: 'ACTIVE', completedAt: null }),
    ], [project])
    expect(rows).toHaveLength(1)
    expect(rows[0]?.projectName).toBe('安规练习')
    expect(rows[0]?.questionCount).toBe(10)
    expect(rows[0]?.correctRate).toBe(0.8)
  })

  it('按刷题完成时间倒序显示', () => {
    const rows = buildPracticeHistory([
      session({ id: 'older' }),
      session({ id: 'newer', completedAt: '2026-02-01T08:10:00.000Z' }),
    ], [project])
    expect(rows.map((row) => row.session.id)).toEqual(['newer', 'older'])
  })

  it('不显示已经删除项目的历史记录', () => {
    const rows = buildPracticeHistory([
      session({ id: 'existing-project' }),
      session({ id: 'deleted-project', projectId: 'missing' }),
      session({ id: 'global-review', projectId: null, mode: 'WRONG_REVIEW' }),
    ], [project])
    expect(rows.map((row) => row.session.id)).toEqual(['existing-project', 'global-review'])
  })

  it('可以组合筛选时间、项目和刷题模式', () => {
    const anotherProject: QuizProject = { ...project, id: 'project-2', name: '专项题库' }
    const rows = buildPracticeHistory([
      session({ id: 'matched', projectId: 'project-2', mode: 'EXAM', completedAt: '2026-08-15T09:00:00.000Z' }),
      session({ id: 'wrong-mode', projectId: 'project-2', mode: 'ORDERED', completedAt: '2026-08-15T09:00:00.000Z' }),
      session({ id: 'wrong-project', projectId: 'project', mode: 'EXAM', completedAt: '2026-08-15T09:00:00.000Z' }),
      session({ id: 'too-old', projectId: 'project-2', mode: 'EXAM', completedAt: '2026-07-01T09:00:00.000Z' }),
    ], [project, anotherProject])

    const filtered = filterPracticeHistory(rows, {
      timeRange: 'LAST_7_DAYS', projectKey: 'project-2', mode: 'EXAM',
    }, new Date('2026-08-16T10:00:00.000Z'))

    expect(filtered.map((row) => row.session.id)).toEqual(['matched'])
  })

  it('为无项目的专项练习生成稳定筛选键', () => {
    const [row] = buildPracticeHistory([
      session({ projectId: null, mode: 'WRONG_REVIEW' }),
    ], [])
    expect(row && practiceHistoryProjectKey(row)).toBe('special:统计中心 · 错题重练')
  })

  it('正确显示备注重练的模式名称', () => {
    expect(practiceModeLabel('NOTE_REVIEW')).toBe('备注重练')
    const [row] = buildPracticeHistory([session({ projectId: null, mode: 'NOTE_REVIEW' })], [])
    expect(row?.projectName).toBe('统计中心 · 备注重练')
  })

  it('支持筛选近 5 天的记录', () => {
    const rows = buildPracticeHistory([
      session({ id: 'recent', completedAt: '2026-08-13T10:00:00.000Z' }),
      session({ id: 'old', completedAt: '2026-08-10T09:59:59.000Z' }),
    ], [project])
    const filtered = filterPracticeHistory(rows, {
      timeRange: 'LAST_5_DAYS', projectKey: 'ALL', mode: 'ALL',
    }, new Date('2026-08-15T10:00:00.000Z'))
    expect(filtered.map((row) => row.session.id)).toEqual(['recent'])
  })

  it('支持筛选近 3 天的记录', () => {
    const rows = buildPracticeHistory([
      session({ id: 'recent', completedAt: '2026-08-14T10:00:00.000Z' }),
      session({ id: 'old', completedAt: '2026-08-12T09:59:59.000Z' }),
    ], [project])
    const filtered = filterPracticeHistory(rows, {
      timeRange: 'LAST_3_DAYS', projectKey: 'ALL', mode: 'ALL',
    }, new Date('2026-08-15T10:00:00.000Z'))
    expect(filtered.map((row) => row.session.id)).toEqual(['recent'])
  })
})
