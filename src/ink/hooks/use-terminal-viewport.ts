import { useCallback, useContext, useLayoutEffect, useRef } from 'react'
import { TerminalSizeContext } from '../components/TerminalSizeContext.js'
import type { DOMElement } from '../dom.js'

type ViewportEntry = {
  /**
   * Whether the element is currently within the terminal viewport
   */
  isVisible: boolean
}

export function calculateTerminalViewportBounds(options: {
  screenHeight: number
  rows: number
}): { viewportY: number; viewportBottom: number } {
  const { screenHeight, rows } = options
  // log-update treats exactly-filling content as one scrollback row because
  // cursor restore parks on the row after content and emits an LF at the
  // bottom edge. Keep visibility math aligned so offscreen freeze decisions
  // do not re-animate rows the renderer can no longer update in place.
  const cursorRestoreScroll = screenHeight >= rows ? 1 : 0
  const viewportY = Math.max(0, screenHeight - rows) + cursorRestoreScroll
  return {
    viewportY,
    viewportBottom: viewportY + rows,
  }
}

/**
 * Hook to detect if a component is within the terminal viewport.
 *
 * Returns a callback ref and a viewport entry object.
 * Attach the ref to the component you want to track.
 *
 * The entry is updated during the layout phase (useLayoutEffect) so callers
 * always read fresh values during render. Visibility changes do NOT trigger
 * re-renders on their own — callers that re-render for other reasons (e.g.
 * animation ticks, state changes) will pick up the latest value naturally.
 * This avoids infinite update loops when combined with other layout effects
 * that also call setState.
 *
 * @example
 * const [ref, entry] = useTerminalViewport()
 * return <Box ref={ref}><Animation enabled={entry.isVisible}>...</Animation></Box>
 */
export function useTerminalViewport(): [
  ref: (element: DOMElement | null) => void,
  entry: ViewportEntry,
] {
  const terminalSize = useContext(TerminalSizeContext)
  const elementRef = useRef<DOMElement | null>(null)
  const entryRef = useRef<ViewportEntry>({ isVisible: true })

  const setElement = useCallback((el: DOMElement | null) => {
    elementRef.current = el
  }, [])

  // Runs on every render because yoga layout values can change
  // without React being aware. Only updates the ref — no setState
  // to avoid cascading re-renders during the commit phase.
  // Walks the DOM ancestor chain fresh each time to avoid holding stale
  // references after yoga tree rebuilds.
  useLayoutEffect(() => {
    const element = elementRef.current
    if (!element?.yogaNode || !terminalSize) {
      return
    }

    const height = element.yogaNode.getComputedHeight()
    const rows = terminalSize.rows

    // Walk the DOM parent chain (not yoga.getParent()) so we can detect
    // scroll containers and subtract their scrollTop. Yoga computes layout
    // positions without scroll offset — scrollTop is applied at render time.
    // Without this, an element inside a ScrollBox whose yoga position exceeds
    // terminalRows would be considered offscreen even when scrolled into view
    // (e.g., the spinner in fullscreen mode after enough messages accumulate).
    let absoluteTop = element.yogaNode.getComputedTop()
    let parent: DOMElement | undefined = element.parentNode
    let root = element.yogaNode
    while (parent) {
      if (parent.yogaNode) {
        absoluteTop += parent.yogaNode.getComputedTop()
        root = parent.yogaNode
      }
      // scrollTop is only ever set on scroll containers (by ScrollBox + renderer).
      // Non-scroll nodes have undefined scrollTop → falsy fast-path.
      if (parent.scrollTop) absoluteTop -= parent.scrollTop
      parent = parent.parentNode
    }

    // Only the root's height matters
    const screenHeight = root.getComputedHeight()

    const bottom = absoluteTop + height
    const { viewportY, viewportBottom } = calculateTerminalViewportBounds({
      screenHeight,
      rows,
    })
    const visible = bottom > viewportY && absoluteTop < viewportBottom

    if (visible !== entryRef.current.isVisible) {
      entryRef.current = { isVisible: visible }
    }
  })

  return [setElement, entryRef.current]
}
