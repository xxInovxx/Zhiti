export function moveProjectId(order: string[], sourceId: string, targetId: string): string[] {
  const sourceIndex = order.indexOf(sourceId)
  const targetIndex = order.indexOf(targetId)
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return [...order]
  const result = [...order]
  const [moved] = result.splice(sourceIndex, 1)
  result.splice(targetIndex, 0, moved as string)
  return result
}

export function insertProjectId(order: string[], sourceId: string, targetIndex: number): string[] {
  const sourceIndex = order.indexOf(sourceId)
  if (sourceIndex < 0) return [...order]
  const result = order.filter((id) => id !== sourceId)
  const insertIndex = Math.max(0, Math.min(Math.trunc(targetIndex), result.length))
  result.splice(insertIndex, 0, sourceId)
  return result
}
