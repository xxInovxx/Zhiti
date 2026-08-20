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
  it('普通题包含题干和答案', () => {
    expect(formatQuestionsForClipboard(null, [question('q1', '普通题')]))
      .toBe('题干：普通题\n答案：A')
  })

  it('案例小题在文本开头包含案例材料', () => {
    expect(formatQuestionsForClipboard(question('case', '案例材料'), [question('q1', '案例小题')]))
      .toBe('案例：案例材料\n题干：案例小题\n答案：A')
  })
})
