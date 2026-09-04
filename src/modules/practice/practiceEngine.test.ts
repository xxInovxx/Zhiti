import { describe, expect, it } from 'vitest'
import type { PracticeSession, Question } from '@/domain/models'
import {
  buildLegacyCaseUnit, buildPracticeUnits, buildSingleQuestionUnit, gradeQuestion, hasSameUnitPool,
  completedPracticeUnitIds, completedPracticeUnits, countAnswerable, cycleProgressNumber, cycleSessionProgressNumber,
  isCycleProgressComplete, isCycleSessionComplete, isGroupReviewSession, reshuffleRemainingUnitIds,
  randomizeChoiceOptions, selectExamUnits, shouldCompleteGroupReviewOnLeave, shouldShowSingleQuestionResultOnLeave,
} from './practiceEngine'

function question(partial: Partial<Question>): Question {
  return {
    id: 'q', sourceFileId: 's', sheetName: '题库', sourceRow: 2, parentId: null,
    nodeType: 'NORMAL', answerMode: 'SINGLE', stem: '题目', normalizedAnswer: 'A', acceptedAnswers: [],
    explanation: '', sortOrder: 2, fingerprint: 'x', options: [{ key: 'A', text: '甲' }], ...partial,
  }
}

function reviewSession(partial: Partial<PracticeSession> = {}): PracticeSession {
  return {
    id: 'review', projectId: null, mode: 'WRONG_REVIEW', entryKind: 'STANDARD', status: 'ACTIVE',
    startedAt: '2026-01-01T00:00:00.000Z', completedAt: null, deadline: null,
    unitIds: ['q1', 'q2', 'q3'], currentIndex: 0, answers: {}, gradedQuestionIds: [],
    correctCount: 0, wrongCount: 0, unansweredCount: 0,
    durationMs: 0, questionDurationMs: {}, config: null, ...partial,
  }
}

