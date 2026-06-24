import { expect } from 'bun:test'
import type { MountedInkProbe } from '../ink/replPerfHarness.js'
import { readScreenText } from '../ink/replPerfHarness.js'
import { waitForText } from './replContractHarness.js'

export const REPL_KEY_SEQUENCES = {
  ctrlX: '\x18',
  ctrlJRawLf: '\n',
  ctrlJKitty: '\x1b[106;5u',
  shiftEnterKitty: '\x1b[13;2u',
  shiftEnterTilde: '\x1b[13;2~',
  shiftEnterModifyOtherKeys: '\x1b[27;2;13~',
  shiftTab: '\x1b[Z',
} as const

export function readMountedScreenText(
  ink: MountedInkProbe | undefined,
): string {
  return ink ? readScreenText(ink.frontFrame.screen) : ''
}

export function readVisibleRows(screenText: string): string[] {
  return screenText
    .split('\n')
    .map(row => row.replace(/\s+$/g, ''))
    .filter(row => row.trim().length > 0)
}

export function normalizeVisibleRowContractText(text: string): string {
  return text.replace(/\s+/gu, '')
}

export function findPromptRow(screenText: string): number {
  const rows = screenText.split('\n')
  for (let rowIndex = rows.length - 1; rowIndex >= 0; rowIndex -= 1) {
    if (rows[rowIndex]?.includes('❯')) {
      return rowIndex
    }
  }
  return -1
}

export function readPromptBand(
  screenText: string,
  options?: {
    readonly rowsBelow?: number
  },
): string {
  const rows = screenText.split('\n')
  const promptRow = findPromptRow(screenText)
  if (promptRow === -1) {
    return screenText
  }

  const rowsBelow = options?.rowsBelow ?? 1
  const endRow = Math.min(rows.length, promptRow + rowsBelow + 1)
  return rows.slice(promptRow, endRow).join('\n')
}

export function readTranscriptBandAbovePrompt(screenText: string): string {
  const rows = screenText.split('\n')
  const promptRow = findPromptRow(screenText)
  return rows.slice(0, Math.max(0, promptRow - 1)).join('\n')
}

export function expectRowsToContain(
  rows: readonly string[],
  expectedRow: string,
  label = 'visible rows',
): void {
  expect(
    rows.includes(expectedRow),
    `Expected ${JSON.stringify(rows)} to contain ${JSON.stringify(expectedRow)} for ${label}`,
  ).toBe(true)
}

export function expectRowsToContainSubstring(
  rows: readonly string[],
  expectedSubstring: string,
  label = 'visible rows',
): void {
  expect(
    rows.some(row => row.includes(expectedSubstring)),
    `Expected ${JSON.stringify(rows)} to include a row containing ${JSON.stringify(expectedSubstring)} for ${label}`,
  ).toBe(true)
}

export function rowsContainSubstring(
  rows: readonly string[],
  expectedSubstring: string,
): boolean {
  return rows.some(row => row.includes(expectedSubstring))
}

export function expectRowsNotToContainSubstring(
  rows: readonly string[],
  unexpectedSubstring: string,
  label = 'visible rows',
): void {
  expect(
    rows.some(row => row.includes(unexpectedSubstring)),
    `Expected ${JSON.stringify(rows)} to not include a row containing ${JSON.stringify(unexpectedSubstring)} for ${label}`,
  ).toBe(false)
}

export function expectRowsToContainSubstringsInOrder(
  rows: readonly string[],
  expectedSubstrings: readonly string[],
  label = 'visible rows',
): void {
  let searchStartIndex = 0

  for (const expectedSubstring of expectedSubstrings) {
    let matched = false

    for (let rowIndex = searchStartIndex; rowIndex < rows.length; rowIndex += 1) {
      if (rows[rowIndex]?.includes(expectedSubstring)) {
        searchStartIndex = rowIndex
        matched = true
        break
      }
    }

    expect(
      matched,
      `Expected ${JSON.stringify(rows)} to include a row containing ${JSON.stringify(expectedSubstring)} in order for ${label}`,
    ).toBe(true)
  }
}

export function rowsContainSubstringsInDistinctOrder(
  rows: readonly string[],
  expectedSubstrings: readonly string[],
): boolean {
  let searchStartIndex = 0

  for (const expectedSubstring of expectedSubstrings) {
    let matchedIndex = -1

    for (let rowIndex = searchStartIndex; rowIndex < rows.length; rowIndex += 1) {
      if (rows[rowIndex]?.includes(expectedSubstring)) {
        matchedIndex = rowIndex
        break
      }
    }

    if (matchedIndex === -1) {
      return false
    }

    searchStartIndex = matchedIndex + 1
  }

  return true
}

export function rowsContainNormalizedSubstringsInDistinctOrder(
  rows: readonly string[],
  expectedSubstrings: readonly string[],
): boolean {
  const normalizedRows = rows.map(normalizeVisibleRowContractText)
  const normalizedExpectedSubstrings = expectedSubstrings.map(
    normalizeVisibleRowContractText,
  )

  return rowsContainSubstringsInDistinctOrder(
    normalizedRows,
    normalizedExpectedSubstrings,
  )
}

export function expectRowsToContainSubstringsInDistinctOrder(
  rows: readonly string[],
  expectedSubstrings: readonly string[],
  label = 'visible rows',
): void {
  expect(
    rowsContainSubstringsInDistinctOrder(rows, expectedSubstrings),
    `Expected ${JSON.stringify(rows)} to include rows containing ${JSON.stringify(expectedSubstrings)} in distinct order for ${label}`,
  ).toBe(true)
}

export function expectRowsToContainNormalizedSubstringsInDistinctOrder(
  rows: readonly string[],
  expectedSubstrings: readonly string[],
  label = 'visible rows',
): void {
  expect(
    rowsContainNormalizedSubstringsInDistinctOrder(rows, expectedSubstrings),
    `Expected ${JSON.stringify(rows)} to include rows containing normalized ${JSON.stringify(expectedSubstrings)} in distinct order for ${label}`,
  ).toBe(true)
}

export function expectPromptInputBlock(
  screenText: string,
  expectedLines: readonly string[],
): void {
  const promptBand = readPromptBand(screenText, {
    rowsBelow: Math.max(1, expectedLines.length),
  })
  const rows = promptBand.split('\n')

  expect(rows[0], 'prompt band is missing the live prompt row').toContain('❯')
  expect(
    rows[0],
    'prompt band is missing the first input line on the prompt row',
  ).toContain(expectedLines[0] ?? '')

  for (let lineIndex = 1; lineIndex < expectedLines.length; lineIndex += 1) {
    expect(
      rows[lineIndex] ?? '',
      `prompt band is missing continued input line ${lineIndex + 1}`,
    ).toContain(expectedLines[lineIndex]!)
  }
}

export async function waitForMountedScreenText(
  ink: MountedInkProbe | undefined,
  predicate: (text: string) => boolean,
  options?: {
    readonly timeoutMs?: number
    readonly label?: string
  },
): Promise<string> {
  return await waitForText(
    () => readMountedScreenText(ink),
    predicate,
    options,
  )
}

export async function waitForMountedVisibleRows(
  ink: MountedInkProbe | undefined,
  predicate: (rows: string[]) => boolean,
  options?: {
    readonly timeoutMs?: number
    readonly label?: string
  },
): Promise<string[]> {
  const screenText = await waitForMountedScreenText(
    ink,
    text => predicate(readVisibleRows(text)),
    options,
  )
  return readVisibleRows(screenText)
}
