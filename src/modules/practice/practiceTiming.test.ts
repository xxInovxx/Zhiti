import { describe, expect, it } from 'vitest'
import { allocateQuestionDuration, shouldTrackCurrentUnit, totalQuestionDuration } from './practiceTiming'

describe('刷题计时', () => {
  it('将刷题单元用时平均记录到每道小题且保持总时长', () => {
    const durations = allocateQuestionDuration({}, ['q1', 'q2', 'q3'], 1000)
    expect(durations).toEqual({ q1: 334, q2: 333, q3: 333 })
    expect(totalQuestionDuration(durations, ['q1', 'q2', 'q3'])).toBe(1000)
  })

  it('支持多次进入同一道题时累计用时', () => {
    const first = allocateQuestionDuration({}, ['q1'], 1200)
    const second = allocateQuestionDuration(first, ['q1'], 800)
    expect(second.q1).toBe(2000)
  })

  it('只在当前题组未提交时计时', () => {
    expect(shouldTrackCurrentUnit(true, ['q1'], [])).toBe(true)
    expect(shouldTrackCurrentUnit(true, ['q1'], ['q1'])).toBe(false)
    expect(shouldTrackCurrentUnit(true, ['q1', 'q2'], ['q1', 'q2'])).toBe(false)
    expect(shouldTrackCurrentUnit(false, ['q1'], [])).toBe(false)
  })
})
