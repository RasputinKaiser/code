import { afterEach, describe, expect, test } from 'bun:test'
import { join } from 'path'

import {
  getNativeFencedCodeRendererDebugSnapshot,
  renderNativeFencedCode,
  resetNativeFencedCodeRendererCacheForTesting,
} from './nativeFencedCodeRenderer.js'

type GlobalWithRequire = typeof globalThis & {
  require?: (id: string) => unknown
}

const globalWithRequire = globalThis as GlobalWithRequire
const originalNcodeNativeFenceEnv =
  process.env.NCODE_ENABLE_NATIVE_FENCED_CODE
const originalClaudeNativeFenceEnv =
  process.env.CLAUDE_CODE_ENABLE_NATIVE_FENCED_CODE

function restoreRequire(value: GlobalWithRequire['require']): void {
  if (value === undefined) {
    delete globalWithRequire.require
    return
  }
  globalWithRequire.require = value
}

afterEach(() => {
  restoreRequire(undefined)
  if (originalNcodeNativeFenceEnv === undefined) {
    delete process.env.NCODE_ENABLE_NATIVE_FENCED_CODE
  } else {
    process.env.NCODE_ENABLE_NATIVE_FENCED_CODE = originalNcodeNativeFenceEnv
  }
  if (originalClaudeNativeFenceEnv === undefined) {
    delete process.env.CLAUDE_CODE_ENABLE_NATIVE_FENCED_CODE
  } else {
    process.env.CLAUDE_CODE_ENABLE_NATIVE_FENCED_CODE =
      originalClaudeNativeFenceEnv
  }
  resetNativeFencedCodeRendererCacheForTesting()
})

describe('renderNativeFencedCode', () => {
  test('stays disabled by default even when a renderer is resolvable', () => {
    globalWithRequire.require = () => ({
      renderFencedCode: (code: string) => [code],
    })

    expect(renderNativeFencedCode('const value = 1')).toBeNull()
    expect(getNativeFencedCodeRendererDebugSnapshot()).toMatchObject({
      loadAttempts: 0,
      loadSuccesses: 0,
      requireSource: 'none',
      lastResultKind: 'no-renderer',
    })
  })

  test('fails open when the available loader cannot resolve a renderer', () => {
    process.env.NCODE_ENABLE_NATIVE_FENCED_CODE = '1'
    globalWithRequire.require = () => {
      throw new Error('missing renderer')
    }
    expect(renderNativeFencedCode('const value = 1')).toBeNull()
    expect(getNativeFencedCodeRendererDebugSnapshot()).toMatchObject({
      requireSource: 'global',
      loadAttempts: 1,
      loadFailures: 1,
      renderCalls: 1,
      renderFailures: 1,
      lastResultKind: 'no-renderer',
    })
  })

  test('loads the native renderer once and returns terminal-ready lines', () => {
    process.env.NCODE_ENABLE_NATIVE_FENCED_CODE = '1'
    let requireCalls = 0
    const ids: string[] = []
    globalWithRequire.require = (id: string) => {
      requireCalls += 1
      ids.push(id)
      return {
        renderFencedCode: (
          code: string,
          options?: { language?: string | null; terminalWidth?: number },
        ) => [`${options?.language ?? 'plain'}:${code}`],
      }
    }

    expect(
      renderNativeFencedCode('const value = 1', { language: 'ts' }),
    ).toEqual(['ts:const value = 1'])
    expect(
      renderNativeFencedCode('const value = 2', { language: 'js' }),
    ).toEqual(['js:const value = 2'])
    expect(requireCalls).toBe(1)
    expect(ids).toEqual(['markdown-renderer-napi'])
    expect(getNativeFencedCodeRendererDebugSnapshot()).toMatchObject({
      requireSource: 'global',
      resolvedModuleId: 'markdown-renderer-napi',
      loadAttempts: 1,
      loadSuccesses: 1,
      renderCalls: 2,
      renderSuccesses: 2,
      lastResultKind: 'lines',
      lastLineCount: 1,
    })
  })

  test('disables the cached renderer after an invalid native return until reset', () => {
    process.env.NCODE_ENABLE_NATIVE_FENCED_CODE = '1'
    globalWithRequire.require = () => ({
      renderFencedCode: () => 42,
    })

    expect(renderNativeFencedCode('const value = 1')).toBeNull()

    globalWithRequire.require = () => ({
      renderFencedCode: (code: string) => [code],
    })
    expect(renderNativeFencedCode('const value = 2')).toBeNull()
    expect(getNativeFencedCodeRendererDebugSnapshot()).toMatchObject({
      renderCalls: 2,
      renderFailures: 2,
      invalidReturns: 1,
      lastResultKind: 'no-renderer',
    })

    resetNativeFencedCodeRendererCacheForTesting()
    expect(renderNativeFencedCode('const value = 3')).toEqual([
      'const value = 3',
    ])
  })

  test('falls back to the local scaffold module id when package resolution fails', () => {
    process.env.NCODE_ENABLE_NATIVE_FENCED_CODE = '1'
    const ids: string[] = []
    globalWithRequire.require = (id: string) => {
      ids.push(id)
      if (id === 'markdown-renderer-napi') {
        throw new Error('missing package')
      }
      if (id === join(process.cwd(), 'native', 'markdown-renderer-napi')) {
        return {
          renderFencedCode: (code: string) => [code],
        }
      }
      throw new Error(`unexpected id: ${id}`)
    }

    expect(renderNativeFencedCode('const value = 1')).toEqual([
      'const value = 1',
    ])
    expect(ids).toEqual([
      'markdown-renderer-napi',
      join(process.cwd(), 'native', 'markdown-renderer-napi'),
    ])
    expect(getNativeFencedCodeRendererDebugSnapshot()).toMatchObject({
      resolvedModuleId: join(process.cwd(), 'native', 'markdown-renderer-napi'),
      lastLoadFailures: [
        {
          moduleId: 'markdown-renderer-napi',
          message: 'require_failed',
        },
      ],
      renderSuccesses: 1,
    })
  })
})
