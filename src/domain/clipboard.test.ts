import { describe, expect, it } from 'vitest'
import type { Question } from './models'
import { formatQuestionsForClipboard } from './clipboard'

function question(id: string, stem: string): Question {
  return {
    id, stem, sourceFileId: 'source', sheetName: '题库', sourceRow: 2, parentId: null,
    nodeType: 'NORMAL', answerMode: 'SINGLE', normalizedAnswer: 'A', acceptedAnswers: [], explanation: '',
    sortOrder: 2, fingerprint: id, options: [{ key: 'A', text: '答案' }],
  }
}

describe('题目复制文本', () => {
  it('普通题包含题干、选项内容和答案', () => {
    expect(formatQuestionsForClipboard(null, [question('q1', '普通题')]))
      .toBe('题干：普通题\nA：答案\n答案：A')
  })

  it('案例小题在文本开头包含案例材料', () => {
    expect(formatQuestionsForClipboard(question('case', '案例材料'), [question('q1', '案例小题')]))
      .toBe('案例：案例材料\n题干：案例小题\nA：答案\n答案：A')
  })

  it('选项打乱后复制重新编号的正确答案', () => {
    const shuffled = {
      ...question('q1', '随机题'),
      options: [
        { key: 'B', displayKey: 'A', text: '选项 B' },
        { key: 'A', displayKey: 'B', text: '选项 A' },
      ],
    }
    expect(formatQuestionsForClipboard(null, [shuffled]))
      .toBe('题干：随机题\nA：选项 B\nB：选项 A\n答案：B')
  })

  it('填空题没有选项时只复制题干和答案', () => {
    const fillQuestion = {
      ...question('q1', '填空题'),
      answerMode: 'FILL' as const,
      normalizedAnswer: '标准答案',
      acceptedAnswers: ['标准答案'],
      options: [],
    }
    expect(formatQuestionsForClipboard(null, [fillQuestion]))
      .toBe('题干：填空题\n答案：标准答案')
  })
})
