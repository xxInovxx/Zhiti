export interface SwipeVector {
  deltaX: number
  deltaY: number
}

export function horizontalSwipeOffset({ deltaX, deltaY }: SwipeVector): -1 | 0 | 1 {
  const horizontal = Math.abs(deltaX)
  const vertical = Math.abs(deltaY)
  if (horizontal < 90 || vertical > 65 || horizontal < vertical * 2.2) return 0
  return deltaX < 0 ? 1 : -1
}
