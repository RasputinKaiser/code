import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { spawnSync } from 'child_process'
import { getCanonicalNcodeConfigHomeDir } from '../../utils/envUtils.js'
import type { ToolUseContext } from '../../Tool.js'
import type { LocalCommandResult } from '../../types/command.js'
import { requestReplTranscriptResetRedraw } from '../../session/replTranscriptResetRedraw.js'
import instances from '../../ink/instances.js'
import { cellAt, type Screen } from '../../ink/screen.js'

type FrameLike = {
  screen?: Screen
  viewport?: { width?: number; height?: number }
  cursor?: { x?: number; y?: number; visible?: boolean }
}

type InkLike = {
  frontFrame?: FrameLike
  backFrame?: FrameLike
  logicalFrontFrame?: FrameLike
  logicalBackFrame?: FrameLike
  displayCursor?: unknown
  cursorDeclaration?: {
    relativeX?: number
    relativeY?: number
    node?: { nodeName?: string }
  } | null
  prevFrameContaminated?: unknown
  altScreenActive?: unknown
  mainScreenPendingRepaintFromHome?: unknown
  mainScreenPendingClearBeforePaint?: unknown
}

type SourceRows = {
  source: string
  rows: string[]
}

type StructuralDiff = {
  source: string
  row: number
  expected: string
  actual: string
}

type RendererStructuralProbe = {
  sources: SourceRows[]
  structuralDiffs: StructuralDiff[]
  observedPaneHeight?: number
  verdict:
    | 'clean'
    | 'terminal_only'
    | 'front_corrupt'
    | 'logical_corrupt'
    | 'backframe_corrupt'
    | 'not_observed'
    | 'mixed_or_unknown'
}

function screenRows(screen: Screen | undefined): string[] {
  if (!screen) return []
  const rows: string[] = []
  for (let y = 0; y < screen.height; y += 1) {
    let row = ''
    for (let x = 0; x < screen.width; x += 1) {
      row += cellAt(screen, x, y)?.char ?? ' '
    }
    rows.push(row.trimEnd())
  }
  return rows
}

type RowDiff = {
  row: number
  expected: string
  actual: string
}

function compareRows(expected: string[], actual: string[]): RowDiff[] {
  const diffs: RowDiff[] = []
  const maxLen = Math.max(expected.length, actual.length)
  for (let i = 0; i < maxLen; i += 1) {
    const e = expected[i] ?? ''
    const a = actual[i] ?? ''
    if (e !== a) {
      diffs.push({ row: i, expected: e, actual: a })
    }
  }
  return diffs
}

export function selectObservedFrameRows(
  tmuxPaneText: string | undefined,
  frameHeight: number,
  paneHeight: number | undefined,
): string[] {
  if (!tmuxPaneText || frameHeight <= 0) return []
  const lines = tmuxPaneText.split('\n').map(row => row.trimEnd())
  const visibleHeight =
    paneHeight !== undefined && paneHeight > 0 ? paneHeight : frameHeight
  const visibleRows = lines.slice(-visibleHeight)
  return visibleRows.slice(0, frameHeight)
}

