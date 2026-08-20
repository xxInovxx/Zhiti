import type { PracticeSession, PracticeUnit, Question } from '@/domain/models'
import { questionAnswerIsCorrect } from '@/domain/utils'

export interface SessionReviewItem {
  question: Question
  context: Question | null
  ownAnswer: string
  durationMs: number
  correct: boolean
  index: number
}

export function buildSessionReviewItems(
  session: PracticeSession,
  units: PracticeUnit[],
): SessionReviewItem[] {
  return units.flatMap((unit) => unit.questions.map((question) => {
    const ownAnswer = session.answers[question.id] ?? ''
    return {
      question,
      context: unit.context,
      ownAnswer,
      durationMs: session.questionDurationMs[question.id] ?? 0,
      correct: questionAnswerIsCorrect(question, ownAnswer),
    }
  })).map((item, index) => ({ ...item, index }))
}
