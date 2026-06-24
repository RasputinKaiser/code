export type LocalApiMetricsEntry = {
  ttftMs: number
  firstTokenTime: number
  lastTokenTime: number
  responseLengthBaseline: number
  endResponseLength: number
}

export type LocalApiMetricsSummary = {
  ttftMs: number
  otps: number
  isP50: boolean
  hookDurationMs?: number
  hookCount?: number
  turnDurationMs?: number
  toolDurationMs?: number
  toolCount?: number
  classifierDurationMs?: number
  classifierCount?: number
  configWriteCount: number
}

export type BuildLocalApiMetricsSummaryOptions = {
  entries: LocalApiMetricsEntry[]
  hookDurationMs: number
  hookCount: number
  turnDurationMs: number
  toolDurationMs: number
  toolCount: number
  classifierDurationMs: number
  classifierCount: number
  configWriteCount: number
}

export function recordLocalApiMetricsEntry(
  entries: LocalApiMetricsEntry[],
  metrics: { ttftMs: number },
  baseline: number,
  nowMs: number,
): LocalApiMetricsEntry[] {
  return [
    ...entries,
    {
      ...metrics,
      firstTokenTime: nowMs,
      lastTokenTime: nowMs,
      responseLengthBaseline: baseline,
      endResponseLength: baseline,
    },
  ]
}

export function updateLocalApiMetricsForResponseLength(
  entries: LocalApiMetricsEntry[],
  previousLength: number,
  nextLength: number,
  nowMs: number,
): LocalApiMetricsEntry[] {
  if (nextLength <= previousLength || entries.length === 0) {
    return entries
  }

  const nextEntries = entries.slice()
  const lastEntry = nextEntries.at(-1)!
  nextEntries[nextEntries.length - 1] = {
    ...lastEntry,
    lastTokenTime: nowMs,
    endResponseLength: nextLength,
  }
  return nextEntries
}

export function medianRounded(values: readonly number[]): number | undefined {
  if (values.length === 0) return undefined

  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 0) {
    return Math.round((sorted[mid - 1]! + sorted[mid]!) / 2)
  }
  return sorted[mid]
}

export function computeOtps(entry: LocalApiMetricsEntry): number {
  const delta = Math.round(
    (entry.endResponseLength - entry.responseLengthBaseline) / 4,
  )
  const samplingMs = entry.lastTokenTime - entry.firstTokenTime
  return samplingMs > 0 ? Math.round(delta / (samplingMs / 1000)) : 0
}

export function buildLocalApiMetricsSummary(
  options: BuildLocalApiMetricsSummaryOptions,
): LocalApiMetricsSummary | undefined {
  const {
    entries,
    hookDurationMs,
    hookCount,
    turnDurationMs,
    toolDurationMs,
    toolCount,
    classifierDurationMs,
    classifierCount,
    configWriteCount,
  } = options

  if (entries.length === 0) {
    return undefined
  }

  const ttfts = entries.map(entry => entry.ttftMs)
  const otpsValues = entries.map(computeOtps)
  const isP50 = entries.length > 1

  const p50Ttft = medianRounded(ttfts)
  const p50Otps = medianRounded(otpsValues)

  const ttftMs = isP50 ? p50Ttft : ttfts[0]
  const otps = isP50 ? p50Otps : otpsValues[0]
  if (ttftMs === undefined || otps === undefined) {
    return undefined
  }

  return {
    ttftMs,
    otps,
    isP50,
    hookDurationMs: hookDurationMs > 0 ? hookDurationMs : undefined,
    hookCount: hookCount > 0 ? hookCount : undefined,
    turnDurationMs: turnDurationMs > 0 ? turnDurationMs : undefined,
    toolDurationMs: toolDurationMs > 0 ? toolDurationMs : undefined,
    toolCount: toolCount > 0 ? toolCount : undefined,
    classifierDurationMs:
      classifierDurationMs > 0 ? classifierDurationMs : undefined,
    classifierCount: classifierCount > 0 ? classifierCount : undefined,
    configWriteCount,
  }
}
