import type { Diff } from './frame.js'
import { recordOptimizerStats } from './optimizerStats.js'

/**
 * Optimize a diff by applying all optimization rules in a single pass.
 * This reduces the number of patches that need to be written to the terminal.
 *
 * Rules applied:
 * - Remove empty stdout patches
 * - Merge consecutive cursorMove patches
 * - Remove no-op cursorMove (0,0) patches
 * - Concat adjacent style patches (transition diffs — can't drop either)
 * - Dedupe consecutive hyperlinks with same URI
 * - Cancel cursor hide/show pairs
 * - Remove clear patches with count 0
 */
export function optimize(diff: Diff): Diff {
  const inputPatchTypeCounts = {
    stdout: 0,
    clear: 0,
    clearTerminal: 0,
    cursorHide: 0,
    cursorShow: 0,
    cursorMove: 0,
    cursorTo: 0,
    carriageReturn: 0,
    hyperlink: 0,
    styleStr: 0,
  } satisfies Record<Diff[number]['type'], number>
  let stdoutMergeCount = 0
  let noopCursorMoveDropCount = 0
  let cursorMoveMergeCount = 0
  let styleStrMergeCount = 0
  let cursorVisibilityCancelCount = 0

  if (diff.length <= 1) {
    for (const patch of diff) {
      inputPatchTypeCounts[patch.type] += 1
    }
    recordOptimizerStats({
      inputPatchCount: diff.length,
      inputPatchTypeCounts,
      outputPatchCount: diff.length,
      stdoutMergeCount,
      noopCursorMoveDropCount,
      cursorMoveMergeCount,
      styleStrMergeCount,
      cursorVisibilityCancelCount,
    })
    return diff
  }

  const result: Diff = []
  let len = 0

  for (const patch of diff) {
    const type = patch.type
    inputPatchTypeCounts[type] += 1

    // Skip no-ops
    if (type === 'stdout') {
      if (patch.content === '') continue
    } else if (type === 'cursorMove') {
      if (patch.x === 0 && patch.y === 0) {
        noopCursorMoveDropCount += 1
        continue
      }
    } else if (type === 'clear') {
      if (patch.count === 0) continue
    }

    // Try to merge with previous patch
    if (len > 0) {
      const lastIdx = len - 1
      const last = result[lastIdx]!
      const lastType = last.type

      // Merge consecutive cursorMove
      if (type === 'cursorMove' && lastType === 'cursorMove') {
        result[lastIdx] = {
          type: 'cursorMove',
          x: last.x + patch.x,
          y: last.y + patch.y,
        }
        cursorMoveMergeCount += 1
        continue
      }

      // Collapse consecutive cursorTo (only the last one matters)
      if (type === 'cursorTo' && lastType === 'cursorTo') {
        result[lastIdx] = patch
        continue
      }

      // Concat adjacent style patches. styleStr is a transition diff
      // (computed by diffAnsiCodes(from, to)), not a setter — dropping
      // the first is only sound if its undo-codes are a subset of the
      // second's, which is NOT guaranteed. e.g. [\e[49m, \e[2m]: dropping
      // the bg reset leaks it into the next \e[2J/\e[2K via BCE.
      if (type === 'stdout' && lastType === 'stdout') {
        // Giant rendered files/native fenced-code blocks still emit thousands
        // of adjacent stdout fragments. Coalescing them here is behavior-
        // preserving and lets us measure how much patch volume is pure
        // serialization churn versus deeper diff-generation work.
        result[lastIdx] = { type: 'stdout', content: last.content + patch.content }
        stdoutMergeCount += 1
        continue
      }

      if (type === 'styleStr' && lastType === 'styleStr') {
        result[lastIdx] = { type: 'styleStr', str: last.str + patch.str }
        styleStrMergeCount += 1
        continue
      }

      // Dedupe hyperlinks
      if (
        type === 'hyperlink' &&
        lastType === 'hyperlink' &&
        patch.uri === last.uri
      ) {
        continue
      }

      // Cancel cursor hide/show pairs
      if (
        (type === 'cursorShow' && lastType === 'cursorHide') ||
        (type === 'cursorHide' && lastType === 'cursorShow')
      ) {
        result.pop()
        len--
        cursorVisibilityCancelCount += 1
        continue
      }
    }

    result.push(patch)
    len++
  }

  recordOptimizerStats({
    inputPatchCount: diff.length,
    inputPatchTypeCounts,
    outputPatchCount: result.length,
    stdoutMergeCount,
    noopCursorMoveDropCount,
    cursorMoveMergeCount,
    styleStrMergeCount,
    cursorVisibilityCancelCount,
  })

  return result
}
