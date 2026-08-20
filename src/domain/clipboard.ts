import type { Question } from './models'
import { questionCorrectAnswers } from './utils'

export function formatQuestionsForClipboard(context: Question | null, questions: Question[]): string {
  const lines: string[] = []
  if (context) lines.push(`案例：${context.stem}`)
  questions.forEach((question, index) => {
    if (index > 0) lines.push('')
    lines.push(`题干：${question.stem}`, `答案：${questionCorrectAnswers(question).join(' / ')}`)
  })
  return lines.join('\n')
}

export async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  const copied = document.execCommand('copy')
  textarea.remove()
  if (!copied) throw new Error('复制失败，请检查剪贴板权限')
}
