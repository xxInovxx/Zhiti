import type { Question, SourceFile } from '@/domain/models'

export const IMPORT_QUESTION_TYPES = ['SINGLE', 'MULTIPLE', 'JUDGE', 'FILL', 'CASE'] as const
export type ImportQuestionType = typeof IMPORT_QUESTION_TYPES[number]

export function questionImportType(question: Question): ImportQuestionType {
  if (question.nodeType === 'CASE' || question.nodeType === 'CASE_ITEM') return 'CASE'
  return question.answerMode as Exclude<ImportQuestionType, 'CASE'>
}

export interface ImportIssue {
  level: 'error' | 'warning'
  sheetName: string
  row: number
  message: string
}

export interface ParsedWorkbook {
  source: SourceFile
  questions: Question[]
  issues: ImportIssue[]
  counts: {
    single: number
    multiple: number
    judge: number
    fill: number
    cases: number
    caseItems: number
  }
}
