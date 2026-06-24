import { describe, expect, it } from 'bun:test'

import {
  QueryEngine,
  inferInitialToolChoiceFromPrompt,
  type QueryEngineReplEvent,
} from './QueryEngine.js'
import type { QueryParams } from './query.js'
import type { Tools } from './Tool.js'

async function collectTurnEvents<TTerminal>(
  stream: AsyncGenerator<QueryEngineReplEvent, TTerminal>,
): Promise<{
  events: QueryEngineReplEvent[]
  terminal: TTerminal
}> {
  const events: QueryEngineReplEvent[] = []

  while (true) {
    const next = await stream.next()
    if (next.done) {
      return {
        events,
        terminal: next.value,
      }
    }
    events.push(next.value)
  }
}

describe('QueryEngine prepared turn seams', () => {
  it('runPreparedTurn forwards the prepared params, events, and terminal value', async () => {
    const params = { sentinel: 'prepared-turn' } as unknown as QueryParams
    const expectedEvents: QueryEngineReplEvent[] = [
      { type: 'stream_request_start' } as QueryEngineReplEvent,
      {
        type: 'assistant',
        message: { role: 'assistant', content: [] },
        uuid: 'assistant-1',
        timestamp: '2026-04-13T00:00:00.000Z',
      } as QueryEngineReplEvent,
    ]
    const terminal = { kind: 'terminal-success' } as const
    let seenParams: QueryParams | undefined

    const result = await collectTurnEvents(
      QueryEngine.runPreparedTurn(params, {
        async *runQuery(receivedParams) {
          seenParams = receivedParams
          for (const event of expectedEvents) {
            yield event
          }
          return terminal as never
        },
      }),
    )

    expect(seenParams).toBe(params)
    expect(result.events).toEqual(expectedEvents)
    expect(result.terminal).toEqual(terminal)
  })
})

describe('inferInitialToolChoiceFromPrompt', () => {
  const tools = [
    { name: 'Bash' },
    { name: 'Read' },
    { name: 'Grep' },
  ] as unknown as Tools

  it('requires a first tool call for repository review prompts', () => {
    expect(
      inferInitialToolChoiceFromPrompt('Please review this repository.', tools),
    ).toEqual({ type: 'any' })
    expect(
      inferInitialToolChoiceFromPrompt(
        'Use available tools to inspect actual files before answering.',
        tools,
      ),
    ).toEqual({ type: 'any' })
  })

  it('does not force tools for pure answer prompts', () => {
    expect(
      inferInitialToolChoiceFromPrompt(
        'Reply with exactly this marker: K26_NCODE_OK',
        tools,
      ),
    ).toBeUndefined()
  })

  it('preserves explicit caller tool choice', () => {
    expect(
      inferInitialToolChoiceFromPrompt('Please review this repository.', tools, {
        type: 'auto',
      }),
    ).toEqual({ type: 'auto' })
  })
})
