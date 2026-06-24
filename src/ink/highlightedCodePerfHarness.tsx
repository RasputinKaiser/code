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
import { clearHighlightedCodeRenderPlanCache } from '../components/HighlightedCode/renderPlan.js'

export type HighlightedCodePerfSummary = {
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
}

export type HighlightedCodeMountScenarioResult = {
  explicitWidthColdSummary: HighlightedCodePerfSummary
  explicitWidthRemountSummary: HighlightedCodePerfSummary
  implicitWidthColdSummary: HighlightedCodePerfSummary
}

type MountedHighlightedCode = {
  root: Root
  terminal: ReturnType<typeof createFakeTerminal>
  frames: FrameEvent[]
}

/**
 * This fixture is intentionally much larger than a normal snippet. The bad
 * production failures come from long sessions that keep giant rendered file
 * previews alive in the transcript, not from tiny examples.
 */
export function makeLargeRenderedFileCode(
  lineCount = 640,
  lineWidth = 96,
): string {
  return Array.from(
    { length: lineCount },
    (_, line) =>
      `export const value_${line.toString(36).padStart(3, '0')} = '${`${line}`.padEnd(lineWidth, 'x')}';`,
  ).join('\n')
}

function summarizeFrames(
  scenario: string,
  frames: FrameEvent[],
): HighlightedCodePerfSummary {
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
  }
}

async function mountHighlightedCode(
  code: string,
  filePath: string,
  width?: number,
): Promise<MountedHighlightedCode> {
  installReplPerfEnvironment()

  const { App } = await import('../components/App.js')
  const { HighlightedCode } = await import('../components/HighlightedCode.js')

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
        {width === undefined ? <HighlightedCode code={code} filePath={filePath} /> : <HighlightedCode code={code} filePath={filePath} width={width} />}
      </Box>
    </App>,
  )

  await waitFor(
    () => frames.length > 0,
    'HighlightedCode never rendered a frame',
  )
  await waitFor(() => {
    const ink = getMountedInkProbe(terminal)
    return ink
      ? readScreenText(ink.frontFrame.screen).includes('export const value_')
      : false
  }, 'HighlightedCode never painted the rendered file preview')
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

export async function runHighlightedCodeMountScenario(): Promise<HighlightedCodeMountScenarioResult> {
  return withPerfEnv(async () => {
    const code = makeLargeRenderedFileCode()
    const filePath = 'src/huge-rendered-file.ts'
    const width = 112

    clearHighlightedCodeRenderPlanCache()

    const first = await mountHighlightedCode(code, filePath, width)
    const explicitWidthColdSummary = summarizeFrames(
      'highlighted-code explicit-width cold mount',
      first.frames,
    )
    first.root.unmount()
    await Bun.sleep(0)

    const second = await mountHighlightedCode(code, filePath, width)
    const explicitWidthRemountSummary = summarizeFrames(
      'highlighted-code explicit-width remount',
      second.frames,
    )
    second.root.unmount()
    await Bun.sleep(0)

    clearHighlightedCodeRenderPlanCache()
    const implicit = await mountHighlightedCode(code, filePath)
    const implicitWidthColdSummary = summarizeFrames(
      'highlighted-code implicit-width cold mount',
      implicit.frames,
    )
    implicit.root.unmount()
    await Bun.sleep(0)

    return {
      explicitWidthColdSummary,
      explicitWidthRemountSummary,
      implicitWidthColdSummary,
    }
  })
}
