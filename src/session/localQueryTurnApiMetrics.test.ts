import { describe, expect, it } from 'bun:test'

import {
  buildLocalApiMetricsSummary,
  type LocalApiMetricsEntry,
} from './localQueryTurnApiMetrics.js'

describe('buildLocalApiMetricsSummary', () => {
  it('builds single-request summary with non-positive fields omitted', () => {
    const entry: LocalApiMetricsEntry = {
      ttftMs: 120,
      firstTokenTime: 1000,
      lastTokenTime: 2000,
      responseLengthBaseline: 0,
      endResponseLength: 40,
    }

    expect(
      buildLocalApiMetricsSummary({
        entries: [entry],
        hookDurationMs: 0,
        hookCount: 0,
        turnDurationMs: 3000,
        toolDurationMs: 0,
        toolCount: 0,
        classifierDurationMs: 0,
        classifierCount: 0,
        configWriteCount: 2,
      }),
    ).toEqual({
      ttftMs: 120,
      otps: 10,
      isP50: false,
      turnDurationMs: 3000,
      configWriteCount: 2,
    })
  })

  it('builds multi-request summary with p50 ttft and p50 otps', () => {
    const entries: LocalApiMetricsEntry[] = [
      {
        ttftMs: 200,
        firstTokenTime: 0,
        lastTokenTime: 1000,
        responseLengthBaseline: 0,
        endResponseLength: 40, // 10 otps
      },
      {
        ttftMs: 100,
        firstTokenTime: 0,
        lastTokenTime: 1000,
        responseLengthBaseline: 0,
        endResponseLength: 80, // 20 otps
      },
      {
        ttftMs: 300,
        firstTokenTime: 0,
        lastTokenTime: 1000,
        responseLengthBaseline: 0,
        endResponseLength: 120, // 30 otps
      },
    ]

    expect(
      buildLocalApiMetricsSummary({
        entries,
        hookDurationMs: 11,
        hookCount: 2,
        turnDurationMs: 2222,
        toolDurationMs: 33,
        toolCount: 1,
        classifierDurationMs: 44,
        classifierCount: 3,
        configWriteCount: 9,
      }),
    ).toEqual({
      ttftMs: 200,
      otps: 20,
      isP50: true,
      hookDurationMs: 11,
      hookCount: 2,
      turnDurationMs: 2222,
      toolDurationMs: 33,
      toolCount: 1,
      classifierDurationMs: 44,
      classifierCount: 3,
      configWriteCount: 9,
    })
  })
})
