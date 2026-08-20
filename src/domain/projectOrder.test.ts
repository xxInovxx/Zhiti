import { describe, expect, it } from 'vitest'
import { insertProjectId, moveProjectId } from './projectOrder'

describe('项目拖动排序', () => {
  it('可以将前面的项目移动到后面', () => {
    expect(moveProjectId(['a', 'b', 'c'], 'a', 'c')).toEqual(['b', 'c', 'a'])
  })

  it('可以将后面的项目移动到前面', () => {
    expect(moveProjectId(['a', 'b', 'c'], 'c', 'a')).toEqual(['c', 'a', 'b'])
  })

  it('无效目标不会改变原顺序', () => {
    expect(moveProjectId(['a', 'b'], 'a', 'missing')).toEqual(['a', 'b'])
  })

  it('可以按列表间隙插入项目', () => {
    expect(insertProjectId(['a', 'b', 'c'], 'a', 2)).toEqual(['b', 'c', 'a'])
    expect(insertProjectId(['a', 'b', 'c'], 'c', 0)).toEqual(['c', 'a', 'b'])
  })

  it('插入位置会被限制在列表范围内', () => {
    expect(insertProjectId(['a', 'b'], 'a', 99)).toEqual(['b', 'a'])
    expect(insertProjectId(['a', 'b'], 'b', -1)).toEqual(['b', 'a'])
  })
})
