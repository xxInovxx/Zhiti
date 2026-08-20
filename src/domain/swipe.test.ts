import { describe, expect, it } from 'vitest'
import { horizontalSwipeOffset } from './swipe'

describe('题目解析横滑判定', () => {
  it('识别距离足够且接近水平的滑动', () => {
    expect(horizontalSwipeOffset({ deltaX: -120, deltaY: 18 })).toBe(1)
    expect(horizontalSwipeOffset({ deltaX: 110, deltaY: -20 })).toBe(-1)
  })

  it('忽略短距离和斜向滑动', () => {
    expect(horizontalSwipeOffset({ deltaX: 70, deltaY: 5 })).toBe(0)
    expect(horizontalSwipeOffset({ deltaX: 110, deltaY: 60 })).toBe(0)
    expect(horizontalSwipeOffset({ deltaX: -180, deltaY: 75 })).toBe(0)
  })
})
