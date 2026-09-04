import type { LearningState, PracticeSession, Question } from '@/domain/models'
import { answersEqual, normalizeAnswer, normalizeText, questionAnswerIsCorrect } from '@/domain/utils'

export interface AnswerCorrection {
  question: Question
  learningState: LearningState
  sessions: PracticeSession[]
  correctedAttemptCount: number
}

/**
 * Build a correction for a previously graded answer.
 *
 * Fill-in questions keep the original answer and add another accepted answer.
 * Choice questions replace the original answer with the submitted answer so
 * that the corrected answer becomes the only canonical answer.
 */
export function buildAnswerCorrection(
  question: Question,
  answer: string,
  learningState: LearningState,
  sessions: PracticeSession[],
): AnswerCorrection {
  if (question.answerMode === 'NONE') throw new Error('该题型不支持修正答案')
  const correctedAnswer = question.answerMode === 'FILL'
    ? normalizeText(answer)
    : normalizeAnswer(answer, question.answerMode)
  if (!correctedAnswer) throw new Error('空答案不能修正为正确答案')
  if (questionAnswerIsCorrect(question, correctedAnswer)) throw new Error('该答案已经是正确答案')

  const correctedQuestion: Question = question.answerMode === 'FILL'
    ? {
      ...question,
      acceptedAnswers: [...(question.acceptedAnswers ?? []), correctedAnswer],
    }
    : {
      ...question,
      normalizedAnswer: correctedAnswer,
      acceptedAnswers: [],
    }
  const correctedSessions = sessions
    .filter((session) => session.gradedQuestionIds.includes(question.id)
      && Boolean(session.answers[question.id])
      && answersEqual(session.answers[question.id] ?? '', correctedAnswer, question.answerMode)
      && !questionAnswerIsCorrect(question, session.answers[question.id] ?? ''))
    .map((session) => ({
      ...session,
      correctCount: session.correctCount + Number(session.wrongCount > 0),
      wrongCount: Math.max(0, session.wrongCount - 1),
    }))

  const lastAnswerCorrected = learningState.lastResult === 'WRONG'
    && answersEqual(learningState.lastAnswer, correctedAnswer, question.answerMode)
    && !questionAnswerIsCorrect(question, learningState.lastAnswer)
  const requestedCorrections = Math.max(correctedSessions.length, Number(lastAnswerCorrected))
  const correctedAttemptCount = Math.min(learningState.wrongCount, requestedCorrections)
  const correctedLearningState: LearningState = {
    ...learningState,
    correctCount: learningState.correctCount + correctedAttemptCount,
    wrongCount: learningState.wrongCount - correctedAttemptCount,
    isWrongActive: lastAnswerCorrected ? false : learningState.isWrongActive,
    lastResult: lastAnswerCorrected ? 'CORRECT' : learningState.lastResult,
  }

  return {
    question: correctedQuestion,
    learningState: correctedLearningState,
    sessions: correctedSessions,
    correctedAttemptCount,
  }
}

/** Backwards-compatible name used by the existing fill-in correction tests. */
export type FillAnswerCorrection = AnswerCorrection

export function buildFillAnswerCorrection(
  question: Question,
  answer: string,
  learningState: LearningState,
  sessions: PracticeSession[],
): FillAnswerCorrection {
  if (question.answerMode !== 'FILL') throw new Error('只有填空题支持修正答案')
  return buildAnswerCorrection(question, answer, learningState, sessions)
}
