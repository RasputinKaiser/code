import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  flushDebugLogs,
  getDebugLogPath,
  logForDebugging,
  resetDebugLoggingForTesting,
} from './debug.js'

let tempRoot: string
let previousNodeEnv: string | undefined
let previousUserType: string | undefined
let previousNcodeConfigDir: string | undefined
let previousClaudeConfigDir: string | undefined
let previousMaxBytes: string | undefined

beforeEach(() => {
  tempRoot = mkdtempSync(join(tmpdir(), 'ncode-debug-test-'))
  previousNodeEnv = process.env.NODE_ENV
  previousUserType = process.env.USER_TYPE
  previousNcodeConfigDir = process.env.NCODE_CONFIG_DIR
  previousClaudeConfigDir = process.env.CLAUDE_CONFIG_DIR
  previousMaxBytes = process.env.NCODE_DEBUG_LOG_MAX_BYTES
  process.env.NODE_ENV = 'development'
  process.env.USER_TYPE = 'ant'
  process.env.NCODE_CONFIG_DIR = tempRoot
  process.env.CLAUDE_CONFIG_DIR = tempRoot
  process.env.NCODE_DEBUG_LOG_MAX_BYTES = '220'
  resetDebugLoggingForTesting()
})

afterEach(() => {
  resetDebugLoggingForTesting()
  if (previousNodeEnv === undefined) delete process.env.NODE_ENV
  else process.env.NODE_ENV = previousNodeEnv
  if (previousUserType === undefined) delete process.env.USER_TYPE
  else process.env.USER_TYPE = previousUserType
  if (previousNcodeConfigDir === undefined) delete process.env.NCODE_CONFIG_DIR
  else process.env.NCODE_CONFIG_DIR = previousNcodeConfigDir
  if (previousClaudeConfigDir === undefined) delete process.env.CLAUDE_CONFIG_DIR
  else process.env.CLAUDE_CONFIG_DIR = previousClaudeConfigDir
  if (previousMaxBytes === undefined) delete process.env.NCODE_DEBUG_LOG_MAX_BYTES
  else process.env.NCODE_DEBUG_LOG_MAX_BYTES = previousMaxBytes
  rmSync(tempRoot, { recursive: true, force: true })
})

describe('debug log budget', () => {
  it('caps debug logs with a sentinel and drops later lines', async () => {
    logForDebugging(`first ${'a'.repeat(60)}`)
    logForDebugging(`second ${'b'.repeat(60)}`)
    logForDebugging(`third ${'c'.repeat(60)}`)
    logForDebugging(`fourth ${'d'.repeat(60)}`)
    await flushDebugLogs()

    const path = getDebugLogPath()
    expect(existsSync(path)).toBe(true)
    const content = readFileSync(path, 'utf8')

    expect(content).toContain('first ')
    expect(content).toContain('second ')
    expect(content).toContain('Debug log cap reached')
    expect(content).not.toContain('third ')
    expect(content).not.toContain('fourth ')
  })
})
