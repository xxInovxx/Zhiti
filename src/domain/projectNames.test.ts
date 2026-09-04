import { describe, expect, it } from 'vitest'
import { isReservedProjectName } from './projectNames'

describe('项目名称', () => {
  it('禁止与统计中心默认重练名称重复，并忽略分隔符两侧空格', () => {
    expect(isReservedProjectName('统计中心·错题重练')).toBe(true)
    expect(isReservedProjectName('统计中心 · 错题重练')).toBe(true)
    expect(isReservedProjectName(' 统计中心  ·  收藏重练 ')).toBe(true)
  })

  it('允许普通项目名称', () => {
    expect(isReservedProjectName('我的错题重练')).toBe(false)
  })
})
