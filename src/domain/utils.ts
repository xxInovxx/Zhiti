import type { AnswerMode, Question } from './models'

const ANSWER_KEYS = 'ABCDEFGHI'

export function createId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export function normalizeText(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value).normalize('NFKC').replace(/\uFEFF/g, '').trim()
}

export function normalizeHeader(value: unknown): string {
  return normalizeText(value).replace(/[\s\r\n]+/g, '')
}

export function normalizeAnswer(value: unknown, mode?: AnswerMode): string {
  const normalized = normalizeText(value)
  if (mode === 'FILL') return normalized
  const original = normalized.toUpperCase()
  if (!original) return ''

  if (mode === 'JUDGE') {
    const compact = original.replace(/\s+/g, '')
    if (['正确', '对', '√', 'TRUE', 'T', '是'].includes(compact)) return 'A'
    if (['错误', '错', '×', 'FALSE', 'F', '否'].includes(compact)) return 'B'
  }

  const compact = original.replace(/[\s,，、;；|/]+/g, '')
  if (!new RegExp(`^[${ANSWER_KEYS}]+$`).test(compact)) {
    throw new Error(`答案“${original}”不是有效的 A-I 选项组合`)
  }
  return [...new Set(compact.split(''))].sort().join('')
}

export function answerModeFromType(type: string): AnswerMode | null {
  const normalized = normalizeText(type).replace(/题$/, '')
  if (normalized === '单选') return 'SINGLE'
  if (normalized === '多选') return 'MULTIPLE'
  if (normalized === '判断') return 'JUDGE'
  if (normalized === '填空') return 'FILL'
  return null
}

export function isCaseType(type: string): boolean {
  return normalizeText(type).replace(/题$/, '') === '案例'
}

export function answersEqual(left: string, right: string, mode?: AnswerMode): boolean {
  if (mode === 'FILL') return normalizeFillAnswerForComparison(left) === normalizeFillAnswerForComparison(right)
  try {
    return normalizeAnswer(left) === normalizeAnswer(right)
  } catch {
    return false
  }
}

export function normalizeFillAnswerForComparison(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value).normalize('NFKC').replace(/\uFEFF/g, '')
    .replace(/[。｡]/g, '.')
    .replace(/[，、]/g, ',')
    .replace(/；/g, ';')
    .replace(/：/g, ':')
    .replace(/！/g, '!')
    .replace(/？/g, '?')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[【〔［]/g, '[')
    .replace(/[】〕］]/g, ']')
    .replace(/[《〈]/g, '<')
    .replace(/[》〉]/g, '>')
    .replace(/…/g, '...')
    .replace(/[—–]/g, '-')
}

export function questionCorrectAnswers(question: Question): string[] {
  return [question.normalizedAnswer, ...(question.acceptedAnswers ?? [])]
    .filter((answer, index, answers) => Boolean(answer) && answers.indexOf(answer) === index)
}

export function questionAnswerForDisplay(question: Question, answer: string): string {
  if (!['SINGLE', 'MULTIPLE'].includes(question.answerMode)) return answer
  const displayKeys = new Map(question.options.map((option) => [option.key, option.displayKey ?? option.key]))
  return [...new Set(answer.split('').map((key) => displayKeys.get(key) ?? key))].sort().join('')
}

export function questionAnswerIsCorrect(question: Question, answer: string): boolean {
  return Boolean(answer && questionCorrectAnswers(question)
    .some((correctAnswer) => answersEqual(answer, correctAnswer, question.answerMode)))
}

export async function sha256(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', buffer)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function shuffle<T>(items: T[]): T[] {
  const result = [...items]
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1))
    const current = result[index]
    result[index] = result[target] as T
    result[target] = current as T
  }
  return result
}

/** Stable pseudo-random shuffle used for per-session option order. */
export function seededShuffle<T>(items: T[], seed: string): T[] {
  const result = [...items]
  let state = 2166136261
  for (const character of seed) {
    state ^= character.charCodeAt(0)
    state = Math.imul(state, 16777619)
  }
  for (let index = result.length - 1; index > 0; index -= 1) {
    state = Math.imul(state ^ (state >>> 13), 1274126177)
    state ^= state >>> 16
    const target = (state >>> 0) % (index + 1)
    const current = result[index]
    result[index] = result[target] as T
    result[target] = current as T
  }
  return result
}

export function formatDuration(totalMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(totalMs / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}
