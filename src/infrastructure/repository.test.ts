import { describe, expect, it } from 'vitest'
import type { AppSnapshot } from '@/domain/models'
import { emptySnapshot, normalizeSnapshot } from './repository'
import { WebRepository } from './webRepository'

describe('应用设置兼容', () => {
  it('可批量保存多道题的学习状态', async () => {
    const repository = new WebRepository()
    const state = {
      questionId: 'q1', attemptCount: 1, correctCount: 1, wrongCount: 0, unansweredCount: 0,
      isWrongActive: false, isFavorite: false, note: '', lastAnswer: 'A', lastResult: 'CORRECT' as const,
      lastAnsweredAt: null, totalDurationMs: 1000,
    }

    await repository.saveLearningStates([state, { ...state, questionId: 'q2', lastAnswer: 'B' }])

    expect((await repository.getSnapshot()).learningStates.map((item) => item.questionId)).toEqual(['q1', 'q2'])
  })

  it('停用题型只隐藏题目并保留学习记录，重新启用后可恢复', async () => {
    const repository = new WebRepository()
    const source = { id: 'source-1', name: '题库.xlsx', sha256: 'hash-1', importedAt: '', sheets: [], questionCount: 1, caseCount: 0 }
    const question = {
      id: 'question-1', sourceFileId: source.id, sheetName: 'Sheet1', sourceRow: 2, parentId: null,
      nodeType: 'NORMAL' as const, answerMode: 'SINGLE' as const, stem: '题目', normalizedAnswer: 'A',
      acceptedAnswers: [], enabled: true, explanation: '', sortOrder: 0, fingerprint: 'fingerprint-1',
      options: [{ key: 'A', text: '选项 A' }],
    }
    const state = {
      questionId: question.id, attemptCount: 1, correctCount: 1, wrongCount: 0, unansweredCount: 0,
      isWrongActive: false, isFavorite: true, note: '备注', lastAnswer: 'A', lastResult: 'CORRECT' as const,
      lastAnsweredAt: null, totalDurationMs: 1000,
    }
    await repository.importSource(source, [question])
    await repository.saveLearningState(state)
    await repository.updateSourceSelection({ ...source, questionCount: 0 }, [{ ...question, enabled: false }], [])

    let snapshot = await repository.getSnapshot()
    expect(snapshot.questions[0]?.enabled).toBe(false)
    expect(snapshot.learningStates).toHaveLength(1)
    await repository.updateSourceSelection(source, [{ ...question, enabled: true }], ['SINGLE'])
    snapshot = await repository.getSnapshot()
    expect(snapshot.questions[0]?.enabled).toBe(true)
    expect(snapshot.learningStates[0]?.note).toBe('备注')
  })

  it('恢复备份时为重复或缺失的题库哈希生成唯一值', () => {
    const snapshot = emptySnapshot()
    snapshot.sources.push(
      { id: 'source-1', name: '一.xlsx', sha256: '', importedAt: '', sheets: [], questionCount: 0, caseCount: 0 },
      { id: 'source-2', name: '二.xlsx', sha256: '', importedAt: '', sheets: [], questionCount: 0, caseCount: 0 },
      { id: 'source-3', name: '三.xlsx', sha256: 'same', importedAt: '', sheets: [], questionCount: 0, caseCount: 0 },
      { id: 'source-4', name: '四.xlsx', sha256: 'same', importedAt: '', sheets: [], questionCount: 0, caseCount: 0 },
    )

    const normalized = normalizeSnapshot(snapshot)
    expect(new Set(normalized.sources.map((source) => source.sha256)).size).toBe(4)
    expect(normalized.sources.map((source) => source.sha256)).toEqual([
      'legacy-source-source-1',
      'legacy-source-source-2',
      'same',
      'same-duplicate-source-4-1',
    ])
  })

  it('旧版备份没有案例拆分设置时默认开启', () => {
    const legacy = emptySnapshot() as AppSnapshot & { settings?: AppSnapshot['settings'] }
    delete legacy.settings
    expect(normalizeSnapshot(legacy as AppSnapshot).settings.splitCaseQuestions).toBe(true)
  })

  it('旧版备份没有颜色设置时默认跟随系统', () => {
    const snapshot = emptySnapshot()
    delete (snapshot.settings as Partial<typeof snapshot.settings>).themeMode
    expect(normalizeSnapshot(snapshot).settings.themeMode).toBe('SYSTEM')
  })

  it('保留备份中的暗色设置', () => {
    const snapshot = emptySnapshot()
    snapshot.settings.themeMode = 'DARK'
    expect(normalizeSnapshot(snapshot).settings.themeMode).toBe('DARK')
  })

  it('旧版备份中的学习状态自动补充空备注', () => {
    const snapshot = emptySnapshot()
    snapshot.learningStates.push({
      questionId: 'q1', attemptCount: 1, correctCount: 1, wrongCount: 0, unansweredCount: 0,
      isWrongActive: false, isFavorite: false, note: '', lastAnswer: 'A', lastResult: 'CORRECT',
      lastAnsweredAt: null, totalDurationMs: 0,
    })
    delete (snapshot.learningStates[0] as Partial<typeof snapshot.learningStates[number]>).note
    expect(normalizeSnapshot(snapshot).learningStates[0]?.note).toBe('')
  })

  it('旧版备份中的题目自动补充可接受答案列表', () => {
    const snapshot = emptySnapshot()
    snapshot.questions.push({
      id: 'q1', sourceFileId: 's1', sheetName: '题库', sourceRow: 2, parentId: null,
      nodeType: 'NORMAL', answerMode: 'FILL', stem: '填空题', normalizedAnswer: '答案',
      acceptedAnswers: [], explanation: '', sortOrder: 0, fingerprint: 'q1', options: [],
    })
    delete (snapshot.questions[0] as Partial<typeof snapshot.questions[number]>).acceptedAnswers

    expect(normalizeSnapshot(snapshot).questions[0]?.acceptedAnswers).toEqual([])
  })

  it('保留备份中关闭案例拆分的设置', () => {
    const snapshot = emptySnapshot()
    snapshot.settings.splitCaseQuestions = false
    expect(normalizeSnapshot(snapshot).settings.splitCaseQuestions).toBe(false)
  })

  it('旧版练习记录自动补充用时数据', () => {
    const snapshot = emptySnapshot()
    snapshot.sessions.push({
      id: 'session-1', projectId: 'project-1', mode: 'ORDERED', entryKind: 'STANDARD', status: 'COMPLETED',
      unitIds: ['q1'], currentIndex: 0, answers: { q1: 'A' }, gradedQuestionIds: ['q1'],
      startedAt: '2026-01-01T00:00:00.000Z', completedAt: '2026-01-01T00:01:00.000Z',
      deadline: null, correctCount: 1, wrongCount: 0, unansweredCount: 0, config: null,
      durationMs: 60_000, questionDurationMs: { q1: 60_000 },
    })
    const legacySession = snapshot.sessions[0] as Partial<typeof snapshot.sessions[number]>
    delete legacySession.durationMs
    delete legacySession.questionDurationMs
    delete legacySession.entryKind

    const normalized = normalizeSnapshot(snapshot).sessions[0]
    expect(normalized?.durationMs).toBe(0)
    expect(normalized?.questionDurationMs).toEqual({})
    expect(normalized?.entryKind).toBe('STANDARD')
  })

  it('旧版设置没有累计刷题时长时由已完成历史汇总', () => {
    const snapshot = emptySnapshot()
    snapshot.sessions.push({
      id: 'completed', projectId: null, mode: 'WRONG_REVIEW', entryKind: 'STANDARD', status: 'COMPLETED',
      unitIds: ['q1'], currentIndex: 0, answers: { q1: 'A' }, gradedQuestionIds: ['q1'],
      startedAt: '2026-01-01T00:00:00.000Z', completedAt: '2026-01-01T00:01:00.000Z',
      deadline: null, correctCount: 1, wrongCount: 0, unansweredCount: 0, config: null,
      durationMs: 60_000, questionDurationMs: { q1: 60_000 },
    }, {
      id: 'active', projectId: null, mode: 'WRONG_REVIEW', entryKind: 'STANDARD', status: 'ACTIVE',
      unitIds: ['q1'], currentIndex: 0, answers: {}, gradedQuestionIds: [],
      startedAt: '2026-01-01T00:02:00.000Z', completedAt: null,
      deadline: null, correctCount: 0, wrongCount: 0, unansweredCount: 0, config: null,
      durationMs: 30_000, questionDurationMs: {},
    })
    delete (snapshot.settings as Partial<typeof snapshot.settings>).totalPracticeDurationMs

    expect(normalizeSnapshot(snapshot).settings.totalPracticeDurationMs).toBe(60_000)
  })

  it('旧版设置没有练习总次数时由已完成历史初始化', () => {
    const snapshot = emptySnapshot()
    const completed = {
      id: 'completed', projectId: null, mode: 'WRONG_REVIEW' as const, entryKind: 'STANDARD' as const, status: 'COMPLETED' as const,
      unitIds: ['q1'], currentIndex: 0, answers: { q1: 'A' }, gradedQuestionIds: ['q1'],
      startedAt: '2026-01-01T00:00:00.000Z', completedAt: '2026-01-01T00:01:00.000Z',
      deadline: null, correctCount: 1, wrongCount: 0, unansweredCount: 0, config: null,
      durationMs: 60_000, questionDurationMs: { q1: 60_000 },
    }
    snapshot.sessions.push(completed, { ...completed, id: 'completed-2' })
    delete (snapshot.settings as Partial<typeof snapshot.settings>).totalPracticeCount

    expect(normalizeSnapshot(snapshot).settings.totalPracticeCount).toBe(2)
  })

  it('旧版设置没有项目练习次数时由现有项目历史初始化', () => {
    const snapshot = emptySnapshot()
    snapshot.projects.push({
      id: 'project-1', name: '项目', description: '', createdAt: '', updatedAt: '', sourceIds: [],
    })
    snapshot.sessions.push({
      id: 'completed', projectId: 'project-1', mode: 'ORDERED', entryKind: 'STANDARD', status: 'COMPLETED',
      unitIds: ['q1'], currentIndex: 0, answers: { q1: 'A' }, gradedQuestionIds: ['q1'],
      startedAt: '2026-01-01T00:00:00.000Z', completedAt: '2026-01-01T00:01:00.000Z', deadline: null,
      correctCount: 1, wrongCount: 0, unansweredCount: 0, durationMs: 60_000, questionDurationMs: {}, config: null,
    })
    delete (snapshot.settings as Partial<typeof snapshot.settings>).projectPracticeCounts

    expect(normalizeSnapshot(snapshot).settings.projectPracticeCounts).toEqual({ 'project-1': 1 })
  })

  it('保留独立累计刷题时长，不随历史记录数量变化', () => {
    const snapshot = emptySnapshot()
    snapshot.settings.totalPracticeDurationMs = 180_000
    snapshot.settings.totalPracticeCount = 5

    expect(normalizeSnapshot(snapshot).settings.totalPracticeDurationMs).toBe(180_000)
    expect(normalizeSnapshot(snapshot).settings.totalPracticeCount).toBe(5)
  })

  it('清除学习历史不会扣减独立累计刷题时长', async () => {
    const repository = new WebRepository()
    await repository.saveSettings({
      splitCaseQuestions: true, totalPracticeDurationMs: 120_000, totalPracticeCount: 3,
      projectPracticeCounts: { project: 2 }, projectOrder: [],
    })
    await repository.saveSession({
      id: 'completed', projectId: null, mode: 'WRONG_REVIEW', entryKind: 'STANDARD', status: 'COMPLETED',
      unitIds: ['q1'], currentIndex: 0, answers: { q1: 'A' }, gradedQuestionIds: ['q1'],
      startedAt: '2026-01-01T00:00:00.000Z', completedAt: '2026-01-01T00:02:00.000Z',
      deadline: null, correctCount: 1, wrongCount: 0, unansweredCount: 0, config: null,
      durationMs: 120_000, questionDurationMs: { q1: 120_000 },
    })

    await repository.deleteSessions(['completed'])

    const snapshot = await repository.getSnapshot()
    expect(snapshot.sessions).toEqual([])
    expect(snapshot.settings.totalPracticeDurationMs).toBe(120_000)
    expect(snapshot.settings.totalPracticeCount).toBe(3)
    expect(snapshot.settings.projectPracticeCounts).toEqual({ project: 2 })
  })
})
