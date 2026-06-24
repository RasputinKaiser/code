import { afterEach, describe, expect, mock, test } from 'bun:test'
import { Ansi, RawAnsi } from '../../ink.js'
import {
  getFencedCodeRenderStatsSnapshot,
  resetFencedCodeRenderStatsForTesting,
} from './fencedCodeRenderStats.js'

afterEach(() => {
  mock.restore()
  resetFencedCodeRenderStatsForTesting()
})

describe('FencedCode', () => {
  test('falls back to the existing Ansi path when no native fence renderer is available', async () => {
    let capturedParams:
      | { code: string; language: string | null; terminalWidth?: number }
      | null = null
    mock.module('./nativeFence.js', () => ({
      renderNativeFence: (params: {
        code: string
        language: string | null
        terminalWidth?: number
      }) => {
        capturedParams = params
        return null
      },
    }))

    const { FencedCode } = await import('./FencedCode.js')

    const element = FencedCode({
      code: 'const value = 1',
      language: 'ts',
      getFallbackAnsi: () => '\u001b[36mconst\u001b[39m value = 1',
      terminalWidth: 72,
    }) as any

    expect(capturedParams).toEqual({
      code: 'const value = 1',
      language: 'ts',
      terminalWidth: 72,
    })
    expect(element?.type).toBe(Ansi)
    expect(element?.props?.dimColor).toBeUndefined()
    expect(element?.props?.children).toBe('\u001b[36mconst\u001b[39m value = 1')
    expect(getFencedCodeRenderStatsSnapshot()).toMatchObject({
      totalRenders: 1,
      ansiFallbackCount: 1,
      nativeRenderCount: 0,
      lastPath: 'ansi-fallback',
      lastFallbackReason: 'native-unavailable',
    })
  })

  test('renders native terminal-ready lines through RawAnsi when available', async () => {
    const nativeLines = ['\u001b[36mconst\u001b[39m value = 1']
    mock.module('./nativeFence.js', () => ({
      renderNativeFence: () => nativeLines,
    }))

    const { FencedCode } = await import('./FencedCode.js')

    const element = FencedCode({
      code: 'const value = 1',
      language: 'ts',
      getFallbackAnsi: () => '\u001b[36mconst\u001b[39m value = 1',
      terminalWidth: 101,
    }) as any

    expect(element?.type).toBe(RawAnsi)
    expect(element?.props?.lines).toBe(nativeLines)
    expect(element?.props?.width).toBe(101)
    expect(getFencedCodeRenderStatsSnapshot()).toMatchObject({
      totalRenders: 1,
      nativeRenderCount: 1,
      ansiFallbackCount: 0,
      lastPath: 'native',
      lastNativeLineCount: 1,
    })
  })

  test('keeps dimColor on the Ansi fallback path even when native lines are available', async () => {
    const renderNativeFence = mock(() => ['\u001b[36mconst\u001b[39m value = 1'])
    const getFallbackAnsi = mock(() => '\u001b[36mconst\u001b[39m value = 1')
    mock.module('./nativeFence.js', () => ({
      renderNativeFence,
    }))

    const { FencedCode } = await import('./FencedCode.js')

    const element = FencedCode({
      code: 'const value = 1',
      language: 'ts',
      getFallbackAnsi,
      terminalWidth: 88,
      dimColor: true,
    }) as any

    expect(element?.type).toBe(Ansi)
    expect(element?.props?.dimColor).toBe(true)
    expect(element?.props?.children).toBe('\u001b[36mconst\u001b[39m value = 1')
    expect(renderNativeFence).not.toHaveBeenCalled()
    expect(getFallbackAnsi).toHaveBeenCalledTimes(1)
  })

  test('falls back to Ansi when the native path has no usable terminal width yet', async () => {
    let capturedParams:
      | { code: string; language: string | null; terminalWidth?: number }
      | null = null
    mock.module('./nativeFence.js', () => ({
      renderNativeFence: (params: {
        code: string
        language: string | null
        terminalWidth?: number
      }) => {
        capturedParams = params
        return ['\u001b[36mconst\u001b[39m value = 1']
      },
    }))

    const { FencedCode } = await import('./FencedCode.js')

    const element = FencedCode({
      code: 'const value = 1',
      language: 'ts',
      getFallbackAnsi: () => '\u001b[36mconst\u001b[39m value = 1',
      terminalWidth: 0,
    }) as any

    expect(capturedParams).toBeNull()
    expect(element?.type).toBe(Ansi)
    expect(element?.props?.children).toBe('\u001b[36mconst\u001b[39m value = 1')
  })

  test('does not compute the ANSI fallback when native lines are used', async () => {
    const getFallbackAnsi = mock(() => '\u001b[36mconst\u001b[39m value = 1')
    mock.module('./nativeFence.js', () => ({
      renderNativeFence: () => ['\u001b[36mconst\u001b[39m value = 1'],
    }))

    const { FencedCode } = await import('./FencedCode.js')

    const element = FencedCode({
      code: 'const value = 1',
      language: 'ts',
      getFallbackAnsi,
      terminalWidth: 101,
    }) as any

    expect(element?.type).toBe(RawAnsi)
    expect(getFallbackAnsi).not.toHaveBeenCalled()
  })
})
