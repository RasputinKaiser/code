import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
} from 'bun:test'
import { setIsInteractive } from 'src/bootstrap/state.js'
import {
  CLI_INTERNAL_BETA_HEADER,
  CONTEXT_MANAGEMENT_BETA_HEADER,
  REDACT_THINKING_BETA_HEADER,
} from 'src/constants/betas.js'
import {
  resetSettingsCache,
  setSessionSettingsCache,
} from 'src/utils/settings/settingsCache.js'

const MODEL = '/data/models/hf/moonshotai__Kimi-K2.7-Code'

const envKeys = [
  'NCODE_BUILD_MODE',
  'USER_TYPE',
  'CLAUDE_CODE_ENTRYPOINT',
  'CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS',
  'DISABLE_INTERLEAVED_THINKING',
  'USE_API_CONTEXT_MANAGEMENT',
  'USE_API_CLEAR_TOOL_RESULTS',
  'USE_API_CLEAR_TOOL_USES',
  'NOUMENA_API_KEY',
  'ANTHROPIC_API_KEY',
  'NCODE_REPL',
  'CLAUDE_CODE_REPL',
  'CLAUDE_REPL_MODE',
  'NCODE_JS_REPL',
  'CLAUDE_CODE_JS_REPL',
  'CLAUDE_CODE_SIMPLE',
] as const

const originalEnv = Object.fromEntries(
  envKeys.map(key => [key, process.env[key]]),
) as Record<(typeof envKeys)[number], string | undefined>

function restoreEnv(): void {
  for (const key of envKeys) {
    if (originalEnv[key] === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = originalEnv[key]
    }
  }
}

function configureStableInferenceModeTestState(options: {
  interactive: boolean
  entrypoint: 'cli' | 'sdk-cli'
}): void {
  restoreEnv()
  process.env.NCODE_BUILD_MODE = 'noumena'
  delete process.env.USER_TYPE
  delete process.env.CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS
  delete process.env.DISABLE_INTERLEAVED_THINKING
  delete process.env.USE_API_CONTEXT_MANAGEMENT
  delete process.env.USE_API_CLEAR_TOOL_RESULTS
  delete process.env.USE_API_CLEAR_TOOL_USES
  process.env.NOUMENA_API_KEY = 'test-api-key'
  delete process.env.ANTHROPIC_API_KEY
  delete process.env.NCODE_REPL
  delete process.env.CLAUDE_CODE_REPL
  delete process.env.CLAUDE_REPL_MODE
  delete process.env.NCODE_JS_REPL
  delete process.env.CLAUDE_CODE_JS_REPL
  delete process.env.CLAUDE_CODE_SIMPLE
  process.env.CLAUDE_CODE_ENTRYPOINT = options.entrypoint
  setIsInteractive(options.interactive)
  resetSettingsCache()
  setSessionSettingsCache({
    settings: {
      showThinkingSummaries: false,
    },
    errors: [],
  })
}

async function summarizeInferenceRequestShapeMode(options: {
  interactive: boolean
  entrypoint: 'cli' | 'sdk-cli'
}) {
  configureStableInferenceModeTestState(options)
  const [{ getAPIContextManagement }, { clearBetasCaches, getMergedBetas }] =
    await Promise.all([
      import('../compact/apiMicrocompact.js'),
      import('../../utils/betas.js'),
    ])
  clearBetasCaches()
  const betas = getMergedBetas(MODEL, { isAgenticQuery: true })
  const contextManagement = getAPIContextManagement({
    hasThinking: true,
    isRedactThinkingActive: betas.includes(REDACT_THINKING_BETA_HEADER),
    clearAllThinking: false,
  })

  return {
    betas,
    contextManagement,
  }
}

beforeEach(() => {
  configureStableInferenceModeTestState({
    interactive: true,
    entrypoint: 'cli',
  })
})

afterEach(() => {
  resetSettingsCache()
  restoreEnv()
})

describe('interactive vs headless inference request shape', () => {
  it('adds interactive-only redaction behavior on the cli path', async () => {
    const interactive = await summarizeInferenceRequestShapeMode({
      interactive: true,
      entrypoint: 'cli',
    })

    if (CLI_INTERNAL_BETA_HEADER) {
      expect(interactive.betas).toContain(CLI_INTERNAL_BETA_HEADER)
    }
    expect(interactive.betas).toContain(REDACT_THINKING_BETA_HEADER)
    expect(interactive.betas).toContain(CONTEXT_MANAGEMENT_BETA_HEADER)
    expect(interactive.contextManagement).toBeUndefined()
  })

  it('omits interactive-only redaction behavior on the sdk-cli path', async () => {
    const headless = await summarizeInferenceRequestShapeMode({
      interactive: false,
      entrypoint: 'sdk-cli',
    })

    if (CLI_INTERNAL_BETA_HEADER) {
      expect(headless.betas).not.toContain(CLI_INTERNAL_BETA_HEADER)
    }
    expect(headless.betas).not.toContain(REDACT_THINKING_BETA_HEADER)
    expect(headless.betas).toContain(CONTEXT_MANAGEMENT_BETA_HEADER)
    expect(headless.contextManagement).toEqual({
      edits: [
        {
          type: 'clear_thinking_20251015',
          keep: 'all',
        },
      ],
    })
  })
})
