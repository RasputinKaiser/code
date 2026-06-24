import type { SelectionState } from './selection.js'
import { selectionBounds } from './selection.js'

type OverlaySelectionBounds = {
  startCol: number
  startRow: number
  endCol: number
  endRow: number
}

export type OverlaySnapshot = {
  selection: OverlaySelectionBounds | null
  searchQuery: string
}

export function captureOverlaySnapshot(
  selection: SelectionState,
  searchQuery: string,
): OverlaySnapshot {
  const bounds = selectionBounds(selection)
  return {
    selection: bounds
      ? {
          startCol: bounds.start.col,
          startRow: bounds.start.row,
          endCol: bounds.end.col,
          endRow: bounds.end.row,
        }
      : null,
    searchQuery,
  }
}

function containsSelection(
  outer: OverlaySelectionBounds | null,
  inner: OverlaySelectionBounds,
): boolean {
  if (!outer) return false
  const startsBefore =
    outer.startRow < inner.startRow ||
    (outer.startRow === inner.startRow && outer.startCol <= inner.startCol)
  const endsAfter =
    outer.endRow > inner.endRow ||
    (outer.endRow === inner.endRow && outer.endCol >= inner.endCol)
  return startsBefore && endsAfter
}

export function shouldInvalidateOverlayFrame(
  previous: OverlaySnapshot | null,
  current: OverlaySnapshot,
): boolean {
  if (!previous) return false

  const previousSelection = previous.selection
  const currentSelection = current.selection
  const selectionInvalidates =
    previousSelection !== null &&
    !containsSelection(currentSelection, previousSelection)

  const searchInvalidates =
    previous.searchQuery.length > 0 &&
    previous.searchQuery !== current.searchQuery

  return selectionInvalidates || searchInvalidates
}
