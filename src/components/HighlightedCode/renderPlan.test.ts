import { beforeEach, describe, expect, test } from 'bun:test'
import {
  clearHighlightedCodeRenderPlanCache,
  getCachedHighlightedCodeRenderPlan,
} from './renderPlan.js'

function makeLargeCode(lineCount = 64): string {
  return Array.from(
    { length: lineCount },
    (_, line) =>
      `export const value_${line.toString(36).padStart(2, '0')} = '${`${line}`.padEnd(48, 'x')}';`,
  ).join('\n')
}

describe('HighlightedCode render plan cache', () => {
  beforeEach(() => {
    clearHighlightedCodeRenderPlanCache()
  })

  test('reuses the render plan for large remounted files', () => {
    let renderCalls = 0
    const options = {
      code: makeLargeCode(),
      filePath: 'src/file.ts',
      theme: 'dark',
      width: 96,
      dim: false,
      splitGutter: false,
      renderLines: () => {
        renderCalls += 1
        return ['\u001b[31mconst alpha = 1;\u001b[39m', 'const beta = 2;']
      },
    }

    const first = getCachedHighlightedCodeRenderPlan(options)
    const second = getCachedHighlightedCodeRenderPlan(options)

    expect(first).not.toBeNull()
    expect(second).toBe(first)
    expect(renderCalls).toBe(1)
  })

  test('skips caching for small snippets', () => {
    let renderCalls = 0
    const options = {
      code: 'const value = 1;',
      filePath: 'src/file.ts',
      theme: 'dark',
      width: 96,
      dim: false,
      splitGutter: false,
      renderLines: () => {
        renderCalls += 1
        return ['const value = 1;']
      },
    }

    const first = getCachedHighlightedCodeRenderPlan(options)
    const second = getCachedHighlightedCodeRenderPlan(options)

    expect(first).not.toBeNull()
    expect(second).not.toBeNull()
    expect(first).not.toBe(second)
    expect(renderCalls).toBe(2)
  })

  test('preserves gutter and content splits for fullscreen rendered files', () => {
    const plan = getCachedHighlightedCodeRenderPlan({
      code: makeLargeCode(12),
      filePath: 'src/file.ts',
      theme: 'dark',
      width: 96,
      dim: false,
      splitGutter: true,
      renderLines: () => [
        ' 1  \u001b[31mconst alpha = 1;\u001b[39m',
        ' 2  const beta = 2;',
      ],
    })

    expect(plan).not.toBeNull()
    expect(plan?.gutterWidth).toBe(4)
    expect(plan?.gutters).toEqual([' 1  ', ' 2  '])
    expect(plan?.contents).toEqual([
      '\u001b[31mconst alpha = 1;\u001b[39m',
      'const beta = 2;',
    ])
  })
})
