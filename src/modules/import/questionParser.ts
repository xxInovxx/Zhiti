import type { AnswerMode, Question, QuestionOption } from '@/domain/models'
import { answerModeFromType, createId, isCaseType, normalizeAnswer, normalizeHeader, normalizeText } from '@/domain/utils'
import type { ImportIssue } from './importTypes'

export interface SheetRows {
  name: string
  rows: unknown[][]
}

interface ParseResult {
  questions: Question[]
  issues: ImportIssue[]
}

const REQUIRED_HEADERS = ['题型', '题干', '答案']
const OPTION_KEYS = 'ABCDEFGHI'.split('')

function createFingerprint(sheetName: string, row: number, stem: string): string {
  return `${sheetName}:${row}:${stem}`
}

function readOptions(row: unknown[], headerMap: Map<string, number>): QuestionOption[] {
  const options: QuestionOption[] = []
  for (const key of OPTION_KEYS) {
    const index = headerMap.get(key)
    const text = index === undefined ? '' : normalizeText(row[index])
    if (text) options.push({ key, text })
  }
  return options
}

function validateAnswerOptions(
  answer: string,
  options: QuestionOption[],
  sheetName: string,
  row: number,
  issues: ImportIssue[],
): void {
  const optionKeys = new Set(options.map((option) => option.key))
  for (const key of answer) {
    if (!optionKeys.has(key)) {
      issues.push({ level: 'error', sheetName, row, message: `答案引用了空选项 ${key}` })
    }
  }
}

export function parseSheetRows(sourceFileId: string, sheet: SheetRows, sortOffset = 0): ParseResult {
  const issues: ImportIssue[] = []
  const questions: Question[] = []
  const [headerRow, ...dataRows] = sheet.rows
  if (!headerRow) {
    return { questions, issues: [{ level: 'error', sheetName: sheet.name, row: 1, message: '工作表为空' }] }
  }

  const headerMap = new Map<string, number>()
  headerRow.forEach((value, index) => {
    const header = normalizeHeader(value)
    if (header && !headerMap.has(header)) headerMap.set(header, index)
  })
  for (const header of REQUIRED_HEADERS) {
    if (!headerMap.has(header)) {
      issues.push({ level: 'error', sheetName: sheet.name, row: 1, message: `缺少必需表头“${header}”` })
    }
  }
  if (issues.length) return { questions, issues }

  const typeIndex = headerMap.get('题型') as number
  const stemIndex = headerMap.get('题干') as number
  const answerIndex = headerMap.get('答案') as number
  const explanationIndex = headerMap.get('出自规范')
  let currentCase: Question | null = null

  dataRows.forEach((row, zeroIndex) => {
    const rowNumber = zeroIndex + 2
    if (row.every((value) => !normalizeText(value))) return
    const rawType = normalizeText(row[typeIndex])
    const stem = normalizeText(row[stemIndex])
    const rawAnswer = normalizeText(row[answerIndex])
    const explanation = explanationIndex === undefined ? '' : normalizeText(row[explanationIndex])

    if (!stem) {
      issues.push({ level: 'error', sheetName: sheet.name, row: rowNumber, message: '题干为空' })
      return
    }

    if (isCaseType(rawType) || (!rawType && currentCase)) {
      if (!rawAnswer) {
        const caseQuestion: Question = {
          id: createId(), sourceFileId, sheetName: sheet.name, sourceRow: rowNumber,
          parentId: null, nodeType: 'CASE', answerMode: 'NONE', stem,
          normalizedAnswer: '', acceptedAnswers: [], explanation, sortOrder: sortOffset + rowNumber,
          fingerprint: createFingerprint(sheet.name, rowNumber, stem), options: [],
        }
        questions.push(caseQuestion)
        currentCase = caseQuestion
        return
      }
      if (!currentCase) {
        issues.push({ level: 'error', sheetName: sheet.name, row: rowNumber, message: '案例小题之前没有答案为空的案例题干' })
        return
      }
      let answer = ''
      try {
        answer = normalizeAnswer(rawAnswer)
      } catch (error) {
        issues.push({ level: 'error', sheetName: sheet.name, row: rowNumber, message: (error as Error).message })
        return
      }
      const options = readOptions(row, headerMap)
      let mode: AnswerMode = answer.length > 1 ? 'MULTIPLE' : 'SINGLE'
      if (options.length === 0 && /^[AB]$/.test(answer)) {
        options.push({ key: 'A', text: '正确' }, { key: 'B', text: '错误' })
        mode = 'JUDGE'
        issues.push({ level: 'warning', sheetName: sheet.name, row: rowNumber, message: '案例小题无选项，已按判断题补充正确/错误' })
      }
      validateAnswerOptions(answer, options, sheet.name, rowNumber, issues)
      questions.push({
        id: createId(), sourceFileId, sheetName: sheet.name, sourceRow: rowNumber,
        parentId: currentCase.id, nodeType: 'CASE_ITEM', answerMode: mode, stem,
        normalizedAnswer: answer, acceptedAnswers: [], explanation, sortOrder: sortOffset + rowNumber,
        fingerprint: createFingerprint(sheet.name, rowNumber, stem), options,
      })
      return
    }

    currentCase = null
    const answerMode = answerModeFromType(rawType)
    if (!answerMode) {
      issues.push({ level: 'error', sheetName: sheet.name, row: rowNumber, message: `未知题型“${rawType || '空'}”` })
      return
    }
    if (!rawAnswer) {
      issues.push({ level: 'error', sheetName: sheet.name, row: rowNumber, message: '答案为空' })
      return
    }
    let answer = ''
    try {
      answer = normalizeAnswer(rawAnswer, answerMode)
    } catch (error) {
      issues.push({ level: 'error', sheetName: sheet.name, row: rowNumber, message: (error as Error).message })
      return
    }
    if (answerMode === 'SINGLE' && answer.length !== 1) {
      issues.push({ level: 'error', sheetName: sheet.name, row: rowNumber, message: '单选题答案必须只有一个选项' })
    }
    if (answerMode === 'MULTIPLE' && answer.length < 2) {
      issues.push({ level: 'warning', sheetName: sheet.name, row: rowNumber, message: '多选题答案只有一个选项，请确认' })
    }
    const options = answerMode === 'FILL' ? [] : readOptions(row, headerMap)
    if (answerMode === 'JUDGE' && options.length === 0) {
      options.push({ key: 'A', text: '正确' }, { key: 'B', text: '错误' })
    }
    if (answerMode !== 'FILL') validateAnswerOptions(answer, options, sheet.name, rowNumber, issues)
    questions.push({
      id: createId(), sourceFileId, sheetName: sheet.name, sourceRow: rowNumber,
      parentId: null, nodeType: 'NORMAL', answerMode, stem,
      normalizedAnswer: answer, acceptedAnswers: [], explanation, sortOrder: sortOffset + rowNumber,
      fingerprint: createFingerprint(sheet.name, rowNumber, stem), options,
    })
  })

  for (const caseQuestion of questions.filter((question) => question.nodeType === 'CASE')) {
    if (!questions.some((question) => question.parentId === caseQuestion.id)) {
      issues.push({ level: 'error', sheetName: sheet.name, row: caseQuestion.sourceRow, message: '案例题没有小题' })
    }
  }
  return { questions, issues }
}
