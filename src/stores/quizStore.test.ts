import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { emptySnapshot } from '@/infrastructure/repository'
import { useQuizStore } from './quizStore'

describe('随机组卷学习统计', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('交卷时未作答题目不写入学习统计', async () => {
    const snapshot = emptySnapshot()
    snapshot.sources.push({
      id: 'source', name: '题库.xlsx', sha256: 'hash', importedAt: '', sheets: ['题库'], questionCount: 2, caseCount: 0,
    })
    snapshot.questions.push(...['q1', 'q2'].map((id, index) => ({
      id, sourceFileId: 'source', sheetName: '题库', sourceRow: index + 2, parentId: null,
      nodeType: 'NORMAL' as const, answerMode: 'SINGLE' as const, stem: id, normalizedAnswer: 'A',
      acceptedAnswers: [], enabled: true, explanation: '', sortOrder: index, fingerprint: id,
      options: [{ key: 'A', text: '正确' }, { key: 'B', text: '错误' }],
    })))
    snapshot.projects.push({
      id: 'project', name: '项目', description: '', createdAt: '', updatedAt: '', sourceIds: ['source'],
    })

    const store = useQuizStore()
    await store.restoreSnapshot(snapshot)
    const session = await store.startPractice('project', 'EXAM', {
      singleCount: 2, multipleCount: 0, judgeCount: 0, fillCount: 0, caseCount: 0, timeLimitMinutes: 0,
    })
    session.answers[session.unitIds[0]!] = 'B'

    await store.finishSession(session)

    expect(session.wrongCount).toBe(1)
    expect(session.unansweredCount).toBe(1)
    expect(store.data.learningStates).toHaveLength(1)
    expect(store.data.learningStates[0]?.attemptCount).toBe(1)
    expect(store.data.learningStates[0]?.isWrongActive).toBe(true)
    expect(store.calculateStats(store.data.questions).attempts).toBe(1)
    expect(store.data.settings.projectPracticeCounts).toEqual({ project: 1 })
  })
})
