import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { getSessionId } from '../bootstrap/state.js'
import { checkStatsigFeatureGate_CACHED_MAY_BE_STALE } from '../services/analytics/growthbook.js'
import { buildQueryConfig } from './config.js'

function resetEnv() {
  delete process.env.CLAUDE_CODE_EMIT_TOOL_USE_SUMMARIES
  delete process.env.CLAUDE_CODE_DISABLE_FAST_MODE
  delete process.env.USER_TYPE
}

beforeEach(() => {
  resetEnv()
})

afterEach(resetEnv)

describe('buildQueryConfig', () => {
  it('enables the env-controlled gates without disturbing the streaming gate contract', () => {
    process.env.CLAUDE_CODE_EMIT_TOOL_USE_SUMMARIES = '1'
    process.env.CLAUDE_CODE_DISABLE_FAST_MODE = 'true'
    process.env.USER_TYPE = 'ant'

    expect(buildQueryConfig()).toEqual({
      sessionId: getSessionId(),
      gates: {
        streamingToolExecution: checkStatsigFeatureGate_CACHED_MAY_BE_STALE(
          'ncode_streaming_tool_execution2',
        ),
        emitToolUseSummaries: true,
        isAnt: true,
        fastModeEnabled: false,
      },
    })
  })

  it('snapshots env-derived gates per call instead of caching module init values', () => {
    const first = buildQueryConfig()

    process.env.CLAUDE_CODE_EMIT_TOOL_USE_SUMMARIES = 'true'
    process.env.CLAUDE_CODE_DISABLE_FAST_MODE = '1'
    process.env.USER_TYPE = 'ant'

    const second = buildQueryConfig()

    expect(first).toEqual({
      sessionId: getSessionId(),
      gates: {
        streamingToolExecution: checkStatsigFeatureGate_CACHED_MAY_BE_STALE(
          'ncode_streaming_tool_execution2',
        ),
        emitToolUseSummaries: false,
        isAnt: false,
        fastModeEnabled: true,
      },
    })
    expect(second).toEqual({
      sessionId: getSessionId(),
      gates: {
        streamingToolExecution: checkStatsigFeatureGate_CACHED_MAY_BE_STALE(
          'ncode_streaming_tool_execution2',
        ),
        emitToolUseSummaries: true,
        isAnt: true,
        fastModeEnabled: false,
      },
    })
  })
})
