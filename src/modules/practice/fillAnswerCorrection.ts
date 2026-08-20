import type { LearningState, PracticeSession, Question } from '@/domain/models'
import { answersEqual, normalizeText, questionAnswerIsCorrect } from '@/domain/utils'

export interface FillAnswerCorrection {
  question: Question
  learningState: LearningState
  sessions: PracticeSession[]
  correctedAttemptCount: number
}

export function buildFillAnswerCorrection(
  question: Question,
  answer: string,
  learningState: LearningState,
  sessions: PracticeSession[],
): FillAnswerCorrection {
  if (question.answerMode !== 'FILL') throw new Error('只有填空题支持修正答案')
  const acceptedAnswer = normalizeText(answer)
  if (!acceptedAnswer) throw new Error('空答案不能修正为正确答案')
  if (questionAnswerIsCorrect(question, acceptedAnswer)) throw new Error('该答案已经是正确答案')

  const correctedQuestion: Question = {
    ...question,
    acceptedAnswers: [...(question.acceptedAnswers ?? []), acceptedAnswer],
  }
  const correctedSessions = sessions
    .filter((session) => session.gradedQuestionIds.includes(question.id)
      && Boolean(session.answers[question.id])
      && answersEqual(session.answers[question.id] ?? '', acceptedAnswer, 'FILL')
      && !questionAnswerIsCorrect(question, session.answers[question.id] ?? ''))
    .map((session) => ({
      ...session,
      correctCount: session.correctCount + Number(session.wrongCount > 0),
      wrongCount: Math.max(0, session.wrongCount - 1),
    }))

  const lastAnswerCorrected = learningState.lastResult === 'WRONG'
    && answersEqual(learningState.lastAnswer, acceptedAnswer, 'FILL')
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
