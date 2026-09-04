import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import QuestionBlock from './QuestionBlock.vue'
import type { LearningState, Question } from '@/domain/models'

const question: Question = {
  id: 'question-1',
  sourceFileId: 'source-1',
  sheetName: '题库',
  sourceRow: 2,
  parentId: null,
  nodeType: 'NORMAL',
  answerMode: 'SINGLE',
  stem: '示例题目',
  normalizedAnswer: 'A',
  acceptedAnswers: [],
  explanation: '示例解析',
  sortOrder: 0,
  fingerprint: 'fingerprint-1',
  options: [
    { key: 'A', text: '选项 A' },
    { key: 'B', text: '选项 B' },
  ],
}

const learning: LearningState = {
  questionId: question.id,
  attemptCount: 1,
  correctCount: 1,
  wrongCount: 0,
  unansweredCount: 0,
  isWrongActive: false,
  isFavorite: false,
  note: '原备注',
  lastAnswer: 'A',
  lastResult: 'CORRECT',
  lastAnsweredAt: null,
  totalDurationMs: 0,
}

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('QuestionBlock 收藏按钮', () => {
  it('默认显示并可触发收藏事件', async () => {
    const wrapper = mount(QuestionBlock, {
      props: { question, modelValue: '' },
    })

    const favorite = wrapper.get('[aria-label="收藏题目"]')
    expect(favorite.isVisible()).toBe(true)
    await favorite.trigger('click')
    expect(wrapper.emitted('favorite')).toHaveLength(1)
  })

  it('只有显式关闭时才隐藏收藏按钮', () => {
    const wrapper = mount(QuestionBlock, {
      props: { question, modelValue: '', showFavorite: false },
    })

    expect(wrapper.find('.favorite-button').exists()).toBe(false)
  })

  it('只在解析状态显示单一备注框并在输入后自动提交', async () => {
    vi.useFakeTimers()
    const wrapper = mount(QuestionBlock, {
      props: { question, modelValue: 'A', learning, reveal: true },
    })

    const note = wrapper.get('.question-note-input')
    expect((note.element as HTMLTextAreaElement).value).toBe('原备注')
    expect(note.attributes('placeholder')).toBe('记录这道题的易错点、记忆方法或补充说明...')
    await note.setValue('新的易错点')
    await vi.advanceTimersByTimeAsync(600)
    expect(wrapper.emitted('save-note')?.[0]).toEqual(['新的易错点'])
    expect(wrapper.findAll('.question-note-input')).toHaveLength(1)

    await wrapper.setProps({ reveal: false })
    expect(wrapper.find('.question-note-input').exists()).toBe(false)
  })

  it('填空题显示文本输入框并原样提交答案', async () => {
    const fillQuestion: Question = {
      ...question,
      answerMode: 'FILL',
      normalizedAnswer: 'Vue 3',
      options: [],
    }
    const wrapper = mount(QuestionBlock, {
      props: { question: fillQuestion, modelValue: '' },
    })
    const input = wrapper.get('.fill-answer-input')
    await input.setValue('Vue 3')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['Vue 3'])
    expect(wrapper.find('.option-row').exists()).toBe(false)
  })

  it('填空题答错后可确认修正答案，答对时不显示修正按钮', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const fillQuestion: Question = {
      ...question,
      answerMode: 'FILL',
      normalizedAnswer: '原答案',
      options: [],
    }
    const wrapper = mount(QuestionBlock, {
      props: { question: fillQuestion, modelValue: '补充答案', reveal: true, disabled: true },
    })

    await wrapper.get('.correct-answer-button').trigger('click')
    expect(window.confirm).toHaveBeenCalledWith('是否确定修正答案？')
    expect(wrapper.emitted('correct-answer')?.[0]).toEqual(['补充答案'])

    await wrapper.setProps({ question: { ...fillQuestion, acceptedAnswers: ['补充答案'] } })
    expect(wrapper.find('.correct-answer-button').exists()).toBe(false)
  })

  it('单选题答错后显示修正答案按钮并提交当前选项', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const wrapper = mount(QuestionBlock, {
      props: { question, modelValue: 'B', reveal: true, disabled: true },
    })

    await wrapper.get('.correct-answer-button').trigger('click')
    expect(window.confirm).toHaveBeenCalledWith('是否确定修正答案？')
    expect(wrapper.emitted('correct-answer')?.[0]).toEqual(['B'])
  })

  it('选项打乱后显示连续字母，并用原始键保存和判题', async () => {
    const shuffledQuestion: Question = {
      ...question,
      normalizedAnswer: 'A',
      options: [
        { key: 'C', displayKey: 'A', text: '选项 C' },
        { key: 'A', displayKey: 'B', text: '选项 A' },
        { key: 'B', displayKey: 'C', text: '选项 B' },
      ],
    }
    const wrapper = mount(QuestionBlock, {
      props: { question: shuffledQuestion, modelValue: 'C', reveal: true },
    })

    expect(wrapper.findAll('.option-key').map((item) => item.text())).toEqual(['A', 'B', 'C'])
    expect(wrapper.text()).toContain('你的答案：A')
    expect(wrapper.text()).toContain('正确答案：B')

    await wrapper.setProps({ modelValue: '', reveal: false, disabled: false })
    await wrapper.findAll('.option-row')[0]?.trigger('click')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['C'])
  })
})
