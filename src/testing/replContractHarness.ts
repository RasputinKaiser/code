import { expect } from 'bun:test'
import { existsSync, readFileSync } from 'fs'

export type MatchCounter = {
  readonly current: number
  readonly total: number
}

export type InteractionBudget = {
  readonly maxFrames?: number
  readonly maxBytes: number
  readonly maxMeasured?: number
  readonly maxVisited?: number
}

export type InteractionFrameMetrics = {
  readonly bytes: number
  readonly yogaMeasured: number
  readonly yogaVisited: number
  readonly flickers: number
}

export type SliceResult<T> = {
  readonly values: T[]
  readonly nextIndex: number
}

export type StringSliceResult = {
  readonly value: string
  readonly nextIndex: number
}

export function normalizeReplText(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

export function parseMatchCounter(text: string): MatchCounter | null {
  const match = text.match(/\b(\d+)\/(\d+)\b/)
  if (!match) {
    return null
  }
  return {
    current: Number.parseInt(match[1]!, 10),
    total: Number.parseInt(match[2]!, 10),
  }
}

export function expectPromptFooterModules(
  text: string,
  options?: {
    readonly cwdSegment?: string
    readonly label?: string
    readonly normalize?: (text: string) => string
  },
): void {
  const normalize = options?.normalize ?? normalizeReplText
  const normalized = normalize(text)
  const label = options?.label ?? 'prompt footer'

  expect(
    / · (?:low|medium|high|max)\b/.test(normalized),
    `${label} is missing model effort`,
  ).toBe(true)
  expect(normalized, `${label} should not show fast-mode placeholders`).not.toMatch(
    /Fast (?:on|off)/,
  )
  expect(normalized, `${label} should not show the main-thread placeholder`).not.toContain(
    '· Main',
  )
  expect(normalized, `${label} should not show the default permission placeholder`).not.toContain(
    '[default]',
  )

  if (options?.cwdSegment) {
    expect(normalized, `${label} is missing cwd segment`).toContain(
      options.cwdSegment,
    )
  }
}

export function assertInteractionContract<T>(
  label: string,
  frames: readonly T[],
  output: string,
  budget: InteractionBudget,
  readMetrics: (frame: T) => InteractionFrameMetrics,
): void {
  expect(frames.length, `${label} emitted no frames`).toBeGreaterThan(0)

  const metrics = frames.map(readMetrics)

  expect(
    metrics.every(frame => frame.flickers === 0),
    `${label} emitted flicker frames`,
  ).toBe(true)
  expect(output.includes('\u001b[2J'), `${label} emitted ED2 clear-screen`).toBe(
    false,
  )
  expect(output.includes('\u001b[3J'), `${label} emitted ED3 scrollback wipe`).toBe(
    false,
  )

  if (budget.maxFrames !== undefined && frames.length > budget.maxFrames) {
    throw new Error(
      `${label} exceeded the frame budget: ${frames.length} > ${budget.maxFrames}`,
    )
  }

  const maxBytes = Math.max(...metrics.map(frame => frame.bytes), 0)
  if (maxBytes > budget.maxBytes) {
    throw new Error(
      `${label} exceeded the repaint byte budget: ${maxBytes} > ${budget.maxBytes}`,
    )
  }

  if (budget.maxMeasured !== undefined) {
    const maxMeasured = Math.max(...metrics.map(frame => frame.yogaMeasured), 0)
    if (maxMeasured > budget.maxMeasured) {
      throw new Error(
        `${label} exceeded the Yoga measure budget: ${maxMeasured} > ${budget.maxMeasured}`,
      )
    }
  }

  if (budget.maxVisited !== undefined) {
    const maxVisited = Math.max(...metrics.map(frame => frame.yogaVisited), 0)
    if (maxVisited > budget.maxVisited) {
      throw new Error(
        `${label} exceeded the Yoga visit budget: ${maxVisited} > ${budget.maxVisited}`,
      )
    }
  }
}

export function readJsonLines<T>(path: string): T[] {
  if (!existsSync(path)) {
    return []
  }
  const text = readFileSync(path, 'utf8').trim()
  if (text.length === 0) {
    return []
  }
  return text
    .split('\n')
    .filter(line => line.length > 0)
    .map(line => JSON.parse(line) as T)
}

export function sliceArrayFromIndex<T>(
  values: readonly T[],
  startIndex: number,
): SliceResult<T> {
  return {
    values: values.slice(startIndex),
    nextIndex: values.length,
  }
}

export function sliceStringFromIndex(
  text: string,
  startIndex: number,
): StringSliceResult {
  return {
    value: text.slice(startIndex),
    nextIndex: text.length,
  }
}

export async function waitForFile(path: string, timeoutMs = 4000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (existsSync(path)) {
      return
    }
    await Bun.sleep(20)
  }
  throw new Error(`Timed out waiting for ${path}`)
}

export async function waitForText(
  readText: () => string,
  predicate: (text: string) => boolean,
  options?: {
    readonly timeoutMs?: number
    readonly label?: string
  },
): Promise<string> {
  const deadline = Date.now() + (options?.timeoutMs ?? 4000)
  let lastText = ''
  while (Date.now() < deadline) {
    lastText = readText()
    if (predicate(lastText)) {
      return lastText
    }
    await Bun.sleep(20)
  }

  throw new Error(
    `Timed out waiting for ${options?.label ?? 'text condition'}. Last capture:\n${lastText}`,
  )
}

export function getFrameByLabel<T extends { readonly label: string }>(
  frames: readonly T[],
  label: string,
): T {
  const frame = frames.find(candidate => candidate.label === label)
  if (!frame) {
    throw new Error(`Missing frame ${label}`)
  }
  return frame
}

export function hasVisibleTextContent(text: string): boolean {
  return text
    .split('\n')
    .some(line => line.trim().length > 0)
}
