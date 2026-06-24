import { type Diff, type Frame } from './frame.js'
import { cellAt, type Screen } from './screen.js'
import { createHash } from 'crypto'
import { getCanonicalNcodeConfigHomeDir } from '../utils/envUtils.js'
import { getResetSequenceForReason } from './clearTerminal.js'
import { cursorMove, cursorTo, eraseLines } from './termio/csi.js'
import { HIDE_CURSOR, SHOW_CURSOR } from './termio/dec.js'
import { link } from './termio/osc.js'

const SCHEMA_VERSION = '1.0.0'
export const RING_SIZE = 256
export const FULL_CAPTURE_FRAME_COUNT = 32

type FrameSnapshot = {
  height: number
  width: number
  cursor: { x: number; y: number }
  viewportHeight: number
}

type CheapFrameTrace = {
  frameId: number
  timestamp: number
  terminalWidth: number
  terminalHeight: number
  altScreen: boolean
  renderPath: string
  prev: FrameSnapshot
  next: FrameSnapshot
  diffPatchCounts: Record<string, number>
  optimizedPatchCounts: Record<string, number>
  bytesWritten: number
}

type FullFrameTrace = CheapFrameTrace & {
  prevRowHashes: string[]
  nextRowHashes: string[]
  prevRows: string[]
  nextRows: string[]
  ansiBytesHash: string
}

export type RenderTraceDump = {
  schema: typeof SCHEMA_VERSION
  capturedAt: string
  env: {
    TERM: string | undefined
    TMUX: string | undefined
    COLORTERM: string | undefined
    TERM_PROGRAM: string | undefined
  }
  fullCapture?: {
    armedAt: number
    framesCaptured: number
    autoDisabledAt: number
  }
  frames: (CheapFrameTrace | FullFrameTrace)[]
}

export type RenderTraceStatus = 'idle' | 'full-armed'

function countPatchTypes(diff: Diff): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const p of diff) {
    counts[p.type] = (counts[p.type] ?? 0) + 1
  }
  return counts
}

function hashRow(screen: Screen, y: number): string {
  let s = ''
  for (let x = 0; x < screen.width; x++) {
    const cell = cellAt(screen, x, y)
    s += cell?.char ?? ' '
    s += String(cell?.styleId ?? 'N')
  }
  return createHash('sha256').update(s).digest('hex').slice(0, 16)
}

function rowsToStrings(screen: Screen): string[] {
  const rows: string[] = []
  for (let y = 0; y < screen.height; y++) {
    let row = ''
    for (let x = 0; x < screen.width; x++) {
      row += cellAt(screen, x, y)?.char ?? ' '
    }
    rows.push(row)
  }
  return rows
}

function snapshotFrame(frame: Frame): FrameSnapshot {
  return {
    height: frame.screen.height,
    width: frame.screen.width,
    cursor: { x: frame.cursor.x, y: frame.cursor.y },
    viewportHeight: frame.viewport.height,
  }
}

export function serializeOptimizedToAnsiForTesting(diff: Diff): string {
  let buf = ''
  for (const p of diff) {
    switch (p.type) {
      case 'stdout':
        buf += p.content
        break
      case 'styleStr':
        buf += p.str
        break
      case 'clear':
        if (p.count > 0) buf += eraseLines(p.count)
        break
      case 'clearTerminal':
        buf += getResetSequenceForReason(p.reason)
        break
      case 'cursorHide':
        buf += HIDE_CURSOR
        break
      case 'cursorShow':
        buf += SHOW_CURSOR
        break
      case 'cursorMove':
        buf += cursorMove(p.x, p.y)
        break
      case 'cursorTo':
        buf += cursorTo(p.col)
        break
      case 'carriageReturn':
        buf += '\r'
        break
      case 'hyperlink':
        buf += link(p.uri)
        break
    }
  }
  return buf
}

let instance: RenderTrace | null = null

/** Always returns the singleton; RenderTrace is cheap enough to keep around. */
export function getRenderTrace(): RenderTrace {
  if (!instance) {
    instance = new RenderTrace()
  }
  return instance
}

export class RenderTrace {
  private readonly buffer: (CheapFrameTrace | FullFrameTrace | null)[]
  private writeHead = 0
  private frameId = 0
  private fullCaptureRemaining = 0
  private fullCaptureArmedAt = 0
  private hasWrapped = false

