export type FencedCodeFallbackReason =
  | 'dim-color'
  | 'no-terminal-width'
  | 'native-unavailable'

export type FencedCodeRenderStatsSnapshot = {
  totalRenders: number
  nativeRenderCount: number
  ansiFallbackCount: number
  fallbackReasons: Readonly<Record<FencedCodeFallbackReason, number>>
  lastPath: 'native' | 'ansi-fallback' | null
  lastFallbackReason: FencedCodeFallbackReason | null
  lastTerminalWidth: number | null
  lastCodeLength: number
  lastLanguage: string | null
  lastNativeLineCount: number
}

const INITIAL_FALLBACK_REASONS: Record<FencedCodeFallbackReason, number> = {
  'dim-color': 0,
  'no-terminal-width': 0,
  'native-unavailable': 0,
}

let stats: FencedCodeRenderStatsSnapshot = makeInitialStats()

function makeInitialStats(): FencedCodeRenderStatsSnapshot {
  return {
    totalRenders: 0,
    nativeRenderCount: 0,
    ansiFallbackCount: 0,
    fallbackReasons: { ...INITIAL_FALLBACK_REASONS },
    lastPath: null,
    lastFallbackReason: null,
    lastTerminalWidth: null,
    lastCodeLength: 0,
    lastLanguage: null,
    lastNativeLineCount: 0,
  }
}

export function recordNativeFencedCodeRender(params: {
  language: string | null
  terminalWidth: number
  codeLength: number
  nativeLineCount: number
}): void {
  stats = {
    ...stats,
    totalRenders: stats.totalRenders + 1,
    nativeRenderCount: stats.nativeRenderCount + 1,
    lastPath: 'native',
    lastFallbackReason: null,
    lastTerminalWidth: params.terminalWidth,
    lastCodeLength: params.codeLength,
    lastLanguage: params.language,
    lastNativeLineCount: params.nativeLineCount,
  }
}

export function recordFencedCodeAnsiFallback(params: {
  language: string | null
  terminalWidth: number
  codeLength: number
  reason: FencedCodeFallbackReason
}): void {
  stats = {
    ...stats,
    totalRenders: stats.totalRenders + 1,
    ansiFallbackCount: stats.ansiFallbackCount + 1,
    fallbackReasons: {
      ...stats.fallbackReasons,
      [params.reason]: stats.fallbackReasons[params.reason] + 1,
    },
    lastPath: 'ansi-fallback',
    lastFallbackReason: params.reason,
    lastTerminalWidth: params.terminalWidth,
    lastCodeLength: params.codeLength,
    lastLanguage: params.language,
    lastNativeLineCount: 0,
  }
}

export function getFencedCodeRenderStatsSnapshot(): FencedCodeRenderStatsSnapshot {
  return {
    ...stats,
    fallbackReasons: { ...stats.fallbackReasons },
  }
}

export function resetFencedCodeRenderStatsForTesting(): void {
  stats = makeInitialStats()
}
