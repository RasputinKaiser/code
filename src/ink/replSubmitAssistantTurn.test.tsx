import { afterAll, afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'

const mainLoopModelPaths = [
  import.meta.resolve('../hooks/useMainLoopModel.js'),
  import.meta.resolve('../hooks/useMainLoopModel.ts'),
]

for (const mainLoopModelPath of mainLoopModelPaths) {
  mock.module(mainLoopModelPath, () => ({
    useMainLoopModel() {
      return 'claude-sonnet-4-6'
    },
  }))
}

import {
  cleanupMountedRepl,
  getMountedInkProbe,
  mountRepl,
  mountedScreenIncludes,
  normalizeTerminalText,
  readScreenText,
  waitFor,
  writeInput,
} from './replPerfHarness.js'
import {
  REPL_KEY_SEQUENCES,
  expectPromptInputBlock,
  readMountedScreenText,
  waitForMountedScreenText,
} from '../testing/replScreenContractHarness.js'
import { expectPromptFooterModules } from '../testing/replContractHarness.js'
import type { Command } from '../types/command.js'

const ORIGINAL_NO_FLICKER = process.env.CLAUDE_CODE_NO_FLICKER
const ORIGINAL_API_KEY = process.env.ANTHROPIC_API_KEY

async function mockQueryWithReply(content: string): Promise<{
  readonly getCallCount: () => number
}> {
  let callCount = 0
  const queryPaths = [
    import.meta.resolve('../query.ts'),
    import.meta.resolve('../query.js'),
  ]
  const { createAssistantMessage } = await import('../utils/messages.js')
  const actualQueryModule = await import(import.meta.resolve('../query.ts'))

  for (const path of queryPaths) {
    mock.module(path, () => ({
      ...actualQueryModule,
      query: async function* () {
        callCount += 1
        yield createAssistantMessage({
          content,
        })
        return { reason: 'completed' } as never
      },
    }))
  }

  return {
    getCallCount: () => callCount,
  }
}

beforeEach(() => {
  process.env.CLAUDE_CODE_NO_FLICKER = '1'
  process.env.ANTHROPIC_API_KEY = 'test-key'
})

afterEach(async () => {
  mock.restore()
  await cleanupMountedRepl()
})

afterAll(() => {
  if (ORIGINAL_NO_FLICKER === undefined) {
    delete process.env.CLAUDE_CODE_NO_FLICKER
  } else {
    process.env.CLAUDE_CODE_NO_FLICKER = ORIGINAL_NO_FLICKER
  }

  if (ORIGINAL_API_KEY === undefined) {
    delete process.env.ANTHROPIC_API_KEY
  } else {
    process.env.ANTHROPIC_API_KEY = ORIGINAL_API_KEY
  }
})

describe('mounted REPL plain submit assistant turn', () => {
  test('routes typed slash commands through the real mounted prompt submit path', async () => {
    const invocations: string[] = []
    const queryProbe = await mockQueryWithReply(
      'slash command should not reach model query',
    )
    const command: Command = {
      type: 'local-jsx',
      name: 'mounted-canary',
      description: 'mounted slash command canary',
      load: async () => ({
        call: async (onDone, _context, args) => {
          invocations.push(args)
          onDone('mounted slash command ok', { display: 'system' })
          return null
        },
      }),
    }

    const { terminal } = await mountRepl({
      messageCount: 0,
      replProps: {
        commands: [command],
      },
    })
    const ink = getMountedInkProbe(terminal)
    expect(ink).toBeDefined()

    await writeInput(terminal.stdin, '/mounted-canary alpha beta')
    await Bun.sleep(40)
    await writeInput(terminal.stdin, '\r')

    await waitFor(
      () => mountedScreenIncludes(ink, 'mounted slash command ok'),
      'typed slash command never rendered local command output',
      4000,
    )

    expect(invocations).toEqual(['alpha beta'])
    expect(queryProbe.getCallCount()).toBe(0)
  })

  test('keeps the main assistant turn flowing while the title side-path runs through the real local query chain', async () => {
    const titleRequests: string[] = []

    const sessionTitlePaths = [
      import.meta.resolve('../utils/sessionTitle.ts'),
      import.meta.resolve('../utils/sessionTitle.js'),
    ]
    const actualSessionTitleModule = await import(
      import.meta.resolve('../utils/sessionTitle.ts')
    )
    for (const path of sessionTitlePaths) {
      mock.module(path, () => ({
        ...actualSessionTitleModule,
        generateSessionTitle: async (text: string) => {
          titleRequests.push(text)
          return null
        },
      }))
    }

    const queryPaths = [
      import.meta.resolve('../query.ts'),
      import.meta.resolve('../query.js'),
    ]
    const { createAssistantMessage } = await import('../utils/messages.js')
    const actualQueryModule = await import(import.meta.resolve('../query.ts'))
    for (const path of queryPaths) {
      mock.module(path, () => ({
        ...actualQueryModule,
        query: async function* () {
          yield createAssistantMessage({
            content: 'mock assistant reply from mounted submit test',
          })
          return { reason: 'completed' } as never
        },
      }))
    }

    try {
      const { terminal } = await mountRepl({ messageCount: 0 })
      const ink = getMountedInkProbe(terminal)
      expect(ink).toBeDefined()

      await writeInput(terminal.stdin, 'hello mounted assistant')
      await Bun.sleep(40)
      await writeInput(terminal.stdin, '\r')

      await waitFor(
        () =>
          mountedScreenIncludes(
            ink,
            'mock assistant reply from mounted submit test',
          ),
        'mounted submit never rendered the assistant reply',
        4000,
      )

      expect(titleRequests).toEqual(['hello mounted assistant'])
    } finally {
    }
  })

  test('inserts a newline on raw Ctrl+J LF without submitting', async () => {
    const queryProbe = await mockQueryWithReply(
      'raw ctrl j should not submit',
    )

    const { terminal } = await mountRepl({ messageCount: 0 })
    const ink = getMountedInkProbe(terminal)
    expect(ink).toBeDefined()

    await writeInput(terminal.stdin, 'alpha')
    await writeInput(terminal.stdin, REPL_KEY_SEQUENCES.ctrlJRawLf)
    await writeInput(terminal.stdin, 'beta')
    await Bun.sleep(120)

    expect(queryProbe.getCallCount()).toBe(0)

    const screenText = readMountedScreenText(ink)
    expectPromptInputBlock(screenText, ['alpha', 'beta'])
    expect(screenText).not.toContain('raw ctrl j should not submit')
  })

  test('submits on carriage return Enter', async () => {
    const queryPaths = [
      import.meta.resolve('../query.ts'),
      import.meta.resolve('../query.js'),
    ]
    const { createAssistantMessage } = await import('../utils/messages.js')
    const actualQueryModule = await import(import.meta.resolve('../query.ts'))
    for (const path of queryPaths) {
      mock.module(path, () => ({
        ...actualQueryModule,
        query: async function* () {
          yield createAssistantMessage({
            content: 'newline submit reply',
          })
          return { reason: 'completed' } as never
        },
      }))
    }

    try {
      const { terminal } = await mountRepl({ messageCount: 0 })
      const ink = getMountedInkProbe(terminal)
      expect(ink).toBeDefined()

      await writeInput(terminal.stdin, 'hello carriage return submit')
      await Bun.sleep(40)
      await writeInput(terminal.stdin, '\r')

      await waitFor(
        () => mountedScreenIncludes(ink, 'newline submit reply'),
        'newline submit never rendered the assistant reply',
        4000,
      )
    } finally {
    }
  })

  test('inserts a newline on Shift+Enter without submitting through kitty CSI-u', async () => {
    const queryProbe = await mockQueryWithReply(
      'shift enter should not submit through kitty CSI-u',
    )

    const { terminal } = await mountRepl({ messageCount: 0 })
    const ink = getMountedInkProbe(terminal)
    expect(ink).toBeDefined()

    await writeInput(terminal.stdin, 'alpha')
    await writeInput(terminal.stdin, REPL_KEY_SEQUENCES.shiftEnterKitty)
    await writeInput(terminal.stdin, 'beta')
    await Bun.sleep(120)

    expect(queryProbe.getCallCount()).toBe(0)

    const screenText = readMountedScreenText(ink)
    expectPromptInputBlock(screenText, ['alpha', 'beta'])
    expect(screenText).not.toContain(
      'shift enter should not submit through kitty CSI-u',
    )
  })

  test('inserts a newline on Shift+Enter without submitting through modifyOtherKeys', async () => {
    const queryProbe = await mockQueryWithReply(
      'shift enter should not submit through modifyOtherKeys',
    )

    const { terminal } = await mountRepl({ messageCount: 0 })
    const ink = getMountedInkProbe(terminal)
    expect(ink).toBeDefined()

    await writeInput(terminal.stdin, 'gamma')
    await writeInput(
      terminal.stdin,
      REPL_KEY_SEQUENCES.shiftEnterModifyOtherKeys,
    )
    await writeInput(terminal.stdin, 'delta')
    await Bun.sleep(120)

    expect(queryProbe.getCallCount()).toBe(0)

    const screenText = readMountedScreenText(ink)
    expectPromptInputBlock(screenText, ['gamma', 'delta'])
    expect(screenText).not.toContain(
      'shift enter should not submit through modifyOtherKeys',
    )
  })

  test('inserts a newline on Shift+Enter without submitting through CSI tilde modified enter', async () => {
    const queryProbe = await mockQueryWithReply(
      'shift enter should not submit through CSI tilde modified enter',
    )

    const { terminal } = await mountRepl({ messageCount: 0 })
    const ink = getMountedInkProbe(terminal)
    expect(ink).toBeDefined()

    await writeInput(terminal.stdin, 'epsilon')
    await writeInput(terminal.stdin, REPL_KEY_SEQUENCES.shiftEnterTilde)
    await writeInput(terminal.stdin, 'zeta')
    await Bun.sleep(120)

    expect(queryProbe.getCallCount()).toBe(0)

    const screenText = readMountedScreenText(ink)
    expectPromptInputBlock(screenText, ['epsilon', 'zeta'])
    expect(screenText).not.toContain(
      'shift enter should not submit through CSI tilde modified enter',
    )
  })

  test('inserts a newline on Ctrl+J through Kitty CSI-u without submitting', async () => {
    const queryProbe = await mockQueryWithReply(
      'ctrl j should not submit through kitty CSI-u',
    )

    const { terminal } = await mountRepl({ messageCount: 0 })
    const ink = getMountedInkProbe(terminal)
    expect(ink).toBeDefined()

    await writeInput(terminal.stdin, 'alpha')
    await writeInput(terminal.stdin, REPL_KEY_SEQUENCES.ctrlJKitty)
    await writeInput(terminal.stdin, 'beta')
    await Bun.sleep(120)

    expect(queryProbe.getCallCount()).toBe(0)

    const screenText = readMountedScreenText(ink)
    expectPromptInputBlock(screenText, ['alpha', 'beta'])
    expect(screenText).not.toContain(
      'ctrl j should not submit through kitty CSI-u',
    )
  })

  test('inserts a newline on Ctrl+X then Enter without submitting on plain terminals', async () => {
    const queryProbe = await mockQueryWithReply(
      'ctrl x enter should not submit',
    )

    const { terminal } = await mountRepl({ messageCount: 0 })
    const ink = getMountedInkProbe(terminal)
    expect(ink).toBeDefined()

    await writeInput(terminal.stdin, 'alpha')
    await writeInput(terminal.stdin, REPL_KEY_SEQUENCES.ctrlX)
    await writeInput(terminal.stdin, '\r')
    await writeInput(terminal.stdin, 'beta')
    await Bun.sleep(120)

    expect(queryProbe.getCallCount()).toBe(0)

    const screenText = readMountedScreenText(ink)
    expectPromptInputBlock(screenText, ['alpha', 'beta'])
    expect(screenText).not.toContain('ctrl x enter should not submit')
  })

  test('cycles permission mode on Shift+Tab through the real mounted REPL footer', async () => {
    const { terminal } = await mountRepl({ messageCount: 0 })
    const ink = getMountedInkProbe(terminal)
    expect(ink).toBeDefined()

    const initialScreenText = readMountedScreenText(ink)
    expectPromptFooterModules(initialScreenText, {
      cwdSegment: process.cwd(),
      label: 'initial prompt footer',
    })
    expect(initialScreenText).not.toContain('accept edits')

    await writeInput(terminal.stdin, REPL_KEY_SEQUENCES.shiftTab)

    const cycledScreenText = await waitForMountedScreenText(
      ink,
      text => text.includes('accept edits'),
      {
        label: 'Shift+Tab permission-mode footer update',
        timeoutMs: 4000,
      },
    )

    expectPromptFooterModules(cycledScreenText, {
      cwdSegment: process.cwd(),
      label: 'Shift+Tab prompt footer',
    })
    expect(cycledScreenText).toContain('accept edits')
  })

  test('treats batched text plus carriage return as submit', async () => {
    const queryPaths = [
      import.meta.resolve('../query.ts'),
      import.meta.resolve('../query.js'),
    ]
    const { createAssistantMessage } = await import('../utils/messages.js')
    const actualQueryModule = await import(import.meta.resolve('../query.ts'))
    for (const path of queryPaths) {
      mock.module(path, () => ({
        ...actualQueryModule,
        query: async function* () {
          yield createAssistantMessage({
            content: 'batched carriage return reply',
          })
          return { reason: 'completed' } as never
        },
      }))
    }

    try {
      const { terminal } = await mountRepl({ messageCount: 0 })
      const ink = getMountedInkProbe(terminal)
      expect(ink).toBeDefined()

      await writeInput(terminal.stdin, 'hello batched carriage return\r')

      await waitFor(
        () => mountedScreenIncludes(ink, 'batched carriage return reply'),
        'batched carriage return never rendered the assistant reply',
        4000,
      )
    } finally {
    }
  })

  test('renders markdown structure through the real submit path', async () => {
    const prevNativeFence = process.env.NCODE_ENABLE_NATIVE_FENCED_CODE
    delete process.env.NCODE_ENABLE_NATIVE_FENCED_CODE

    const sample = [
      "Based on the spec and current docs, here's the doc alignment work:",
      '',
      '1. /agents-platform.md Updates Needed',
      '',
      'Current state section needs to explicitly call out:',
      '- Current UI shows trigger-first view',
      '- Target is routine-first view per ROUTINE_OBJECT_MODEL.md',
      '- Current gap: no adapter from trigger payloads to routine views',
      '',
      'New section: "Object Model Alignment"',
      '',
      '| Current | Target | Status |',
      '|---------|--------|--------|',
      '| trigger-first inspector | routine-first management UI | gap identified |',
      '| raw trigger IDs | routine IDs with triggers as implementation detail | pending adapter |',
      '| "scheduled remote agents" naming | "routines" naming | pending |',
      '',
      '```ts',
      'export const value = 1',
      '```',
    ].join('\n')

    const queryPaths = [
      import.meta.resolve('../query.ts'),
      import.meta.resolve('../query.js'),
    ]
    const { createAssistantMessage } = await import('../utils/messages.js')
    const actualQueryModule = await import(import.meta.resolve('../query.ts'))
    for (const path of queryPaths) {
      mock.module(path, () => ({
        ...actualQueryModule,
        query: async function* () {
          yield createAssistantMessage({
            content: sample,
          })
          return { reason: 'completed' } as never
        },
      }))
    }

    try {
      const { terminal } = await mountRepl({ messageCount: 0 })
      const ink = getMountedInkProbe(terminal)
      expect(ink).toBeDefined()

      await writeInput(terminal.stdin, 'render markdown')
      await Bun.sleep(40)
      await writeInput(terminal.stdin, '\r')

      await waitFor(
        () => mountedScreenIncludes(ink, 'Object Model Alignment'),
        'mounted submit never rendered the markdown response',
        4000,
      )

      const screenText = ink ? readScreenText(ink.frontFrame.screen) : ''
      expect(screenText).toContain('┌')
      expect(screenText).toContain('routine-first management UI')
      expect(screenText).toContain('export const value = 1')
      expect(screenText).not.toContain('| Current | Target | Status |')
      expect(screenText).not.toContain('```ts')
    } finally {
      if (prevNativeFence === undefined) {
        delete process.env.NCODE_ENABLE_NATIVE_FENCED_CODE
      } else {
        process.env.NCODE_ENABLE_NATIVE_FENCED_CODE = prevNativeFence
      }
    }
  })

  test('preserves structured diagram spacing through the real submit path', async () => {
    const sample = [
      'ncode client ──events──► platform-api ──► OpenTelemetry Collector',
      '                                                │',
      '',
      '                                     ────────────────────',
      '                                      │  GCP Cloud Monitoring│',
      '                                      │  (metrics, traces)   │',
      '                                      └────────────────────',
      '                                                │',
      '                                     ────────────────────',
      '                                      │  BigQuery (events)   │',
      '                                      │  - ncode_* events    │',
      '                                      │  - experiment data   │',
      '                                      └────────────────────',
      '                                                │',
      '',
      '                                     ────────────────────',
      '                                      │  GrowthBook          │',
      '                                      │  - queries BigQuery  │',
      '                                      │    for experiment    │',
      '                                      │    analysis          │',
      '                                      └────────────────────',
    ].join('\n')

    const queryPaths = [
      import.meta.resolve('../query.ts'),
      import.meta.resolve('../query.js'),
    ]
    const { createAssistantMessage } = await import('../utils/messages.js')
    const actualQueryModule = await import(import.meta.resolve('../query.ts'))
    for (const path of queryPaths) {
      mock.module(path, () => ({
        ...actualQueryModule,
        query: async function* () {
          yield createAssistantMessage({
            content: sample,
          })
          return { reason: 'completed' } as never
        },
      }))
    }

    try {
      const { terminal } = await mountRepl({ messageCount: 0 })
      const ink = getMountedInkProbe(terminal)
      expect(ink).toBeDefined()

      await writeInput(terminal.stdin, 'render diagram')
      await Bun.sleep(40)
      await writeInput(terminal.stdin, '\r')

      await waitFor(
        () => mountedScreenIncludes(ink, 'GCP Cloud Monitoring'),
        'mounted submit never rendered the diagram response',
        4000,
      )

      const screenText = ink ? readScreenText(ink.frontFrame.screen) : ''
      expect(screenText).toContain(
        '                                      │  GCP Cloud Monitoring│',
      )
      expect(screenText).toContain(
        '                                      │  - experiment data   │',
      )
      expect(screenText).toContain(
        '                                      │    analysis          │',
      )
    } finally {
    }
  })

  test('preserves structured diagram spacing while the assistant is still streaming', async () => {
    const sample = [
      'ncode client ──events──► platform-api ──► OpenTelemetry Collector',
      '                                                │',
      '',
      '                                     ────────────────────',
      '                                      │  GCP Cloud Monitoring│',
      '                                      │  (metrics, traces)   │',
      '                                      └────────────────────',
      '                                                │',
      '                                     ────────────────────',
      '                                      │  BigQuery (events)   │',
      '                                      │  - ncode_* events    │',
      '                                      │  - experiment data   │',
      '                                      └────────────────────',
    ].join('\n')

    const queryPaths = [
      import.meta.resolve('../query.ts'),
      import.meta.resolve('../query.js'),
    ]
    const { createAssistantMessage } = await import('../utils/messages.js')
    const actualQueryModule = await import(import.meta.resolve('../query.ts'))
    for (const path of queryPaths) {
      mock.module(path, () => ({
        ...actualQueryModule,
        query: async function* () {
          yield { type: 'stream_request_start', request_id: 'stream-diagram' }
          yield {
            type: 'stream_event',
            event: {
              type: 'content_block_start',
              index: 0,
              content_block: {
                type: 'text',
                text: '',
              },
            },
          }
          yield {
            type: 'stream_event',
            event: {
              type: 'content_block_delta',
              index: 0,
              delta: {
                type: 'text_delta',
                text: sample,
              },
            },
          }
          await Bun.sleep(500)
          yield createAssistantMessage({
            content: sample,
          })
          return { reason: 'completed' } as never
        },
      }))
    }

    try {
      const { terminal } = await mountRepl({ messageCount: 0 })
      const ink = getMountedInkProbe(terminal)
      expect(ink).toBeDefined()

      await writeInput(terminal.stdin, 'stream diagram')
      await Bun.sleep(40)
      await writeInput(terminal.stdin, '\r')

      await waitFor(
        () =>
          mountedScreenIncludes(ink, 'GCP Cloud Monitoring') &&
          mountedScreenIncludes(ink, '- experiment data'),
        'mounted submit never rendered the streaming diagram response',
        250,
      )

      const streamingScreenText = ink ? readScreenText(ink.frontFrame.screen) : ''
      expect(streamingScreenText).toContain(
        '                                      │  GCP Cloud Monitoring│',
      )
      expect(streamingScreenText).toContain(
        '                                      │  - experiment data   │',
      )

      await waitFor(
        () =>
          mountedScreenIncludes(ink, 'GCP Cloud Monitoring') &&
          mountedScreenIncludes(ink, '- experiment data'),
        'mounted submit never finalized the streamed diagram response',
        4000,
      )
    } finally {
    }
  })

  test('renders fenced code correctly while the assistant is still streaming', async () => {
    const prevNativeFence = process.env.NCODE_ENABLE_NATIVE_FENCED_CODE
    delete process.env.NCODE_ENABLE_NATIVE_FENCED_CODE

    const sample = [
      'Here is the implementation:',
      '',
      '```ts',
      'export const value = 1',
      '```',
    ].join('\n')

    const queryPaths = [
      import.meta.resolve('../query.ts'),
      import.meta.resolve('../query.js'),
    ]
    const { createAssistantMessage } = await import('../utils/messages.js')
    const actualQueryModule = await import(import.meta.resolve('../query.ts'))
    for (const path of queryPaths) {
      mock.module(path, () => ({
        ...actualQueryModule,
        query: async function* () {
          yield { type: 'stream_request_start', request_id: 'stream-fence' }
          yield {
            type: 'stream_event',
            event: {
              type: 'content_block_start',
              index: 0,
              content_block: {
                type: 'text',
                text: '',
              },
            },
          }
          yield {
            type: 'stream_event',
            event: {
              type: 'content_block_delta',
              index: 0,
              delta: {
                type: 'text_delta',
                text: sample,
              },
            },
          }
          await Bun.sleep(500)
          yield createAssistantMessage({
            content: sample,
          })
          return { reason: 'completed' } as never
        },
      }))
    }

    try {
      const { terminal } = await mountRepl({ messageCount: 0 })
      const ink = getMountedInkProbe(terminal)
      expect(ink).toBeDefined()

      await writeInput(terminal.stdin, 'stream fence')
      await Bun.sleep(40)
      await writeInput(terminal.stdin, '\r')

      await waitFor(
        () => mountedScreenIncludes(ink, 'export const value = 1'),
        'mounted submit never rendered the streaming fenced code response',
        250,
      )

      const streamingScreenText = ink ? readScreenText(ink.frontFrame.screen) : ''
      expect(streamingScreenText).toContain('export const value = 1')
      expect(streamingScreenText).not.toContain('```ts')

      await waitFor(
        () => mountedScreenIncludes(ink, 'export const value = 1'),
        'mounted submit never finalized the streamed fenced code response',
        4000,
      )
    } finally {
      if (prevNativeFence === undefined) {
        delete process.env.NCODE_ENABLE_NATIVE_FENCED_CODE
      } else {
        process.env.NCODE_ENABLE_NATIVE_FENCED_CODE = prevNativeFence
      }
    }
  })

  test('does not leak internal prompt XML tags through the real submit path', async () => {
    const sample = [
      '<system-reminder>',
      'internal hidden reminder',
      '</system-reminder>',
      '# Visible heading',
      '',
      '- visible item',
      '',
      '<turn_aborted>',
      'should never render',
      '</turn_aborted>',
    ].join('\n')

    const queryPaths = [
      import.meta.resolve('../query.ts'),
      import.meta.resolve('../query.js'),
    ]
    const { createAssistantMessage } = await import('../utils/messages.js')
    const actualQueryModule = await import(import.meta.resolve('../query.ts'))
    for (const path of queryPaths) {
      mock.module(path, () => ({
        ...actualQueryModule,
        query: async function* () {
          yield createAssistantMessage({
            content: sample,
          })
          return { reason: 'completed' } as never
        },
      }))
    }

    try {
      const { terminal } = await mountRepl({ messageCount: 0 })
      const ink = getMountedInkProbe(terminal)
      expect(ink).toBeDefined()

      await writeInput(terminal.stdin, 'render xml stripped markdown')
      await Bun.sleep(40)
      await writeInput(terminal.stdin, '\r')

      await waitFor(
        () => mountedScreenIncludes(ink, 'Visible heading'),
        'mounted submit never rendered the visible markdown response',
        4000,
      )

      const screenText = ink ? readScreenText(ink.frontFrame.screen) : ''
      expect(screenText).toContain('Visible heading')
      expect(screenText).toContain('visible item')
      expect(screenText).not.toContain('<system-reminder>')
      expect(screenText).not.toContain('internal hidden reminder')
      expect(screenText).not.toContain('<turn_aborted>')
      expect(screenText).not.toContain('should never render')
    } finally {
    }
  })

  test('handles malformed markdown gracefully through the real submit path', async () => {
    const sample = [
      '# MALFORMED_VISIBLE_HEADING',
      '',
      'Visible prose before malformed blocks.',
      '',
      '```ts',
      'const malformedFence = true',
      'const fenceTailVisible = "yes"',
      '',
      'service-a ──events──► service-b',
      '                         │',
      '              ────────────────────',
      '               │  DiagramProbeA     │',
      '               │  DiagramProbeB     │',
      '               └────────────────────',
      '',
      '<system-reminder>',
      'HIDDEN_SYSTEM_DANGLING',
      'still hidden after malformed open tag',
    ].join('\n')

    const queryPaths = [
      import.meta.resolve('../query.ts'),
      import.meta.resolve('../query.js'),
    ]
    const { createAssistantMessage } = await import('../utils/messages.js')
    const actualQueryModule = await import(import.meta.resolve('../query.ts'))
    for (const path of queryPaths) {
      mock.module(path, () => ({
        ...actualQueryModule,
        query: async function* () {
          yield createAssistantMessage({
            content: sample,
          })
          return { reason: 'completed' } as never
        },
      }))
    }

    try {
      const { terminal } = await mountRepl({ messageCount: 0 })
      const ink = getMountedInkProbe(terminal)
      expect(ink).toBeDefined()

      await writeInput(terminal.stdin, 'render malformed markdown')
      await Bun.sleep(40)
      await writeInput(terminal.stdin, '\r')

      await waitFor(
        () =>
          mountedScreenIncludes(ink, 'MALFORMED_VISIBLE_HEADING') &&
          mountedScreenIncludes(ink, 'DiagramProbeA') &&
          mountedScreenIncludes(ink, 'const malformedFence = true'),
        'mounted submit never rendered the malformed markdown response',
        4000,
      )

      const screenText = ink ? readScreenText(ink.frontFrame.screen) : ''
      expect(screenText).toContain('MALFORMED_VISIBLE_HEADING')
      expect(screenText).toContain('const malformedFence = true')
      expect(screenText).toContain('DiagramProbeA')
      expect(screenText).not.toContain('<system-reminder>')
      expect(screenText).not.toContain('HIDDEN_SYSTEM_DANGLING')
    } finally {
    }
  })

  test('handles truncated streaming markdown gracefully through the real submit path', async () => {
    const sample = [
      '# STREAM_TRUNCATED_VISIBLE',
      '',
      'Visible prose before truncation.',
      '',
      '```ts',
      'const streamingFenceVisible = true',
      '',
      'stream-source ──events──► stream-sink',
      '                              │',
      '                   ────────────────────',
      '                    │  StreamDiagramA    │',
      '                    │  StreamDiagramB',
    ].join('\n')

    const queryPaths = [
      import.meta.resolve('../query.ts'),
      import.meta.resolve('../query.js'),
    ]
    const { createAssistantMessage } = await import('../utils/messages.js')
    const actualQueryModule = await import(import.meta.resolve('../query.ts'))
    for (const path of queryPaths) {
      mock.module(path, () => ({
        ...actualQueryModule,
        query: async function* () {
          yield { type: 'stream_request_start', request_id: 'stream-truncated-markdown' }
          yield {
            type: 'stream_event',
            event: {
              type: 'content_block_start',
              index: 0,
              content_block: {
                type: 'text',
                text: '',
              },
            },
          }
          yield {
            type: 'stream_event',
            event: {
              type: 'content_block_delta',
              index: 0,
              delta: {
                type: 'text_delta',
                text: sample,
              },
            },
          }
          await Bun.sleep(500)
          yield createAssistantMessage({
            content: sample,
          })
          return { reason: 'completed' } as never
        },
      }))
    }

    try {
      const { terminal } = await mountRepl({ messageCount: 0 })
      const ink = getMountedInkProbe(terminal)
      expect(ink).toBeDefined()

      await writeInput(terminal.stdin, 'stream truncated markdown')
      await Bun.sleep(40)
      await writeInput(terminal.stdin, '\r')

      await waitFor(
        () =>
          mountedScreenIncludes(ink, 'STREAM_TRUNCATED_VISIBLE') &&
          mountedScreenIncludes(ink, 'const streamingFenceVisible = true') &&
          mountedScreenIncludes(ink, 'StreamDiagramA'),
        'mounted submit never rendered the truncated streaming markdown response',
        250,
      )

      const streamingScreenText = ink ? readScreenText(ink.frontFrame.screen) : ''
      expect(streamingScreenText).toContain('STREAM_TRUNCATED_VISIBLE')
      expect(streamingScreenText).toContain('const streamingFenceVisible = true')
      expect(streamingScreenText).toContain('StreamDiagramA')
      expect(streamingScreenText).not.toContain('```ts')

      await waitFor(
        () =>
          mountedScreenIncludes(ink, 'STREAM_TRUNCATED_VISIBLE') &&
          mountedScreenIncludes(ink, 'const streamingFenceVisible = true') &&
          mountedScreenIncludes(ink, 'StreamDiagramA'),
        'mounted submit never finalized the truncated markdown response',
        4000,
      )
    } finally {
    }
  })

  test('does not leak dangling hidden tags while markdown is still streaming', async () => {
    const sample = [
      '# STREAM_VISIBLE_HEADING',
      '',
      '- visible item',
      '',
      '<system-reminder>',
      'HIDDEN_STREAMING_INTERNAL',
      'still hidden while malformed',
    ].join('\n')

    const queryPaths = [
      import.meta.resolve('../query.ts'),
      import.meta.resolve('../query.js'),
    ]
    const { createAssistantMessage } = await import('../utils/messages.js')
    const actualQueryModule = await import(import.meta.resolve('../query.ts'))
    for (const path of queryPaths) {
      mock.module(path, () => ({
        ...actualQueryModule,
        query: async function* () {
          yield { type: 'stream_request_start', request_id: 'stream-dangling-hidden-tag' }
          yield {
            type: 'stream_event',
            event: {
              type: 'content_block_start',
              index: 0,
              content_block: {
                type: 'text',
                text: '',
              },
            },
          }
          yield {
            type: 'stream_event',
            event: {
              type: 'content_block_delta',
              index: 0,
              delta: {
                type: 'text_delta',
                text: sample,
              },
            },
          }
          await Bun.sleep(500)
          yield createAssistantMessage({
            content: sample,
          })
          return { reason: 'completed' } as never
        },
      }))
    }

    try {
      const { terminal } = await mountRepl({ messageCount: 0 })
      const ink = getMountedInkProbe(terminal)
      expect(ink).toBeDefined()

      await writeInput(terminal.stdin, 'stream dangling hidden tag')
      await Bun.sleep(40)
      await writeInput(terminal.stdin, '\r')

      await waitFor(
        () =>
          mountedScreenIncludes(ink, 'STREAM_VISIBLE_HEADING') &&
          mountedScreenIncludes(ink, 'visible item'),
        'mounted submit never rendered the visible streaming markdown response',
        250,
      )

      const streamingScreenText = ink ? readScreenText(ink.frontFrame.screen) : ''
      expect(streamingScreenText).toContain('STREAM_VISIBLE_HEADING')
      expect(streamingScreenText).toContain('visible item')
      expect(streamingScreenText).not.toContain('<system-reminder>')
      expect(streamingScreenText).not.toContain('HIDDEN_STREAMING_INTERNAL')

      await waitFor(
        () =>
          mountedScreenIncludes(ink, 'STREAM_VISIBLE_HEADING') &&
          mountedScreenIncludes(ink, 'visible item'),
        'mounted submit never finalized the hidden-tag streaming response',
        4000,
      )
    } finally {
    }
  })

  test('handles malformed tables and lists through the real submit path', async () => {
    const sample = [
      '# LIVE_MALFORMED_TABLE_LIST',
      '',
      '| Name | Status | Notes |',
      '| broken | separator | only',
      '| row | with | extra | cell |',
      '',
      '- list root',
      '  - nested item',
      '    - over-indented child',
      ' - misaligned bullet',
    ].join('\n')

    const queryPaths = [
      import.meta.resolve('../query.ts'),
      import.meta.resolve('../query.js'),
    ]
    const { createAssistantMessage } = await import('../utils/messages.js')
    const actualQueryModule = await import(import.meta.resolve('../query.ts'))
    for (const path of queryPaths) {
      mock.module(path, () => ({
        ...actualQueryModule,
        query: async function* () {
          yield createAssistantMessage({
            content: sample,
          })
          return { reason: 'completed' } as never
        },
      }))
    }

    const { terminal } = await mountRepl({
      messageCount: 0,
      terminalRows: 48,
      terminalColumns: 100,
    })
    const ink = getMountedInkProbe(terminal)
    expect(ink).toBeDefined()

    await writeInput(terminal.stdin, 'render malformed table list')
    await Bun.sleep(40)
    await writeInput(terminal.stdin, '\r')

    await waitFor(
      () =>
        mountedScreenIncludes(ink, 'LIVE_MALFORMED_TABLE_LIST') &&
        mountedScreenIncludes(ink, 'over-indented child') &&
        mountedScreenIncludes(ink, 'misaligned bullet'),
      'mounted submit never rendered the malformed table/list response',
      4000,
    )

    const screenText = ink ? readScreenText(ink.frontFrame.screen) : ''
    expect(screenText).toContain('LIVE_MALFORMED_TABLE_LIST')
    expect(screenText).toContain('over-indented child')
    expect(screenText).toContain('misaligned bullet')
    expect(screenText).toContain('broken')
  })

  test('handles mixed-width unicode while markdown is still streaming', async () => {
    const sample = [
      '# LIVE_MIXED_WIDTH_VISIBLE',
      '',
      'Emoji probe: 🚀✨',
      'CJK probe: 例子 系统',
      'Combining probe: Cafe\u0301 nai\u0308ve',
      'ZWJ probe: 👩‍💻 platform',
      '',
      '- bullet 🚀 例子 Cafe\u0301',
    ].join('\n')

    const queryPaths = [
      import.meta.resolve('../query.ts'),
      import.meta.resolve('../query.js'),
    ]
    const { createAssistantMessage } = await import('../utils/messages.js')
    const actualQueryModule = await import(import.meta.resolve('../query.ts'))
    for (const path of queryPaths) {
      mock.module(path, () => ({
        ...actualQueryModule,
        query: async function* () {
          yield { type: 'stream_request_start', request_id: 'stream-mixed-width-unicode' }
          yield {
            type: 'stream_event',
            event: {
              type: 'content_block_start',
              index: 0,
              content_block: {
                type: 'text',
                text: '',
              },
            },
          }
          yield {
            type: 'stream_event',
            event: {
              type: 'content_block_delta',
              index: 0,
              delta: {
                type: 'text_delta',
                text: sample,
              },
            },
          }
          await Bun.sleep(500)
          yield createAssistantMessage({
            content: sample,
          })
          return { reason: 'completed' } as never
        },
      }))
    }

    const { terminal } = await mountRepl({
      messageCount: 0,
      terminalRows: 48,
      terminalColumns: 100,
    })
    const ink = getMountedInkProbe(terminal)
    expect(ink).toBeDefined()

    await writeInput(terminal.stdin, 'stream mixed width unicode')
    await Bun.sleep(40)
    await writeInput(terminal.stdin, '\r')

    await waitFor(
      () =>
        mountedScreenIncludes(ink, 'LIVE_MIXED_WIDTH_VISIBLE') &&
        mountedScreenIncludes(ink, '🚀✨') &&
        mountedScreenIncludes(ink, '例子 系统'),
      'mounted submit never rendered the mixed-width unicode response',
      250,
    )

    const streamingScreenText = ink ? readScreenText(ink.frontFrame.screen) : ''
    expect(streamingScreenText).toContain('LIVE_MIXED_WIDTH_VISIBLE')
    expect(streamingScreenText).toContain('🚀✨')
    expect(streamingScreenText).toContain('例子 系统')
    expect(streamingScreenText).toContain('Cafe\u0301 nai\u0308ve')
    expect(streamingScreenText).toContain('👩‍💻 platform')

    await waitFor(
      () =>
        mountedScreenIncludes(ink, 'LIVE_MIXED_WIDTH_VISIBLE') &&
        mountedScreenIncludes(ink, '👩‍💻 platform'),
      'mounted submit never finalized the mixed-width unicode response',
      4000,
    )
  })

  test('handles nested blockquotes and tab-heavy indentation while markdown is still streaming', async () => {
    const sample = [
      '# LIVE_BLOCKQUOTE_VISIBLE',
      '',
      '> outer quote',
      '> > nested quote',
      '>\t tabbed quote tail',
      '',
      '\t- tab-indented bullet',
      '\t\t1. nested numbered item',
      'Visible tail after blockquote',
    ].join('\n')

    const queryPaths = [
      import.meta.resolve('../query.ts'),
      import.meta.resolve('../query.js'),
    ]
    const { createAssistantMessage } = await import('../utils/messages.js')
    const actualQueryModule = await import(import.meta.resolve('../query.ts'))
    for (const path of queryPaths) {
      mock.module(path, () => ({
        ...actualQueryModule,
        query: async function* () {
          yield { type: 'stream_request_start', request_id: 'stream-nested-blockquote-tabs' }
          yield {
            type: 'stream_event',
            event: {
              type: 'content_block_start',
              index: 0,
              content_block: {
                type: 'text',
                text: '',
              },
            },
          }
          yield {
            type: 'stream_event',
            event: {
              type: 'content_block_delta',
              index: 0,
              delta: {
                type: 'text_delta',
                text: sample,
              },
            },
          }
          await Bun.sleep(500)
          yield createAssistantMessage({
            content: sample,
          })
          return { reason: 'completed' } as never
        },
      }))
    }

    const { terminal } = await mountRepl({
      messageCount: 0,
      terminalRows: 48,
      terminalColumns: 100,
    })
    const ink = getMountedInkProbe(terminal)
    expect(ink).toBeDefined()

    await writeInput(terminal.stdin, 'stream blockquote tabs')
    await Bun.sleep(40)
    await writeInput(terminal.stdin, '\r')

    await waitFor(
      () =>
        mountedScreenIncludes(ink, 'LIVE_BLOCKQUOTE_VISIBLE') &&
        mountedScreenIncludes(ink, 'outer quote') &&
        mountedScreenIncludes(ink, 'nested quote'),
      'mounted submit never rendered the nested blockquote response',
      250,
    )

    const streamingScreenText = ink ? readScreenText(ink.frontFrame.screen) : ''
    expect(streamingScreenText).toContain('LIVE_BLOCKQUOTE_VISIBLE')
    expect(streamingScreenText).toContain('outer quote')
    expect(streamingScreenText).toContain('nested quote')
    expect(streamingScreenText).toContain('tabbed quote tail')
    expect(streamingScreenText).toContain('tab-indented bullet')
    expect(streamingScreenText).toContain('nested numbered item')

    await waitFor(
      () =>
        mountedScreenIncludes(ink, 'LIVE_BLOCKQUOTE_VISIBLE') &&
        mountedScreenIncludes(ink, 'nested numbered item'),
      'mounted submit never finalized the nested blockquote response',
      4000,
    )
  })

  test('renders indented fenced diagrams plus following tables and lists through the real submit path', async () => {
    const sample = [
      '  ```',
      '  ────────────────────────────────────────────────────────────',
      '  │                      NCODE BASE SESSION                       │',
      '  │              (Noumena OAuth or Noumena API Key)              │',
      '  └────────────────────────────────────────────────────────────',
      '                       │',
      '      ────────────────────────────',
      '',
      '    ──────────   ──────────   ──────────',
      '     │  direct  │    │  remote  │    │   ssh    │',
      '     │  Session │    │  Session │    │  Session │',
      '     └──────────    └────────    └──────────',
      '                      │',
      '     ────────────────────────────',
      '',
      '    ──────────  ──────────  ──────────',
      '     │  Noumena │   │   BYOK   │   │   BYOC   │',
      '     │  manages │   │   key    │   │  cluster │',
      '     │  (GKE)   │   │  + GKE   │   │  (your   │',
      '     │          │   │          │   │  k8s)    │',
      '     └──────────   └──────────   └──────────',
      '  ```',
      '',
      '  - **BYOK** = Bring Your Own Key (customer provides Anthropic/OpenAI key)',
      '  - **BYOC** = Bring Your Own Cluster (customer provides k8s cluster)',
      '',
      '  Same lifecycle, different scheduling targets:',
      '',
      '  | Target | Scheduler | API | Use Case |',
      '  |--------|-----------|-----|----------|',
      '  | Noumena-managed | GKE (ours) | Noumena API | Fully managed |',
      '  | BYOK | GKE (ours) | Noumena API + customer key | Controlled infra, own AI spend |',
      "  | BYOC | Customer's k8s | Direct to customer's cluster | Air-gapped, compliance |",
      '',
      '  And the scheduler interface is abstracted - could be:',
      '  - Kubernetes API (`kubectl apply` / client-go)',
      '  - Higher-level (Argo, Flux, etc.)',
      '  - Straight to GKE API for Noumena-managed',
    ].join('\n')

    const queryPaths = [
      import.meta.resolve('../query.ts'),
      import.meta.resolve('../query.js'),
    ]
    const { createAssistantMessage } = await import('../utils/messages.js')
    const actualQueryModule = await import(import.meta.resolve('../query.ts'))
    for (const path of queryPaths) {
      mock.module(path, () => ({
        ...actualQueryModule,
        query: async function* () {
          yield createAssistantMessage({
            content: sample,
          })
          return { reason: 'completed' } as never
        },
      }))
    }

    const { terminal } = await mountRepl({
      messageCount: 0,
      terminalRows: 48,
      terminalColumns: 100,
    })
    const ink = getMountedInkProbe(terminal)
    expect(ink).toBeDefined()

    await writeInput(terminal.stdin, 'render indented diagram table')
    await Bun.sleep(40)
    await writeInput(terminal.stdin, '\r')

    await waitFor(
      () =>
        normalizeTerminalText(terminal.getOutput()).includes(
          'NCODE BASE SESSION',
        ) &&
        normalizeTerminalText(terminal.getOutput()).includes(
          'Noumena-managed',
        ),
      'mounted submit never rendered the indented diagram/table response',
      4000,
    )

    const screenText = ink ? readScreenText(ink.frontFrame.screen) : ''
    const terminalText = normalizeTerminalText(terminal.getOutput())
    expect(screenText).not.toContain('```')
    expect(screenText).toContain('NCODE BASE SESSION')
    expect(terminalText).not.toContain('```')
    expect(terminalText).toContain('Noumena-managed')
    expect(terminalText).toContain('Fully managed')
    expect(terminalText).toContain('Kubernetes API')
  })

  test('handles composed markdown combinations through the real submit path', async () => {
    const cases = [
      {
        prompt: 'combo fence diagram table',
        sample: [
          '# LIVE_COMBO_FENCE_TABLE',
          '',
          'Intro prose before the architecture block.',
          '',
          '```text',
          'ncode client ──events──► platform-api ──► OpenTelemetry Collector',
          '                                                │',
          '',
          '                                     ────────────────────',
          '                                      │  ComboDiagramNodeA  │',
          '                                      │  ComboDiagramNodeB  │',
          '                                      └────────────────────',
          '```',
          '',
          '| Target | Scheduler | Status |',
          '|--------|-----------|--------|',
          '| BYOK | GKE | active |',
        ].join('\n'),
        visible: ['LIVE_COMBO_FENCE_TABLE', 'ComboDiagramNodeA', 'active'],
      },
      {
        prompt: 'combo quote fence list',
        sample: [
          '# LIVE_COMBO_QUOTE_FENCE',
          '',
          '> outer quote',
          '> > nested quote',
          '',
          '```ts',
          'export const comboProbe = "LIVE_COMBO_CODE_PROBE"',
          '```',
          '',
          '- bullet one',
          '- bullet two',
        ].join('\n'),
        visible: [
          'LIVE_COMBO_QUOTE_FENCE',
          'outer quote',
          'LIVE_COMBO_CODE_PROBE',
          'bullet two',
        ],
      },
      {
        prompt: 'combo prose diagram json table',
        sample: [
          '# LIVE_COMBO_MULTI',
          '',
          'Routine-first framing with a diagram and fenced follow-up.',
          '',
          'scheduler ──triggers──► routine store',
          '                      │',
          '',
          '           ────────────────────',
          '            │  LiveComboDiagramX │',
          '            │  LiveComboDiagramY │',
          '            └────────────────────',
          '',
          '```json',
          '{ "combo": "LIVE_COMBO_JSON_PROBE" }',
          '```',
          '',
          '| Current | Target |',
          '|---------|--------|',
          '| trigger | routine |',
        ].join('\n'),
        visible: [
          'LIVE_COMBO_MULTI',
          'LiveComboDiagramX',
          'LIVE_COMBO_JSON_PROBE',
          'routine',
        ],
      },
    ]

    const queryPaths = [
      import.meta.resolve('../query.ts'),
      import.meta.resolve('../query.js'),
    ]
    const { createAssistantMessage } = await import('../utils/messages.js')
    const actualQueryModule = await import(import.meta.resolve('../query.ts'))

    for (const testCase of cases) {
      for (const path of queryPaths) {
        mock.module(path, () => ({
          ...actualQueryModule,
          query: async function* () {
            yield createAssistantMessage({
              content: testCase.sample,
            })
            return { reason: 'completed' } as never
          },
        }))
      }

      const { terminal } = await mountRepl({
        messageCount: 0,
        terminalRows: 48,
        terminalColumns: 100,
      })
      const ink = getMountedInkProbe(terminal)
      expect(ink).toBeDefined()

      await writeInput(terminal.stdin, testCase.prompt)
      await Bun.sleep(40)
      await writeInput(terminal.stdin, '\r')

      await waitFor(
        () =>
          testCase.visible.every(token =>
            normalizeTerminalText(terminal.getOutput()).includes(token),
          ),
        `mounted submit never rendered composed markdown case ${testCase.prompt}`,
        4000,
      )

      const terminalText = normalizeTerminalText(terminal.getOutput())
      expect(terminalText).not.toContain('```')
      for (const visible of testCase.visible) {
        expect(terminalText).toContain(visible)
      }
    }
  })
})
