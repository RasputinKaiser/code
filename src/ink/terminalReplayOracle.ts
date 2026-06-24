import { Parser } from './termio/parser.js'
import type { Action, Grapheme } from './termio/types.js'
import { cellAt, type Screen } from './screen.js'
import { stringWidth } from './stringWidth.js'

type Cursor = {
  x: number
  y: number
}

export type TerminalReplayOracleOptions = {
  width: number
  height: number
  initialScrollbackRows?: string[]
  initialRows?: string[]
  initialCursor?: Cursor
}

export class TerminalReplayOracle {
  private readonly parser = new Parser()
  private readonly scrollbackRowsBuffer: string[][]
  private readonly rows: string[][]
  private cursor: Cursor
  private savedCursor: Cursor | null = null
  private scrollTop = 0
  private scrollBottom: number

  constructor(private readonly options: TerminalReplayOracleOptions) {
    this.scrollbackRowsBuffer = (options.initialScrollbackRows ?? []).map(row =>
      normalizeRow(row, options.width),
    )
    this.rows = Array.from({ length: options.height }, (_, y) =>
      normalizeRow(options.initialRows?.[y] ?? '', options.width),
    )
    this.cursor = {
      x: clamp(options.initialCursor?.x ?? 0, 0, options.width - 1),
      y: clamp(options.initialCursor?.y ?? 0, 0, options.height - 1),
    }
    this.scrollBottom = options.height - 1
  }

  feed(bytes: string): void {
    for (const action of this.parser.feed(bytes)) {
      this.apply(action)
    }
  }

  text(): string {
    return this.rows.map(row => row.join('')).join('\n')
  }

  visibleRows(): string[] {
    return this.rows.map(row => row.join(''))
  }

  scrollbackRows(): string[] {
    return this.scrollbackRowsBuffer.map(row => row.join(''))
  }

  allRows(): string[] {
    return [...this.scrollbackRows(), ...this.visibleRows()]
  }

  assertMatchesScreen(screen: Screen): void {
    this.assertScreenAt(screen, 0)
  }

  assertScreenAt(screen: Screen, startY: number): void {
    const expected = screenToRows(screen)
    const actual = this.visibleRows().slice(startY, startY + screen.height)
    if (actual.join('\n') !== expected.join('\n')) {
      throw new Error(
        [
          'Terminal replay does not match target screen.',
          '--- expected ---',
          expected.join('\n'),
          '--- actual ---',
          actual.join('\n'),
        ].join('\n'),
      )
    }
  }

  private apply(action: Action): void {
    switch (action.type) {
      case 'text':
        this.writeGraphemes(action.graphemes)
        return
      case 'cursor':
        this.applyCursor(action.action)
        return
      case 'erase':
        this.applyErase(action.action)
        return
      case 'scroll':
        this.applyScroll(action.action)
        return
      case 'reset':
        this.clearDisplay()
        this.cursor = { x: 0, y: 0 }
        return
      case 'sgr':
      case 'mode':
      case 'link':
      case 'title':
      case 'tabStatus':
      case 'bell':
      case 'unknown':
        return
    }
  }

  private writeGraphemes(graphemes: Grapheme[]): void {
    for (const grapheme of graphemes) {
      if (grapheme.value === '\n') {
        this.lineFeed()
        continue
      }
      if (grapheme.value === '\r') {
        this.cursor.x = 0
        continue
      }
      this.writeCell(grapheme.value)
      if (replayGraphemeWidth(grapheme) === 2 && this.cursor.x < this.options.width) {
        this.writeCell(' ')
      }
    }
  }

  private writeCell(value: string): void {
    if (this.cursor.y < 0 || this.cursor.y >= this.options.height) {
      return
    }
    if (this.cursor.x >= this.options.width) {
      this.cursor.x = 0
      this.lineFeed()
    }
    if (this.cursor.x < 0 || this.cursor.x >= this.options.width) {
      return
    }
    this.rows[this.cursor.y]![this.cursor.x] = value
    this.cursor.x += 1
  }

  private lineFeed(): void {
    if (this.cursor.y === this.scrollBottom) {
      this.scrollUp(1)
    } else {
      this.cursor.y = clamp(this.cursor.y + 1, 0, this.options.height - 1)
    }
  }