  constructor() {
    this.buffer = new Array(RING_SIZE).fill(null)
  }

  get status(): RenderTraceStatus {
    return this.fullCaptureRemaining > 0 ? 'full-armed' : 'idle'
  }

  get framesUntilFullDisable(): number {
    return this.fullCaptureRemaining
  }

  armFullCapture(frames = FULL_CAPTURE_FRAME_COUNT): void {
    this.fullCaptureRemaining = frames
    this.fullCaptureArmedAt = performance.now()
  }

  capture(args: {
    altScreen: boolean
    terminalWidth: number
    terminalHeight: number
    renderPath: string
    prev: Frame
    next: Frame
    diff: Diff
    optimized: Diff
    bytesWritten: number
  }): void {
    const isFull = this.fullCaptureRemaining > 0

    const entry: CheapFrameTrace = {
      frameId: this.frameId++,
      timestamp: performance.now(),
      terminalWidth: args.terminalWidth,
      terminalHeight: args.terminalHeight,
      altScreen: args.altScreen,
      renderPath: args.renderPath,
      prev: snapshotFrame(args.prev),
      next: snapshotFrame(args.next),
      diffPatchCounts: countPatchTypes(args.diff),
      optimizedPatchCounts: countPatchTypes(args.optimized),
      bytesWritten: args.bytesWritten,
    }

    if (isFull) {
      const full = entry as FullFrameTrace
      full.prevRowHashes = []
      full.nextRowHashes = []
      for (let y = 0; y < args.prev.screen.height; y++) {
        full.prevRowHashes.push(hashRow(args.prev.screen, y))
      }
      for (let y = 0; y < args.next.screen.height; y++) {
        full.nextRowHashes.push(hashRow(args.next.screen, y))
      }

      full.prevRows = rowsToStrings(args.prev.screen)
      full.nextRows = rowsToStrings(args.next.screen)
      full.ansiBytesHash = createHash('sha256')
        .update(serializeOptimizedToAnsiForTesting(args.optimized))
        .digest('hex')
        .slice(0, 16)

      this.fullCaptureRemaining--

      if (this.fullCaptureRemaining === 0) {
        // Full window closed silently; next /render-trace will dump it.
        this.fullCaptureArmedAt = 0
      }
    }

    this.buffer[this.writeHead] = entry
    this.writeHead = (this.writeHead + 1) % RING_SIZE
    if (this.writeHead === 0) this.hasWrapped = true
  }

  dumpSync(): string {
    const frames = this.getOrderedFrames()
    const dump: RenderTraceDump = {
      schema: SCHEMA_VERSION,
      capturedAt: new Date().toISOString(),
      env: {
        TERM: process.env.TERM,
        TMUX: process.env.TMUX,
        COLORTERM: process.env.COLORTERM,
        TERM_PROGRAM: process.env.TERM_PROGRAM,
      },
      frames,
    }

    const fullFrames = frames.filter(
      f => (f as FullFrameTrace).ansiBytesHash !== undefined,
    )
    if (fullFrames.length > 0) {
      dump.fullCapture = {
        armedAt: this.fullCaptureArmedAt || performance.now() - 1000,
        framesCaptured: fullFrames.length,
        autoDisabledAt: performance.now(),
      }
    }

    const dumpDir = getDumpDir()
    const { mkdirSync, writeFileSync } = require('fs') as typeof import('fs')
    const { join } = require('path') as typeof import('path')
    mkdirSync(dumpDir, { recursive: true })
    const filename = `render-trace-${Date.now()}.jsonl`
    const filepath = join(dumpDir, filename)
    writeFileSync(filepath, JSON.stringify(dump) + '\n')
    return filepath
  }

  private getOrderedFrames(): (CheapFrameTrace | FullFrameTrace)[] {
    const frames: (CheapFrameTrace | FullFrameTrace)[] = []
    if (this.hasWrapped) {
      for (let i = this.writeHead; i < RING_SIZE; i++) {
        const f = this.buffer[i]
        if (f) frames.push(f)
      }
    }
    for (let i = 0; i < this.writeHead; i++) {
      const f = this.buffer[i]
      if (f) frames.push(f)
    }
    return frames
  }
}

function getDumpDir(): string {
  const { join } = require('path') as typeof import('path')
  return join(getCanonicalNcodeConfigHomeDir(), 'debug', 'render-traces')
}