function buildRendererStructuralProbe(
  ink: InkLike | undefined,
  tmuxPane: { text?: string; paneHeight?: number },
): RendererStructuralProbe {
  const frontRows = screenRows(ink?.frontFrame?.screen)
  const logicalFrontRows = screenRows(ink?.logicalFrontFrame?.screen)
  const backRows = screenRows(ink?.backFrame?.screen)
  const logicalBackRows = screenRows(ink?.logicalBackFrame?.screen)

  // capture-pane may include scrollback plus the full visible pane. The app
  // frame is painted from the viewport top and may be shorter than the pane,
  // so compare it with the top of the visible pane, not the last N rows.
  const tmuxVisibleRows = selectObservedFrameRows(
    tmuxPane.text,
    frontRows.length,
    tmuxPane.paneHeight,
  )

  const structuralDiffs: StructuralDiff[] = []

  function addDiffs(label: string, diffs: RowDiff[]) {
    for (const diff of diffs) {
      structuralDiffs.push({
        source: label,
        row: diff.row,
        expected: diff.expected,
        actual: diff.actual,
      })
    }
  }

  const frontVsTmux = compareRows(frontRows, tmuxVisibleRows)
  addDiffs('tmux_vs_front', frontVsTmux)

  const logicalFrontVsFront = compareRows(
    logicalFrontRows.slice(-frontRows.length),
    frontRows,
  )
  addDiffs('logical_vs_front', logicalFrontVsFront)

  const logicalBackVsBack = compareRows(
    logicalBackRows.slice(-backRows.length),
    backRows,
  )
  addDiffs('logical_vs_back', logicalBackVsBack)

  const hasFrontTmuxDiff = frontVsTmux.length > 0
  const hasLogicalFrontDiff = logicalFrontVsFront.length > 0
  const hasLogicalBackDiff = logicalBackVsBack.length > 0

  const verdict: RendererStructuralProbe['verdict'] =
    !ink && !tmuxPane.text
      ? 'not_observed'
      : !hasFrontTmuxDiff && !hasLogicalFrontDiff && !hasLogicalBackDiff
        ? 'clean'
        : hasLogicalFrontDiff
          ? 'logical_corrupt'
          : hasLogicalBackDiff
            ? 'backframe_corrupt'
            : hasFrontTmuxDiff
              ? 'terminal_only'
              : 'mixed_or_unknown'

  return {
    sources: [
      { source: 'frontFrame', rows: frontRows },
      { source: 'logicalFrontFrame', rows: logicalFrontRows },
      { source: 'backFrame', rows: backRows },
      { source: 'logicalBackFrame', rows: logicalBackRows },
      ...(tmuxPane.text ? [{ source: 'tmuxPane', rows: tmuxVisibleRows }] : []),
    ],
    structuralDiffs,
    observedPaneHeight: tmuxPane.paneHeight,
    verdict,
  }
}

function frameSummary(frame: FrameLike | undefined) {
  if (!frame) return undefined
  return {
    screen: {
      width: frame.screen?.width,
      height: frame.screen?.height,
    },
    viewport: {
      width: frame.viewport?.width,
      height: frame.viewport?.height,
    },
    cursor: frame.cursor,
  }
}

function getInk(stdout: NodeJS.WriteStream): InkLike | undefined {
  return instances.get(stdout) as unknown as InkLike | undefined
}

function getInkSummary(stdout: NodeJS.WriteStream) {
  const ink = getInk(stdout)
  if (!ink) return { present: false }
  return {
    present: true,
    frontFrame: frameSummary(ink.frontFrame),
    backFrame: frameSummary(ink.backFrame),
    logicalFrontFrame: frameSummary(ink.logicalFrontFrame),
    logicalBackFrame: frameSummary(ink.logicalBackFrame),
    displayCursor: ink.displayCursor,
    cursorDeclaration: ink.cursorDeclaration
      ? {
          relativeX: ink.cursorDeclaration.relativeX,
          relativeY: ink.cursorDeclaration.relativeY,
          nodeName: ink.cursorDeclaration.node?.nodeName,
        }
      : ink.cursorDeclaration,
    prevFrameContaminated: ink.prevFrameContaminated,
    altScreenActive: ink.altScreenActive,
    mainScreenPendingRepaintFromHome: ink.mainScreenPendingRepaintFromHome,
    mainScreenPendingClearBeforePaint: ink.mainScreenPendingClearBeforePaint,
  }
}

