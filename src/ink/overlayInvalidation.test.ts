import { describe, expect, it } from 'bun:test'
import {
  captureOverlaySnapshot,
  shouldInvalidateOverlayFrame,
} from './overlayInvalidation.js'
import {
  clearSelection,
  createSelectionState,
  startSelection,
  updateSelection,
} from './selection.js'

function createSelectionSnapshot(
  startCol: number,
  startRow: number,
  endCol: number,
  endRow: number,
) {
  const selection = createSelectionState()
  startSelection(selection, startCol, startRow)
  updateSelection(selection, endCol, endRow)
  return captureOverlaySnapshot(selection, '')
}

describe('shouldInvalidateOverlayFrame', () => {
  it('does not invalidate when a selection first appears', () => {
    const previous = captureOverlaySnapshot(createSelectionState(), '')
    const current = createSelectionSnapshot(2, 4, 8, 6)

    expect(shouldInvalidateOverlayFrame(previous, current)).toBe(false)
  })

  it('does not invalidate when selection remains stable or expands over the prior region', () => {
    const previous = createSelectionSnapshot(2, 4, 8, 6)
    const stable = createSelectionSnapshot(2, 4, 8, 6)
    const expanded = createSelectionSnapshot(1, 3, 9, 7)

    expect(shouldInvalidateOverlayFrame(previous, stable)).toBe(false)
    expect(shouldInvalidateOverlayFrame(previous, expanded)).toBe(false)
  })

  it('invalidates when a prior selection shrinks or clears', () => {
    const previous = createSelectionSnapshot(2, 4, 8, 6)
    const shrunk = createSelectionSnapshot(3, 4, 7, 6)
    const clearedSelection = createSelectionState()
    clearSelection(clearedSelection)
    const cleared = captureOverlaySnapshot(clearedSelection, '')

    expect(shouldInvalidateOverlayFrame(previous, shrunk)).toBe(true)
    expect(shouldInvalidateOverlayFrame(previous, cleared)).toBe(true)
  })

  it('only invalidates search when a previous visible query changes or clears', () => {
    const empty = captureOverlaySnapshot(createSelectionState(), '')
    const active = captureOverlaySnapshot(createSelectionState(), 'todo')
    const same = captureOverlaySnapshot(createSelectionState(), 'todo')
    const changed = captureOverlaySnapshot(createSelectionState(), 'fixme')

    expect(shouldInvalidateOverlayFrame(empty, active)).toBe(false)
    expect(shouldInvalidateOverlayFrame(active, same)).toBe(false)
    expect(shouldInvalidateOverlayFrame(active, changed)).toBe(true)
    expect(shouldInvalidateOverlayFrame(active, empty)).toBe(true)
  })
})
