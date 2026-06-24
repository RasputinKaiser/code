import { describe, expect, test } from 'bun:test'

import { dispatchReplStartupMemory } from './replStartupMemoryDispatch.js'

describe('dispatchReplStartupMemory', () => {
  test('does not wait for API-key reverification before loading memory files', async () => {
    const events: string[] = []
    let releaseReverify: (() => void) | null = null

    await dispatchReplStartupMemory({
      reverify: () => {
        events.push('reverify:start')
        return new Promise<void>(resolve => {
          releaseReverify = () => {
            events.push('reverify:finish')
            resolve()
          }
        })
      },
      getMemoryFiles: async () => {
        events.push('memory:load')
        return []
      },
      logDebug: message => {
        events.push(`log:${message}`)
      },
      cacheReadFileState: () => {
        events.push('cache')
      },
    })

    expect(events).toEqual([
      'reverify:start',
      'memory:load',
      'log:No NCODE.md/rules files found',
    ])

    releaseReverify?.()
    expect(events).toContain('reverify:finish')
  })

  test('preserves memory-file logging and raw-content cache semantics', async () => {
    const logs: string[] = []
    const cached: Array<{ path: string; content: string; isPartialView: boolean }> =
      []

    await dispatchReplStartupMemory({
      reverify: () => {},
      getMemoryFiles: async () => [
        {
          path: '/repo/CLAUDE.md',
          type: 'project',
          content: 'visible content',
          contentDiffersFromDisk: true,
          rawContent: 'raw disk content',
        },
        {
          path: '/repo/.claude/rules/test.md',
          type: 'project',
          content: 'rule content',
          parent: '/repo/CLAUDE.md',
        },
      ],
      logDebug: message => {
        logs.push(message)
      },
      cacheReadFileState: (path, value) => {
        cached.push({
          path,
          content: value.content,
          isPartialView: value.isPartialView,
        })
      },
    })

    expect(logs).toEqual([
      'Loaded 2 NCODE.md/rules files:\n' +
        '  [project] /repo/CLAUDE.md (15 chars)\n' +
        '  [project] /repo/.claude/rules/test.md (12 chars) (included by /repo/CLAUDE.md)',
    ])
    expect(cached).toEqual([
      {
        path: '/repo/CLAUDE.md',
        content: 'raw disk content',
        isPartialView: true,
      },
      {
        path: '/repo/.claude/rules/test.md',
        content: 'rule content',
        isPartialView: false,
      },
    ])
  })
})
