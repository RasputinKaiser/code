import React from 'react'
import type { FrameEvent } from './frame.js'
import {
  createFakeTerminal,
  getMountedInkProbe,
  installReplPerfEnvironment,
  readScreenText,
  waitFor,
} from './replPerfHarness.js'
import { createRoot, type Root } from './root.js'
import { getDefaultAppState } from '../state/AppState.js'
import { Box } from '../ink.js'
import {
  getFencedCodeRenderStatsSnapshot,
  resetFencedCodeRenderStatsForTesting,
} from '../components/Markdown/fencedCodeRenderStats.js'
import {
  getMarkdownRenderStatsSnapshot,
  resetMarkdownRenderStatsForTesting,
} from '../components/Markdown/markdownRenderStats.js'
import { clearMarkdownRenderCaches } from '../components/Markdown.js'
import { clearAnsiSpanCache } from './Ansi.js'
import {
  getRawAnsiRenderStatsSnapshot,
  resetRawAnsiRenderStatsForTesting,
} from './components/rawAnsiRenderStats.js'
import { resetRawAnsiJoinCachesForTesting } from './components/RawAnsi.js'
import {
  getTerminalWriteStatsSnapshot,
  resetTerminalWriteStatsForTesting,
} from './terminalWriteStats.js'
import {
  getOptimizerStatsSnapshot,
  resetOptimizerStatsForTesting,
} from './optimizerStats.js'
import {
  getLogUpdateRenderStatsSnapshot,
  resetLogUpdateRenderStatsForTesting,
} from './logUpdateRenderStats.js'
import {
  getOutputRenderStatsSnapshot,
  resetOutputRenderStatsForTesting,
} from './outputRenderStats.js'
import {
  getNativeFencedCodeRendererDebugSnapshot,
  resetNativeFencedCodeRendererCacheForTesting,
} from '../utils/markdown/nativeFencedCodeRenderer.js'

export type MarkdownPerfSummary = {
  scenario: string
  frames: number
  totalBytes: number
  maxBytes: number
  totalDurationMs: number
  maxDurationMs: number
  maxMeasured: number
  maxVisited: number
  totalPatches: number
  maxPatches: number
  flickerFrames: number
  markdownRender: ReturnType<typeof getMarkdownRenderStatsSnapshot>
  fencedCode: ReturnType<typeof getFencedCodeRenderStatsSnapshot>
  rawAnsi: ReturnType<typeof getRawAnsiRenderStatsSnapshot>
  optimizer: ReturnType<typeof getOptimizerStatsSnapshot>
  logUpdate: ReturnType<typeof getLogUpdateRenderStatsSnapshot>
  output: ReturnType<typeof getOutputRenderStatsSnapshot>
  terminalWrite: ReturnType<typeof getTerminalWriteStatsSnapshot>
  nativeRenderer: ReturnType<typeof getNativeFencedCodeRendererDebugSnapshot>
}

export type MarkdownMountScenarioResult = {
  coldSummary: MarkdownPerfSummary
  remountSummary: MarkdownPerfSummary
}

type MountedMarkdown = {
  root: Root
  terminal: ReturnType<typeof createFakeTerminal>
  frames: FrameEvent[]
}

/**
 * This fixture is intentionally oversized. The bad production failures come
 * from long transcripts carrying giant fenced code blocks, not tiny examples.
 */
export function makeLargeMarkdownCodeFence(
  lineCount = 640,
  lineWidth = 96,
): string {
  const lines = Array.from(
    { length: lineCount },
    (_, line) =>
      `export const value_${line.toString(36).padStart(3, '0')} = '${`${line}`.padEnd(lineWidth, 'x')}';`,
  )

  return ['assistant summary', '', '```ts', ...lines, '```'].join('\n')
}

