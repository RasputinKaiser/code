import { describe, expect, it } from 'bun:test'
import { collapseHookSummaries } from './collapseHookSummaries.js'

function createSummary(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    type: 'system',
    subtype: 'stop_hook_summary',
    hookLabel: 'PostToolUse',
    hookCount: 1,
    hookInfos: ['info-a'],
    hookErrors: [] as string[],
    preventedContinuation: false,
    hasOutput: false,
    totalDurationMs: 12,
    ...overrides,
  }
}

describe('collapseHookSummaries', () => {
  it('collapses consecutive labeled summaries with the same hook label', () => {
    const collapsed = collapseHookSummaries([
      createSummary({
        hookCount: 2,
        hookInfos: ['info-a'],
        hookErrors: ['err-a'],
        totalDurationMs: 10,
      }) as never,
      createSummary({
        hookCount: 3,
        hookInfos: ['info-b'],
        hookErrors: ['err-b'],
        preventedContinuation: true,
        hasOutput: true,
        totalDurationMs: 25,
      }) as never,
    ])

    expect(collapsed).toHaveLength(1)
    expect(collapsed[0]).toMatchObject({
      type: 'system',
      subtype: 'stop_hook_summary',
      hookLabel: 'PostToolUse',
      hookCount: 5,
      hookInfos: ['info-a', 'info-b'],
      hookErrors: ['err-a', 'err-b'],
      preventedContinuation: true,
      hasOutput: true,
      totalDurationMs: 25,
    })
  })

  it('keeps different labels, unlabeled summaries, and non-summary messages as boundaries', () => {
    const unlabeled = createSummary({
      hookLabel: undefined,
      hookCount: 7,
    })
    const informational = {
      type: 'system',
      subtype: 'informational',
      content: 'separator',
    }

    const collapsed = collapseHookSummaries([
      createSummary({ hookLabel: 'PostToolUse', hookCount: 1 }) as never,
      createSummary({ hookLabel: 'Notification', hookCount: 2 }) as never,
      informational as never,
      createSummary({ hookLabel: 'Notification', hookCount: 3 }) as never,
      unlabeled as never,
    ])

    expect(collapsed).toEqual([
      expect.objectContaining({
        hookLabel: 'PostToolUse',
        hookCount: 1,
      }),
      expect.objectContaining({
        hookLabel: 'Notification',
        hookCount: 2,
      }),
      informational,
      expect.objectContaining({
        hookLabel: 'Notification',
        hookCount: 3,
      }),
      unlabeled,
    ])
  })
})
