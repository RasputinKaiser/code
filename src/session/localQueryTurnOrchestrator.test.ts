import { describe, expect, it } from 'bun:test'
import { runLocalQueryTurnOrchestrator } from './localQueryTurnOrchestrator.js'

describe('runLocalQueryTurnOrchestrator', () => {
  it('syncs allowed tools and skips turn execution when shouldQuery is false', async () => {
    const callOrder: string[] = []
    const newMessages = [{ type: 'user', uuid: 'u1' }] as never
    const compactBoundary = () => {}

    await runLocalQueryTurnOrchestrator(
      {
        newMessages,
        shouldQuery: false,
        additionalAllowedTools: ['Read', 'Bash'],
        onCompactBoundary: compactBoundary,
      },
      {
        syncAllowedTools: tools => {
          callOrder.push(`sync:${tools.join(',')}`)
        },
        skipLocalQueryTurn: options => {
          callOrder.push(
            `skip:${options.newMessages.length}:${options.onCompactBoundary === compactBoundary}`,
          )
        },
        prepareTurn: async () => {
          callOrder.push('prepare')
          return {} as never
        },
        executePreparedTurn: async () => {
          callOrder.push('execute')
        },
        resetLoadingState: () => {
          callOrder.push('reset')
        },
        logQueryProfileReport: () => {
          callOrder.push('profile')
        },
      },
    )

    expect(callOrder).toEqual(['sync:Read,Bash', 'skip:1:true'])
  })

  it('runs the prepared turn, appends metrics, and finalizes in order after a successful query', async () => {
    const callOrder: string[] = []
    const preparedTurn = { params: { id: 'prepared' } } as never
    const summary = { totalInputTokens: 123 } as never
    let seenPreparedTurn: unknown
    let seenSummary: unknown

    await runLocalQueryTurnOrchestrator(
      {
        newMessages: [] as never,
        shouldQuery: true,
        additionalAllowedTools: ['Read'],
      },
      {
        syncAllowedTools: tools => {
          callOrder.push(`sync:${tools.join(',')}`)
        },
        skipLocalQueryTurn: () => {
          callOrder.push('skip')
        },
        prepareTurn: async () => {
          callOrder.push('prepare')
          return preparedTurn
        },
        executePreparedTurn: async turn => {
          seenPreparedTurn = turn
          callOrder.push('execute')
        },
        onAfterSuccessfulTurn: async () => {
          callOrder.push('after-success')
        },
        buildApiMetricsSummary: () => {
          callOrder.push('build-summary')
          return summary
        },
        appendApiMetricsMessage: appendedSummary => {
          seenSummary = appendedSummary
          callOrder.push('append-summary')
        },
        resetLoadingState: () => {
          callOrder.push('reset')
        },
        logQueryProfileReport: () => {
          callOrder.push('profile')
        },
        onTurnComplete: async () => {
          callOrder.push('turn-complete')
        },
      },
    )

    expect(callOrder).toEqual([
      'sync:Read',
      'prepare',
      'execute',
      'after-success',
      'build-summary',
      'append-summary',
      'reset',
      'profile',
      'turn-complete',
    ])
    expect(seenPreparedTurn).toBe(preparedTurn)
    expect(seenSummary).toBe(summary)
  })
})