  private applyCursor(action: Extract<Action, { type: 'cursor' }>['action']) {
    switch (action.type) {
      case 'move':
        switch (action.direction) {
          case 'up':
            this.cursor.y = clamp(this.cursor.y - action.count, 0, this.options.height - 1)
            return
          case 'down':
            this.cursor.y = clamp(this.cursor.y + action.count, 0, this.options.height - 1)
            return
          case 'forward':
            this.cursor.x = clamp(this.cursor.x + action.count, 0, this.options.width - 1)
            return
          case 'back':
            this.cursor.x = clamp(this.cursor.x - action.count, 0, this.options.width - 1)
            return
        }
      case 'position':
        this.cursor.y = clamp(action.row - 1, 0, this.options.height - 1)
        this.cursor.x = clamp(action.col - 1, 0, this.options.width - 1)
        return
      case 'column':
        this.cursor.x = clamp(action.col - 1, 0, this.options.width - 1)
        return
      case 'row':
        this.cursor.y = clamp(action.row - 1, 0, this.options.height - 1)
        return
      case 'nextLine':
        this.cursor.y = clamp(this.cursor.y + action.count, 0, this.options.height - 1)
        this.cursor.x = 0
        return
      case 'prevLine':
        this.cursor.y = clamp(this.cursor.y - action.count, 0, this.options.height - 1)
        this.cursor.x = 0
        return
      case 'save':
        this.savedCursor = { ...this.cursor }
        return
      case 'restore':
        if (this.savedCursor) {
          this.cursor = { ...this.savedCursor }
        }
        return
      case 'show':
      case 'hide':
      case 'style':
        return
    }
  }

  private applyErase(action: Extract<Action, { type: 'erase' }>['action']): void {
    switch (action.type) {
      case 'line':
        this.eraseLine(action.region)
        return
      case 'display':
        this.eraseDisplay(action.region)
        return
      case 'chars':
        for (
          let x = this.cursor.x;
          x < Math.min(this.options.width, this.cursor.x + action.count);
          x += 1
        ) {
          this.rows[this.cursor.y]![x] = ' '
        }
        return
    }
  }

  private applyScroll(action: Extract<Action, { type: 'scroll' }>['action']): void {
    switch (action.type) {
      case 'setRegion':
        this.scrollTop = clamp(action.top - 1, 0, this.options.height - 1)
        this.scrollBottom = clamp(action.bottom - 1, this.scrollTop, this.options.height - 1)
        return
      case 'up':
        this.scrollUp(action.count)
        return
      case 'down':
        this.scrollDown(action.count)
        return
    }
  }

  private eraseLine(region: 'toEnd' | 'toStart' | 'all'): void {
    const row = this.rows[this.cursor.y]!
    const start = region === 'toEnd' ? this.cursor.x : 0
    const end = region === 'toStart' ? this.cursor.x + 1 : this.options.width
    for (let x = start; x < end; x += 1) {
      row[x] = ' '
    }
  }

  private eraseDisplay(region: 'toEnd' | 'toStart' | 'all' | 'scrollback'): void {
    if (region === 'scrollback') {
      this.scrollbackRowsBuffer.length = 0
      return
    }
    if (region === 'all') {
      this.clearDisplay()
      return
    }
    if (region === 'toEnd') {
      this.eraseLine('toEnd')
      for (let y = this.cursor.y + 1; y < this.options.height; y += 1) {
        this.rows[y] = normalizeRow('', this.options.width)
      }
      return
    }
    this.eraseLine('toStart')
    for (let y = 0; y < this.cursor.y; y += 1) {
      this.rows[y] = normalizeRow('', this.options.width)
    }
  }

  private clearDisplay(): void {
    for (let y = 0; y < this.options.height; y += 1) {
      this.rows[y] = normalizeRow('', this.options.width)
    }
  }

  private scrollUp(count: number): void {
    const n = Math.min(count, this.scrollBottom - this.scrollTop + 1)
    const removedRows = this.rows.splice(this.scrollTop, n)
    if (this.isFullScreenScrollRegion()) {
      this.scrollbackRowsBuffer.push(...removedRows)
    }
    this.rows.splice(
      this.scrollBottom - n + 1,
      0,
      ...Array.from({ length: n }, () => normalizeRow('', this.options.width)),
    )
  }

  private scrollDown(count: number): void {
    const n = Math.min(count, this.scrollBottom - this.scrollTop + 1)
    this.rows.splice(this.scrollBottom - n + 1, n)
    this.rows.splice(
      this.scrollTop,
      0,
      ...Array.from({ length: n }, () => normalizeRow('', this.options.width)),
    )
  }

  private isFullScreenScrollRegion(): boolean {
    return this.scrollTop === 0 && this.scrollBottom === this.options.height - 1
  }
}

export function screenToRows(screen: Screen): string[] {
  const rows: string[] = []
  for (let y = 0; y < screen.height; y += 1) {
    let row = ''
    for (let x = 0; x < screen.width; x += 1) {
      row += cellAt(screen, x, y)?.char ?? ' '
    }
    rows.push(row)
  }
  return rows
}

function normalizeRow(value: string, width: number): string[] {
  return [...value.padEnd(width, ' ').slice(0, width)]
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function replayGraphemeWidth(grapheme: Grapheme): 1 | 2 {
  return stringWidth(grapheme.value) >= 2 ? 2 : 1
}