function captureTmuxPane(): { text?: string; paneHeight?: number; error?: string } {
  const tmux = process.env.TMUX
  if (!tmux) return {}

  const socketPath = tmux.split(',')[0]
  if (!socketPath) return { error: 'TMUX was set but no socket path was present' }

  const paneId = spawnSync(
    'tmux',
    ['-S', socketPath, 'display-message', '-p', '#{pane_id}'],
    { encoding: 'utf8', timeout: 1000 },
  )
  if (paneId.status !== 0) {
    return { error: paneId.stderr?.trim() || 'tmux display-message failed' }
  }

  const targetPane = paneId.stdout.trim()
  if (!targetPane) return { error: 'tmux returned an empty pane id' }

  const paneHeight = spawnSync(
    'tmux',
    ['-S', socketPath, 'display-message', '-p', '-t', targetPane, '#{pane_height}'],
    { encoding: 'utf8', timeout: 1000 },
  )
  if (paneHeight.status !== 0) {
    return { error: paneHeight.stderr?.trim() || 'tmux pane height query failed' }
  }
  const parsedPaneHeight = Number.parseInt(paneHeight.stdout.trim(), 10)

  const capture = spawnSync(
    'tmux',
    ['-S', socketPath, 'capture-pane', '-p', '-S', '-220', '-t', targetPane],
    { encoding: 'utf8', timeout: 1000 },
  )
  if (capture.status !== 0) {
    return { error: capture.stderr?.trim() || 'tmux capture-pane failed' }
  }

  return {
    text: capture.stdout,
    paneHeight: Number.isFinite(parsedPaneHeight) ? parsedPaneHeight : undefined,
  }
}

function getDiagnosticDir(): string {
  return join(getCanonicalNcodeConfigHomeDir(), 'debug', 'repaint')
}

function buildPayload(context: ToolUseContext, phase: 'before' | 'after') {
  const stdout = process.stdout as NodeJS.WriteStream
  const ink = getInk(stdout)
  const tmuxPane = captureTmuxPane()
  return {
    phase,
    createdAt: new Date().toISOString(),
    pid: process.pid,
    cwd: process.cwd(),
    stdout: {
      isTTY: stdout.isTTY,
      columns: stdout.columns,
      rows: stdout.rows,
    },
    appState: {
      expandedView: context.getAppState?.().expandedView,
      verbose: context.getAppState?.().verbose,
    },
    ink: getInkSummary(stdout),
    rendererStructuralProbe: buildRendererStructuralProbe(ink, tmuxPane),
    tmuxPane,
  }
}

function writePayload(path: string, payload: unknown): void {
  writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
}

export function writeRepaintDiagnostic(context: ToolUseContext): string {
  const dir = getDiagnosticDir()
  mkdirSync(dir, { recursive: true })
  const path = join(dir, `repaint-${Date.now()}-${process.pid}.json`)
  const payload = {
    kind: 'ncode-repaint-diagnostic',
    env: {
      TERM: process.env.TERM,
      TMUX: process.env.TMUX,
      COLORTERM: process.env.COLORTERM,
      TERM_PROGRAM: process.env.TERM_PROGRAM,
      TERM_PROGRAM_VERSION: process.env.TERM_PROGRAM_VERSION,
      NCODE_CONFIG_DIR: process.env.NCODE_CONFIG_DIR,
    },
    before: buildPayload(context, 'before'),
  }
  writePayload(path, payload)
  return path
}

export async function call(
  _args: string,
  context: ToolUseContext,
): Promise<LocalCommandResult> {
  const diagnosticPath = writeRepaintDiagnostic(context)
  // The visible command result is appended after this function resolves.
  // Repainting synchronously repairs the old frame, then the command result
  // adds rows and can reintroduce a vertical viewport offset. Defer one turn
  // so the repaint targets the final transcript state that includes this
  // command's own output.
  setTimeout(() => {
    requestReplTranscriptResetRedraw(process.stdout)
    setTimeout(() => {
      try {
        const fs = require('fs') as typeof import('fs')
        const before = fs.existsSync(diagnosticPath)
          ? JSON.parse(fs.readFileSync(diagnosticPath, 'utf8'))
          : { kind: 'ncode-repaint-diagnostic' }
        writePayload(diagnosticPath, {
          ...before,
          after: buildPayload(context, 'after'),
        })
      } catch {
        // Best-effort diagnostic update; repaint itself must not fail.
      }
    }, 75).unref?.()
  }, 0).unref?.()
  return {
    type: 'text',
    value: `Repaint requested. Renderer diagnostic written to:\n${diagnosticPath}`,
  }
}
