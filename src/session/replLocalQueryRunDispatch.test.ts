import { describe, expect, test } from 'bun:test'

import { dispatchReplLocalQueryRun } from './replLocalQueryRunDispatch.js'

describe('dispatchReplLocalQueryRun', () => {
  test('runs prelude before orchestrating the local turn and preserves compact-boundary routing', async () => {
    const calls: string[] = []

    await dispatchReplLocalQueryRun(
      {
        newMessages: [{ uuid: 'user-1' } as any],
        shouldQuery: false,
        additionalAllowedTools: ['Bash'],
        onCompactBoundary: () => {
          calls.push('compact-boundary')
        },
      },
      {
        runPrelude: () => {
          calls.push('prelude')
        },
        createLocalTurnDispatch: () => ({
          syncAllowedTools: tools => {
            calls.push(`sync:${tools.join(',')}`)
          },
          skipLocalQueryTurn: ({ newMessages, onCompactBoundary }) => {
            calls.push(`skip:${newMessages.length}`)
            onCompactBoundary?.()
          },
          executePreparedTurn: async () => {
            calls.push('execute')
          },
          onAfterSuccessfulTurn: () => {
            calls.push('after-success')
          },
          buildApiMetricsSummary: () => {
            calls.push('build-metrics')
            return undefined
          },
          appendApiMetricsMessage: () => {
            calls.push('append-metrics')
          },
          onTurnComplete: () => {
            calls.push('turn-complete')
          },
        }),
        prepareTurn: async () => {
          calls.push('prepare')
          return {} as any
        },
        resetLoadingState: () => {
          calls.push('reset-loading')
        },
        logQueryProfileReport: () => {
          calls.push('log-profile')
        },
      },
    )

    expect(calls).toEqual([
      'prelude',
      'sync:Bash',
      'skip:1',
      'compact-boundary',
    ])
  })

  test('runs the prepared local turn when shouldQuery is true', async () => {
    const calls: string[] = []
    const preparedTurn = { params: { id: 'prepared' } } as any

    await dispatchReplLocalQueryRun(
      {
        newMessages: [{ uuid: 'user-1' } as any],
        shouldQuery: true,
        additionalAllowedTools: ['Bash', 'Read'],
      },
      {
        runPrelude: () => {
          calls.push('prelude')
        },
        createLocalTurnDispatch: () => ({
          syncAllowedTools: tools => {
            calls.push(`sync:${tools.join(',')}`)
          },
          skipLocalQueryTurn: () => {
            calls.push('skip')
          },
          executePreparedTurn: async nextPreparedTurn => {
            calls.push(`execute:${String(nextPreparedTurn === preparedTurn)}`)
          },
          onAfterSuccessfulTurn: () => {
            calls.push('after-success')
          },
          buildApiMetricsSummary: () => {
            calls.push('build-metrics')
            return { totalRequests: 1 } as any
          },
          appendApiMetricsMessage: summary => {
            calls.push(`append-metrics:${summary.totalRequests}`)
          },
          onTurnComplete: () => {
            calls.push('turn-complete')
          },
        }),
        prepareTurn: async () => {
          calls.push('prepare')
          return preparedTurn
        },
        resetLoadingState: () => {
          calls.push('reset-loading')
        },
        logQueryProfileReport: () => {
          calls.push('log-profile')
        },
      },
    )

    expect(calls).toEqual([
      'prelude',
      'sync:Bash,Read',
      'prepare',
      'execute:true',
      'after-success',
      'build-metrics',
      'append-metrics:1',
      'reset-loading',
      'log-profile',
      'turn-complete',
    ])
  })
})
