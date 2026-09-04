import { describe, expect, it } from 'vitest'
import { normalizeThemeMode, resolveThemeMode } from './theme'

describe('应用颜色模式', () => {
  it('亮色和暗色设置不受系统颜色影响', () => {
    expect(resolveThemeMode('LIGHT', true)).toBe('light')
    expect(resolveThemeMode('DARK', false)).toBe('dark')
  })

  it('跟随系统时使用系统颜色', () => {
    expect(resolveThemeMode('SYSTEM', true)).toBe('dark')
    expect(resolveThemeMode('SYSTEM', false)).toBe('light')
  })

  it('未知设置按跟随系统处理', () => {
    expect(normalizeThemeMode('UNKNOWN')).toBe('SYSTEM')
  })
})
