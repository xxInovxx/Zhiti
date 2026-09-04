const RESERVED_PROJECT_NAMES = new Set([
  '统计中心·错题重练',
  '统计中心·收藏重练',
])

export function isReservedProjectName(name: string): boolean {
  return RESERVED_PROJECT_NAMES.has(name.replace(/\s/g, ''))
}
