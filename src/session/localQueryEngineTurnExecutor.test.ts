import { describe, expect, it } from 'bun:test'
import { executeLocalQueryEngineTurn } from './localQueryEngineTurnExecutor.js'

describe('executeLocalQueryEngineTurn', () => {
  it('runs the success lifecycle in order and reports the terminal result with event count', async () => {
    const callOrder: string[] = []
    const terminal = { kind: 'success' } as never
    const params = { query: 'params' } as never
    let seenParams: unknown

    const result = await executeLocalQueryEngineTurn(
      {
        params,
        hooks: {
          onStart: async () => {
            callOrder.push('start')
          },
          onEvent: async event => {
            callOrder.push(`event:${event.name}`)
          },
          onComplete: async completion => {
            callOrder.push(
              `complete:${completion.eventCount}:${completion.terminal.kind}`,
            )
          },
          onFinally: async () => {
            callOrder.push('finally')
          },
        },
      },
      {
        runTurn: async function* (receivedParams) {
          seenParams = receivedParams
          yield { name: 'one' } as never
          yield { name: 'two' } as never
          return terminal
        },
      },
    )

    expect(result).toEqual({
      terminal,
      eventCount: 2,
    })
    expect(seenParams).toBe(params)
    expect(callOrder).toEqual([
      'start',
      'event:one',
      'event:two',
      'complete:2:success',
      'finally',
    ])
  })

  it('calls onError, rethrows, and still runs finally when the turn fails', async () => {
    const callOrder: string[] = []
    const failure = new Error('turn failed')

    await expect(
      executeLocalQueryEngineTurn(
        {
          params: { query: 'params' } as never,
          hooks: {
            onEvent: async event => {
              callOrder.push(`event:${event.name}`)
            },
            onError: async error => {
              callOrder.push(
                `error:${error instanceof Error ? error.message : String(error)}`,
              )
            },
            onFinally: async () => {
              callOrder.push('finally')
            },
          },
        },
        {
          runTurn: async function* () {
            yield { name: 'before-error' } as never
            throw failure
          },
        },
      ),
    ).rejects.toThrow('turn failed')

    expect(callOrder).toEqual([
      'event:before-error',
      'error:turn failed',
      'finally',
    ])
  })
})