describe('刷题引擎', () => {
  it('案例中的每个小题分别作为独立刷题单元', () => {
    const items = [
      question({ id: 'case', nodeType: 'CASE', answerMode: 'NONE' }),
      question({ id: 'child1', nodeType: 'CASE_ITEM', parentId: 'case' }),
      question({ id: 'child2', nodeType: 'CASE_ITEM', parentId: 'case', sortOrder: 3 }),
    ]
    const units = buildPracticeUnits(items)
    expect(units).toHaveLength(2)
    expect(units.map((unit) => unit.questions[0]?.id)).toEqual(['child1', 'child2'])
    expect(units.every((unit) => unit.context?.id === 'case')).toBe(true)
  })

  it('关闭案例拆分时将同一案例的小题合并为一个刷题单元', () => {
    const items = [
      question({ id: 'normal' }),
      question({ id: 'case', nodeType: 'CASE', answerMode: 'NONE', sortOrder: 3 }),
      question({ id: 'child1', nodeType: 'CASE_ITEM', parentId: 'case', sortOrder: 4 }),
      question({ id: 'child2', nodeType: 'CASE_ITEM', parentId: 'case', sortOrder: 5 }),
    ]
    const units = buildPracticeUnits(items, false)
    expect(units.map((unit) => unit.id)).toEqual(['normal', 'case'])
    expect(units[1]?.questions.map((item) => item.id)).toEqual(['child1', 'child2'])
    expect(units[1]?.context?.id).toBe('case')
    expect(countAnswerable(units)).toBe(3)
  })

  it('单独练案例小题时保留案例材料且只包含被选中的小题', () => {
    const items = [
      question({ id: 'case', nodeType: 'CASE', answerMode: 'NONE' }),
      question({ id: 'child1', nodeType: 'CASE_ITEM', parentId: 'case' }),
      question({ id: 'child2', nodeType: 'CASE_ITEM', parentId: 'case', sortOrder: 3 }),
    ]
    const unit = buildSingleQuestionUnit(items, 'child2')
    expect(unit?.context?.id).toBe('case')
    expect(unit?.questions.map((item) => item.id)).toEqual(['child2'])
  })

  it('兼容读取旧版按整道案例保存的未完成练习', () => {
    const items = [
      question({ id: 'case', nodeType: 'CASE', answerMode: 'NONE' }),
      question({ id: 'child1', nodeType: 'CASE_ITEM', parentId: 'case' }),
      question({ id: 'child2', nodeType: 'CASE_ITEM', parentId: 'case', sortOrder: 3 }),
    ]
    expect(buildLegacyCaseUnit(items, 'case')?.questions.map((item) => item.id)).toEqual(['child1', 'child2'])
  })

  it('重随只改变尚未完成的题目且不产生重复', () => {
    const original = ['done1', 'done2', 'pending1', 'pending2', 'pending3']
    const reshuffled = reshuffleRemainingUnitIds(original, 2)
    expect(reshuffled.slice(0, 2)).toEqual(['done1', 'done2'])
    expect(reshuffled.slice(2).sort()).toEqual(['pending1', 'pending2', 'pending3'])
    expect(reshuffled).not.toEqual(original)
  })

  it('随机重刷会重新排列全部题目', () => {
    const original = ['q1', 'q2', 'q3', 'q4']
    const restarted = reshuffleRemainingUnitIds(original, 0)
    expect([...restarted].sort()).toEqual([...original].sort())
    expect(restarted).not.toEqual(original)
  })

  it('顺序练习恢复时按完整题目范围识别原会话', () => {
    expect(hasSameUnitPool(['q2', 'q3', 'q1'], ['q1', 'q2', 'q3'])).toBe(true)
    expect(hasSameUnitPool(['q1', 'q2'], ['q1', 'q3'])).toBe(false)
    expect(hasSameUnitPool(['q1', 'q1'], ['q1', 'q2'])).toBe(false)
  })

  it('退出练习时只保留已经完整判分的刷题单元', () => {
    const units = buildPracticeUnits([
      question({ id: 'q1' }),
      question({ id: 'case', nodeType: 'CASE', answerMode: 'NONE' }),
      question({ id: 'q2', nodeType: 'CASE_ITEM', parentId: 'case' }),
      question({ id: 'q3', nodeType: 'CASE_ITEM', parentId: 'case' }),
      question({ id: 'q4' }),
    ], false)
    expect(completedPracticeUnitIds(units, ['q1', 'q2', 'q3'])).toEqual(['q1', 'case'])
    expect(completedPracticeUnitIds(units, ['q1', 'q2'])).toEqual(['q1'])
  })

  it('重新加载历史综述时只解析已经完成的题目', () => {
    const units = buildPracticeUnits([
      question({ id: 'q1' }),
      question({ id: 'q2' }),
      question({ id: 'q3' }),
    ])
    expect(completedPracticeUnits(units, ['q1', 'q2']).map((unit) => unit.id)).toEqual(['q1', 'q2'])
  })

  it('恢复循环刷题时按持久化游标显示当前进度', () => {
    expect(cycleProgressNumber(3, 10, false)).toBe(4)
    expect(cycleProgressNumber(4, 10, true)).toBe(4)
    expect(cycleProgressNumber(0, 10, true)).toBe(10)
  })

  it('连续返回上一题时按当前题下标持续更新进度', () => {
    expect(cycleSessionProgressNumber(4, 10, 4, 3)).toBe(4)
    expect(cycleSessionProgressNumber(4, 10, 4, 2)).toBe(3)
    expect(cycleSessionProgressNumber(4, 10, 4, 1)).toBe(2)
    expect(cycleSessionProgressNumber(7, 10, 2, 0)).toBe(6)
    expect(cycleSessionProgressNumber(7, 10, 2, 1)).toBe(7)
  })

  it('只在当前显示为最后一题且已经提交时完成本轮', () => {
    expect(isCycleSessionComplete(10, 10, false)).toBe(false)
    expect(isCycleSessionComplete(9, 10, true)).toBe(false)
    expect(isCycleSessionComplete(10, 10, true)).toBe(true)
  })

  it('只在循环最后一题已提交后判定本轮完成', () => {
    expect(isCycleProgressComplete(9, 10, false)).toBe(false)
    expect(isCycleProgressComplete(10, 10, true)).toBe(true)
    expect(isCycleProgressComplete(0, 10, true)).toBe(true)
    expect(isCycleProgressComplete(4, 10, true)).toBe(false)
  })

  it('区分整组重练和单题练习入口', () => {
    expect(isGroupReviewSession(reviewSession())).toBe(true)
    expect(isGroupReviewSession(reviewSession({ entryKind: 'SINGLE_QUESTION' }))).toBe(false)
    expect(isGroupReviewSession(reviewSession({ mode: 'ORDERED', projectId: 'project' }))).toBe(false)
  })

  it('整组重练只有在最后一题已经提交时才应在退出时完成', () => {
    expect(shouldCompleteGroupReviewOnLeave(reviewSession({ currentIndex: 2 }), 3, true)).toBe(true)
    expect(shouldCompleteGroupReviewOnLeave(reviewSession({ currentIndex: 1 }), 3, true)).toBe(false)
    expect(shouldCompleteGroupReviewOnLeave(reviewSession({ currentIndex: 2 }), 3, false)).toBe(false)
    expect(shouldCompleteGroupReviewOnLeave(reviewSession({ currentIndex: 2, entryKind: 'SINGLE_QUESTION' }), 3, true)).toBe(false)
  })

  it('单题练习提交后退出时进入题目综述', () => {
    expect(shouldShowSingleQuestionResultOnLeave(reviewSession({
      entryKind: 'SINGLE_QUESTION', status: 'COMPLETED', completedAt: '2026-01-01T00:01:00.000Z', gradedQuestionIds: ['q1'],
    }))).toBe(true)
    expect(shouldShowSingleQuestionResultOnLeave(reviewSession({
      entryKind: 'SINGLE_QUESTION', status: 'ACTIVE', gradedQuestionIds: ['q1'],
    }))).toBe(false)
    expect(shouldShowSingleQuestionResultOnLeave(reviewSession({
      entryKind: 'SINGLE_QUESTION', status: 'COMPLETED', completedAt: '2026-01-01T00:01:00.000Z', gradedQuestionIds: [],
    }))).toBe(false)
  })

  it('多选题按集合判题', () => {
    const item = question({ answerMode: 'MULTIPLE', normalizedAnswer: 'ACD' })
    expect(gradeQuestion(item, 'D,A,C').correct).toBe(true)
    expect(gradeQuestion(item, 'AC').correct).toBe(false)
  })

  it('随机模式打乱选项内容但保持显示字母连续且答案键不变', () => {
    const item = question({
      answerMode: 'MULTIPLE',
      normalizedAnswer: 'AC',
      options: [
        { key: 'A', text: '甲' },
        { key: 'B', text: '乙' },
        { key: 'C', text: '丙' },
        { key: 'D', text: '丁' },
      ],
    })

    const randomized = randomizeChoiceOptions(item, 'session:question')

    expect(randomized.options.map((option) => option.displayKey)).toEqual(['A', 'B', 'C', 'D'])
    expect(randomized.options.map((option) => option.key)).not.toEqual(['A', 'B', 'C', 'D'])
    expect(randomized.normalizedAnswer).toBe('AC')
    expect(randomized.options.map((option) => option.text).sort()).toEqual(['丁', '丙', '乙', '甲'].sort())
  })

  it('填空题只在输入与答案完全匹配时判定正确', () => {
    const item = question({ answerMode: 'FILL', normalizedAnswer: 'Vue 3', options: [] })
    expect(gradeQuestion(item, 'Vue 3')).toEqual({ correct: true, unanswered: false })
    expect(gradeQuestion(item, 'vue 3').correct).toBe(false)
    expect(gradeQuestion(item, 'Vue 3 ').correct).toBe(false)
  })

  it('填空题判定不区分中英文标点符号', () => {
    const item = question({ answerMode: 'FILL', normalizedAnswer: '第一项，完成；第二项。', options: [] })
    expect(gradeQuestion(item, '第一项,完成;第二项.').correct).toBe(true)
    expect(gradeQuestion(item, '第一项，完成；其他内容。').correct).toBe(false)
  })

  it('填空题接受后续修正加入的正确答案', () => {
    const item = question({ answerMode: 'FILL', normalizedAnswer: '原答案', acceptedAnswers: ['补充答案！'], options: [] })
    expect(gradeQuestion(item, '补充答案!').correct).toBe(true)
  })

  it('随机组卷按案例小题数量分别抽取', () => {
    const units = buildPracticeUnits([
      question({ id: 's1' }),
      question({ id: 'm1', answerMode: 'MULTIPLE', normalizedAnswer: 'AB' }),
      question({ id: 'case', nodeType: 'CASE', answerMode: 'NONE', sortOrder: 4 }),
      question({ id: 'c1', nodeType: 'CASE_ITEM', parentId: 'case', sortOrder: 5 }),
      question({ id: 'c2', nodeType: 'CASE_ITEM', parentId: 'case', sortOrder: 6 }),
    ])
    const selected = selectExamUnits(units, { singleCount: 1, multipleCount: 1, judgeCount: 0, fillCount: 0, caseCount: 2, timeLimitMinutes: 30 })
    expect(selected).toHaveLength(4)
    expect(selected.filter((unit) => unit.context?.id === 'case')).toHaveLength(2)
  })

  it('随机组卷按单选、多选、判断、填空、案例的顺序排列', () => {
    const units = buildPracticeUnits([
      question({ id: 'j1', answerMode: 'JUDGE' }),
      question({ id: 'case', nodeType: 'CASE', answerMode: 'NONE' }),
      question({ id: 'c1', nodeType: 'CASE_ITEM', parentId: 'case' }),
      question({ id: 'm1', answerMode: 'MULTIPLE', normalizedAnswer: 'AB' }),
      question({ id: 's1' }),
      question({ id: 'f1', answerMode: 'FILL', normalizedAnswer: '答案', options: [] }),
    ])
    const selected = selectExamUnits(units, {
      singleCount: 1, multipleCount: 1, judgeCount: 1, fillCount: 1, caseCount: 1, timeLimitMinutes: 30,
    })
    expect(selected.map((unit) => unit.context ? 'CASE' : unit.questions[0]?.answerMode))
      .toEqual(['SINGLE', 'MULTIPLE', 'JUDGE', 'FILL', 'CASE'])
  })
})
