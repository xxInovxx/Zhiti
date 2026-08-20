import * as XLSX from 'xlsx'
import { createId, sha256 } from '@/domain/utils'
import type { ParsedWorkbook } from './importTypes'
import { parseSheetRows } from './questionParser'

export async function parseWorkbook(buffer: ArrayBuffer, fileName: string): Promise<ParsedWorkbook> {
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: false, cellFormula: false })
  const sourceId = createId()
  const digest = await sha256(buffer)
  const questions = []
  const issues = []
  let sortOffset = 0

  for (const name of workbook.SheetNames) {
    const worksheet = workbook.Sheets[name]
    if (!worksheet?.['!ref']) continue
    const rows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
      header: 1,
      defval: '',
      raw: false,
      blankrows: false,
    })
    if (!rows.length) continue
    const parsed = parseSheetRows(sourceId, { name, rows }, sortOffset)
    questions.push(...parsed.questions)
    issues.push(...parsed.issues)
    sortOffset += 100_000
  }

  const answerable = questions.filter((question) => question.answerMode !== 'NONE')
  return {
    source: {
      id: sourceId,
      name: fileName,
      sha256: digest,
      importedAt: new Date().toISOString(),
      sheets: workbook.SheetNames,
      questionCount: answerable.length,
      caseCount: questions.filter((question) => question.nodeType === 'CASE').length,
    },
    questions,
    issues,
    counts: {
      single: answerable.filter((question) => question.answerMode === 'SINGLE').length,
      multiple: answerable.filter((question) => question.answerMode === 'MULTIPLE').length,
      judge: answerable.filter((question) => question.answerMode === 'JUDGE').length,
      fill: answerable.filter((question) => question.answerMode === 'FILL').length,
      cases: questions.filter((question) => question.nodeType === 'CASE').length,
      caseItems: questions.filter((question) => question.nodeType === 'CASE_ITEM').length,
    },
  }
}
