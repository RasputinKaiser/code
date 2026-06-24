import type { Rectangle } from './layout/geometry.js'

export type LayoutDamageRows = {
  y: number
  height: number
}

function normalizeRows(
  y: number,
  height: number,
): LayoutDamageRows | null {
  if (!Number.isFinite(y) || !Number.isFinite(height) || height <= 0) {
    return null
  }
  const top = Math.floor(y)
  const bottom = Math.ceil(y + height)
  if (!Number.isFinite(top) || !Number.isFinite(bottom) || bottom <= top) {
    return null
  }
  return { y: top, height: bottom - top }
}

export function addLayoutDamageRows(
  current: LayoutDamageRows | null,
  y: number,
  height: number,
): LayoutDamageRows | null {
  const next = normalizeRows(y, height)
  if (!next) return current
  if (!current) return next

  const top = Math.min(current.y, next.y)
  const bottom = Math.max(current.y + current.height, next.y + next.height)
  return { y: top, height: bottom - top }
}

export function addLayoutDamageRect(
  current: LayoutDamageRows | null,
  rect: Pick<Rectangle, 'y' | 'height'>,
): LayoutDamageRows | null {
  return addLayoutDamageRows(current, rect.y, rect.height)
}

export function addLayoutTransitionDamage(
  current: LayoutDamageRows | null,
  previousRect: Pick<Rectangle, 'y' | 'height'> | undefined,
  nextRect: Pick<Rectangle, 'y' | 'height'> | undefined,
): LayoutDamageRows | null {
  let rows = current
  if (previousRect) {
    rows = addLayoutDamageRect(rows, previousRect)
  }
  if (nextRect) {
    rows = addLayoutDamageRect(rows, nextRect)
  }
  return rows
}

export function toFullWidthDamageRect(
  rows: LayoutDamageRows | null,
  screenWidth: number,
  screenHeight: number,
): Rectangle | null {
  if (!rows || screenWidth <= 0 || screenHeight <= 0) {
    return null
  }

  const y1 = Math.max(0, Math.min(rows.y, screenHeight))
  const y2 = Math.max(0, Math.min(rows.y + rows.height, screenHeight))
  if (y2 <= y1) {
    return null
  }

  return {
    x: 0,
    y: y1,
    width: screenWidth,
    height: y2 - y1,
  }
}
