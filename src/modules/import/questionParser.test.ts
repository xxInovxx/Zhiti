import { describe, expect, it } from 'vitest'
import { parseSheetRows } from './questionParser'

describe('题库行解析器', () => {
  it('不依赖表头顺序并规范化多选答案', () => {
    const result = parseSheetRows('source', {
      name: '题库',
      rows: [
        ['B', '答案', '题干', '题型', 'A', '出自规范', 'C', 'D'],
        ['乙', 'A, C, D ', '以下正确的是', '多选题', '甲', '规范1', '丙', '丁'],
      ],
    })
    expect(result.issues.filter((issue) => issue.level === 'error')).toHaveLength(0)
    expect(result.questions[0]?.normalizedAnswer).toBe('ACD')
    expect(result.questions[0]?.explanation).toBe('规范1')
  })

  it('自动补充判断题选项', () => {
    const result = parseSheetRows('source', {
      name: '题库',
      rows: [
        ['题型', '题干', '答案'],
        ['判断题', '太阳从东方升起', '正确'],
      ],
    })
    expect(result.questions[0]?.normalizedAnswer).toBe('A')
    expect(result.questions[0]?.options).toEqual([
      { key: 'A', text: '正确' },
      { key: 'B', text: '错误' },
    ])
    expect(result.issues).toHaveLength(0)
  })

  it('读取只有题型、题干和答案的填空题', () => {
    const result = parseSheetRows('source', {
      name: '填空',
      rows: [
        ['题型', '题干', '答案'],
        ['填空题', '知题使用什么框架开发？', 'Vue 3'],
      ],
    })
    expect(result.issues).toHaveLength(0)
    expect(result.questions[0]?.answerMode).toBe('FILL')
    expect(result.questions[0]?.normalizedAnswer).toBe('Vue 3')
    expect(result.questions[0]?.options).toEqual([])
  })

  it('将两个空答案案例题干之间的行归为前一案例', () => {
    const result = parseSheetRows('source', {
      name: '案例',
      rows: [
        ['题型', '题干', '答案', 'A', 'B', 'C'],
        ['案例题', '案例一材料', '', '', '', ''],
        ['案例题', '案例一小题1', 'A', '正确项', '错误项', ''],
        ['案例题', '案例一小题2', 'AC', '选项A', '选项B', '选项C'],
        ['案例题', '案例二材料', '', '', '', ''],
        ['案例题', '案例二小题1', 'B', '选项A', '选项B', ''],
      ],
    })
    const cases = result.questions.filter((question) => question.nodeType === 'CASE')
    expect(cases).toHaveLength(2)
    expect(result.questions.filter((question) => question.parentId === cases[0]?.id)).toHaveLength(2)
    expect(result.questions.filter((question) => question.parentId === cases[1]?.id)).toHaveLength(1)
  })

  it('拒绝没有案例题干的小题', () => {
    const result = parseSheetRows('source', {
      name: '错误案例',
      rows: [
        ['题型', '题干', '答案', 'A', 'B'],
        ['案例题', '孤立小题', 'A', '甲', '乙'],
      ],
    })
    expect(result.issues.some((issue) => issue.level === 'error')).toBe(true)
  })
})
