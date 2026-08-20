import type { PracticeSession, QuizProject } from '@/domain/models'

export interface PracticeHistoryItem {
  session: PracticeSession
  projectName: string
  questionCount: number
  correctRate: number
  practicedAt: string
}

export type PracticeHistoryTimeRange = 'ALL' | 'TODAY' | 'LAST_3_DAYS' | 'LAST_5_DAYS' | 'LAST_7_DAYS' | 'LAST_30_DAYS'

export interface PracticeHistoryFilters {
  timeRange: PracticeHistoryTimeRange
  projectKey: string
  mode: PracticeSession['mode'] | 'ALL'
}

function fallbackName(session: PracticeSession): string {
  if (session.mode === 'WRONG_REVIEW') return '学习中心 · 错题重练'
  if (session.mode === 'FAVORITE_REVIEW') return '学习中心 · 收藏重练'
  if (session.mode === 'NOTE_REVIEW') return '学习中心 · 备注重练'
  return session.projectId ? '已删除项目' : '专项练习'
}

export function buildPracticeHistory(
  sessions: PracticeSession[],
  projects: QuizProject[],
): PracticeHistoryItem[] {
  const projectNames = new Map(projects.map((project) => [project.id, project.name]))
  return sessions
    .filter((session) => session.status === 'COMPLETED' && (!session.projectId || projectNames.has(session.projectId)))
    .map((session) => {
      const questionCount = session.correctCount + session.wrongCount + session.unansweredCount
      return {
        session,
        projectName: session.projectId ? projectNames.get(session.projectId) ?? fallbackName(session) : fallbackName(session),
        questionCount,
        correctRate: questionCount ? session.correctCount / questionCount : 0,
        practicedAt: session.completedAt ?? session.startedAt,
      }
    })
    .sort((left, right) => right.practicedAt.localeCompare(left.practicedAt))
}

export function practiceModeLabel(mode: PracticeSession['mode']): string {
  return {
    EXAM: '随机组卷',
    RANDOM_CYCLE: '随机刷题',
    ORDERED: '顺序刷题',
    WRONG_REVIEW: '错题重练',
    FAVORITE_REVIEW: '收藏重练',
    NOTE_REVIEW: '备注重练',
  }[mode]
}

export function practiceHistoryProjectKey(item: PracticeHistoryItem): string {
  return item.session.projectId ?? `special:${item.projectName}`
}

export function filterPracticeHistory(
  items: PracticeHistoryItem[],
  filters: PracticeHistoryFilters,
  now = new Date(),
): PracticeHistoryItem[] {
  let startTime = Number.NEGATIVE_INFINITY
  if (filters.timeRange === 'TODAY') {
    startTime = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  } else if (filters.timeRange === 'LAST_3_DAYS') {
    startTime = now.getTime() - 3 * 24 * 60 * 60 * 1000
  } else if (filters.timeRange === 'LAST_5_DAYS') {
    startTime = now.getTime() - 5 * 24 * 60 * 60 * 1000
  } else if (filters.timeRange === 'LAST_7_DAYS') {
    startTime = now.getTime() - 7 * 24 * 60 * 60 * 1000
  } else if (filters.timeRange === 'LAST_30_DAYS') {
    startTime = now.getTime() - 30 * 24 * 60 * 60 * 1000
  }

  return items.filter((item) => {
    if (new Date(item.practicedAt).getTime() < startTime) return false
    if (filters.projectKey !== 'ALL' && practiceHistoryProjectKey(item) !== filters.projectKey) return false
    if (filters.mode !== 'ALL' && item.session.mode !== filters.mode) return false
    return true
  })
}