function summarizeFrames(
  scenario: string,
  frames: FrameEvent[],
): MarkdownPerfSummary {
  return {
    scenario,
    frames: frames.length,
    totalBytes: frames.reduce(
      (sum, frame) => sum + (frame.phases?.bytes ?? 0),
      0,
    ),
    maxBytes: Math.max(...frames.map(frame => frame.phases?.bytes ?? 0), 0),
    totalDurationMs: frames.reduce((sum, frame) => sum + frame.durationMs, 0),
    maxDurationMs: Math.max(...frames.map(frame => frame.durationMs), 0),
    maxMeasured: Math.max(
      ...frames.map(frame => frame.phases?.yogaMeasured ?? 0),
      0,
    ),
    maxVisited: Math.max(
      ...frames.map(frame => frame.phases?.yogaVisited ?? 0),
      0,
    ),
    totalPatches: frames.reduce(
      (sum, frame) => sum + (frame.phases?.patches ?? 0),
      0,
    ),
    maxPatches: Math.max(...frames.map(frame => frame.phases?.patches ?? 0), 0),
    flickerFrames: frames.reduce(
      (sum, frame) => sum + (frame.flickers.length > 0 ? 1 : 0),
      0,
    ),
    markdownRender: getMarkdownRenderStatsSnapshot(),
    fencedCode: getFencedCodeRenderStatsSnapshot(),
    rawAnsi: getRawAnsiRenderStatsSnapshot(),
    optimizer: getOptimizerStatsSnapshot(),
    logUpdate: getLogUpdateRenderStatsSnapshot(),
    output: getOutputRenderStatsSnapshot(),
    terminalWrite: getTerminalWriteStatsSnapshot(),
    nativeRenderer: getNativeFencedCodeRendererDebugSnapshot(),
  }
}

async function mountMarkdown(
  content: string,
  width: number,
): Promise<MountedMarkdown> {
  installReplPerfEnvironment()

  const { App } = await import('../components/App.js')
  const { Markdown } = await import('../components/Markdown.js')

  const terminal = createFakeTerminal(140, 32)
  const frames: FrameEvent[] = []
  const root = await createRoot({
    stdout: terminal.stdout,
    stdin: terminal.stdin,
    stderr: terminal.stderr,
    exitOnCtrlC: false,
    patchConsole: false,
    onFrame: event => {
      frames.push(event)
    },
  })

  root.render(
    <App getFpsMetrics={() => undefined} initialState={getDefaultAppState()}>
      <Box width={width + 2} flexDirection="column">
        <Markdown>{content}</Markdown>
      </Box>
    </App>,
  )

  await waitFor(() => frames.length > 0, 'Markdown never rendered a frame')
  await waitFor(() => {
    const ink = getMountedInkProbe(terminal)
    return ink
      ? readScreenText(ink.frontFrame.screen).includes('export const value_')
      : false
  }, 'Markdown never painted the fenced code block')
  await Bun.sleep(120)

  return { root, terminal, frames }
}

async function withPerfEnv<T>(fn: () => Promise<T>): Promise<T> {
  const prevNoFlicker = process.env.CLAUDE_CODE_NO_FLICKER
  const prevApiKey = process.env.ANTHROPIC_API_KEY
  process.env.CLAUDE_CODE_NO_FLICKER = '1'
  process.env.ANTHROPIC_API_KEY = 'test-key'

  try {
    return await fn()
  } finally {
    if (prevNoFlicker === undefined) {
      delete process.env.CLAUDE_CODE_NO_FLICKER
    } else {
      process.env.CLAUDE_CODE_NO_FLICKER = prevNoFlicker
    }

    if (prevApiKey === undefined) {
      delete process.env.ANTHROPIC_API_KEY
    } else {
      process.env.ANTHROPIC_API_KEY = prevApiKey
    }
  }
}

export async function runMarkdownMountScenario(): Promise<MarkdownMountScenarioResult> {
  return withPerfEnv(async () => {
    const content = makeLargeMarkdownCodeFence()
    const width = 112

    clearMarkdownRenderCaches()
    clearAnsiSpanCache()
    resetRawAnsiJoinCachesForTesting()
    resetMarkdownRenderStatsForTesting()
    resetFencedCodeRenderStatsForTesting()
    resetRawAnsiRenderStatsForTesting()
    resetOptimizerStatsForTesting()
    resetLogUpdateRenderStatsForTesting()
    resetOutputRenderStatsForTesting()
    resetTerminalWriteStatsForTesting()
    resetNativeFencedCodeRendererCacheForTesting()
    const first = await mountMarkdown(content, width)
    const coldSummary = summarizeFrames(
      'markdown fenced-code cold mount',
      first.frames,
    )
    first.root.unmount()
    await Bun.sleep(0)

    resetMarkdownRenderStatsForTesting()
    resetFencedCodeRenderStatsForTesting()
    resetRawAnsiRenderStatsForTesting()
    resetOptimizerStatsForTesting()
    resetLogUpdateRenderStatsForTesting()
    resetOutputRenderStatsForTesting()
    resetTerminalWriteStatsForTesting()
    resetNativeFencedCodeRendererCacheForTesting()
    const second = await mountMarkdown(content, width)
    const remountSummary = summarizeFrames(
      'markdown fenced-code remount',
      second.frames,
    )
    second.root.unmount()
    await Bun.sleep(0)

    return {
      coldSummary,
      remountSummary,
    }
  })
}
