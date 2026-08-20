export function allocateQuestionDuration(
  current: Record<string, number>,
  questionIds: string[],
  elapsedMs: number,
): Record<string, number> {
  if (!questionIds.length || elapsedMs <= 0) return { ...current }
  const duration = Math.max(0, Math.floor(elapsedMs))
  const base = Math.floor(duration / questionIds.length)
  let remainder = duration - base * questionIds.length
  const next = { ...current }
  questionIds.forEach((questionId) => {
    const addition = base + Number(remainder > 0)
    remainder = Math.max(0, remainder - 1)
    next[questionId] = Math.max(0, next[questionId] ?? 0) + addition
  })
  return next
}

export function totalQuestionDuration(
  questionDurationMs: Record<string, number>,
  questionIds: string[],
): number {
  return questionIds.reduce((total, questionId) => total + Math.max(0, questionDurationMs[questionId] ?? 0), 0)
}

export function shouldTrackCurrentUnit(
  sessionActive: boolean,
  questionIds: string[],
  gradedQuestionIds: string[],
): boolean {
  if (!sessionActive || !questionIds.length) return false
  const graded = new Set(gradedQuestionIds)
  return !questionIds.every((questionId) => graded.has(questionId))
}
