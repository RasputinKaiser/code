import { hashContent } from '../../utils/hash.js'
import sliceAnsi from '../../utils/sliceAnsi.js'
import { countCharInString } from '../../utils/stringUtils.js'

export type HighlightedCodeRenderPlan = {
  lines: string[]
  gutterWidth: number
  gutters: string[] | null
  contents: string[] | null
}

type GetHighlightedCodeRenderPlanOptions = {
  code: string
  filePath: string
  theme: string
  width: number
  dim: boolean
  splitGutter: boolean
  renderLines: () => string[] | null
}

const RENDER_PLAN_CACHE_MAX = 8
const RENDER_PLAN_CACHE_MIN_CODE_LENGTH = 512
const renderPlanCache = new Map<string, HighlightedCodeRenderPlan>()

// Giant rendered file previews are one of the nastiest documented REPL failure
// modes: prompt->transcript remounts can rerun syntax highlighting, ANSI
// parsing, and thousands of per-line layout nodes, which is how we end up in
// the "freeze + multi-GB heap" regime. Keep only a tiny LRU of large rendered
// file plans hot so remounting the same visible file stays cheap without
// retaining unbounded file content in memory.
export function getCachedHighlightedCodeRenderPlan({
  code,
  filePath,
  theme,
  width,
  dim,
  splitGutter,
  renderLines,
}: GetHighlightedCodeRenderPlanOptions): HighlightedCodeRenderPlan | null {
  const rawGutterWidth = splitGutter ? computeGutterWidth(code) : 0
  const gutterWidth =
    rawGutterWidth > 0 && rawGutterWidth < width ? rawGutterWidth : 0
  const shouldCache = code.length >= RENDER_PLAN_CACHE_MIN_CODE_LENGTH
  const cacheKey = shouldCache
    ? `${hashContent(code)}|${filePath}|${theme}|${width}|${dim ? 1 : 0}|${gutterWidth}`
    : undefined

  if (cacheKey) {
    const hit = renderPlanCache.get(cacheKey)
    if (hit) {
      renderPlanCache.delete(cacheKey)
      renderPlanCache.set(cacheKey, hit)
      return hit
    }
  }

  const lines = renderLines()
  if (lines === null) {
    return null
  }

  let gutters: string[] | null = null
  let contents: string[] | null = null
  if (gutterWidth > 0) {
    gutters = lines.map(line => sliceAnsi(line, 0, gutterWidth))
    contents = lines.map(line => sliceAnsi(line, gutterWidth))
  }

  const plan: HighlightedCodeRenderPlan = {
    lines,
    gutterWidth,
    gutters,
    contents,
  }

  if (cacheKey) {
    if (renderPlanCache.size >= RENDER_PLAN_CACHE_MAX) {
      const oldestKey = renderPlanCache.keys().next().value
      if (oldestKey !== undefined) {
        renderPlanCache.delete(oldestKey)
      }
    }
    renderPlanCache.set(cacheKey, plan)
  }

  return plan
}

export function clearHighlightedCodeRenderPlanCache(): void {
  renderPlanCache.clear()
}

function computeGutterWidth(code: string): number {
  const lineCount = countCharInString(code, '\n') + 1
  return lineCount.toString().length + 2
}
