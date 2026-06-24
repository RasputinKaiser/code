import { describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  collectOpenAICompatReplayEvents,
  deriveOpenAICompatReplayCreateMessageParams,
  extractOpenAICompatReplayReceiptsFromDumpPrompts,
  parseOpenAICompatReplayReceipt,
  summarizeOpenAICompatDumpPromptsRequestShape,
} from './openAICompatInferenceReceiptReplay.js'

const FIXTURES_DIR = join(
  import.meta.dir,
  'fixtures',
  'openAICompatInferenceReceiptReplay',
)

function loadFixture(name: string) {
  return parseOpenAICompatReplayReceipt(
    readFileSync(join(FIXTURES_DIR, name), 'utf8'),
  )
}

function collectToolJsonDeltas(
  events: Array<Record<string, unknown>>,
  contentIndex: number,
): string {
  return events
    .filter(
      (event) =>
        event.type === 'content_block_delta' &&
        event.index === contentIndex &&
        typeof event.delta === 'object' &&
        event.delta !== null &&
        (event.delta as { type?: string }).type === 'input_json_delta',
    )
    .map((event) => (event.delta as { partial_json: string }).partial_json)
    .join('')
}

describe('openAICompatInferenceReceiptReplay', () => {
  it('extracts streamed replay receipts and caller-visible params from dump-prompts JSONL', () => {
    const fixture = loadFixture('tool-call.response.json')
    const dumpPrompts = [
      JSON.stringify({
        type: 'init',
        data: {
          model: '/data/models/hf/moonshotai__Kimi-K2.7-Code',
          max_tokens: 32000,
          reasoning_effort: 'none',
          tools: [
            {
              type: 'function',
              function: {
                name: 'Bash',
                description: 'Run shell commands',
                parameters: {
                  type: 'object',
                  properties: {
                    command: { type: 'string' },
                  },
                },
              },
            },
          ],
        },
      }),
      JSON.stringify(fixture.response),
    ].join('\n')

    const parsed = extractOpenAICompatReplayReceiptsFromDumpPrompts(
      dumpPrompts,
      '/tmp/replay.jsonl',
    )
    expect(parsed.receipts).toHaveLength(1)
    expect(parsed.message).toBeNull()
    expect(parsed.receipts[0]?.response.data.chunks).toHaveLength(
      fixture.response.data.chunks.length,
    )

    const params = deriveOpenAICompatReplayCreateMessageParams(
      parsed.init,
      parsed.receipts[0]!,
    )
    expect(params).toMatchObject({
      model: '/data/models/hf/moonshotai__Kimi-K2.7-Code',
      stream: true,
      max_tokens: 32000,
      thinking: { type: 'disabled' },
      tools: [
        expect.objectContaining({
          name: 'Bash',
        }),
      ],
    })
  })

  it('summarizes the request shape from a dump-prompts JSONL file', () => {
    const parsed = extractOpenAICompatReplayReceiptsFromDumpPrompts(
      [
        JSON.stringify({
          type: 'init',
          data: {
            model: '/data/models/hf/moonshotai__Kimi-K2.7-Code',
            max_tokens: 32000,
            max_completion_tokens: 32000,
            stream: true,
            stream_reasoning: true,
            reasoning_effort: 'none',
            tools: [
              {
                type: 'function',
                function: { name: 'REPL' },
              },
              {
                type: 'function',
                function: { name: 'ToolSearch' },
              },
            ],
            custom_params: {
              noumena_requested_betas: [
                'claude-code-20250219',
                'cli-internal-2026-02-09',
              ],
              noumena_context_management: {
                edits: [{ type: 'clear_thinking_20251015', keep: 'all' }],
              },
            },
          },
        }),
        JSON.stringify({
          type: 'message',
          data: {
            role: 'user',
            content:
              'Contents of /mlstore/src/noumena/AGENTS.md\\n' +
              'Contents of /mlstore/src/noumena/ncode/CLAUDE.md\\n' +
              'Contents of /mlstore/src/noumena/ncode/AGENTS.md\\n' +
              'lets review this repo, specifically code/',
          },
        }),
      ].join('\n'),
      '/tmp/request-shape.jsonl',
    )

    const expectedMessageText =
      'Contents of /mlstore/src/noumena/AGENTS.md\\n' +
      'Contents of /mlstore/src/noumena/ncode/CLAUDE.md\\n' +
      'Contents of /mlstore/src/noumena/ncode/AGENTS.md\\n' +
      'lets review this repo, specifically code/'

    expect(
      summarizeOpenAICompatDumpPromptsRequestShape(
        parsed,
        '/tmp/request-shape.jsonl',
      ),
    ).toEqual({
      source_path: '/tmp/request-shape.jsonl',
      model: '/data/models/hf/moonshotai__Kimi-K2.7-Code',
      max_tokens: 32000,
      max_completion_tokens: 32000,
      stream: true,
      stream_reasoning: true,
      reasoning_effort: 'none',
      tool_names: ['REPL', 'ToolSearch'],
      tool_count: 2,
      requested_betas: [
        'claude-code-20250219',
        'cli-internal-2026-02-09',
      ],
      has_context_management: true,
      context_management_edit_types: ['clear_thinking_20251015'],
      message_role: 'user',
      message_content_length: expectedMessageText.length,
      includes_parent_repo_agents: true,
      includes_ncode_agents: true,
      includes_claude_md: true,
      message_tail: expectedMessageText,
    })
  })

  it('replays a captured tool-call receipt cleanly through the real client reducer', async () => {
    const fixture = loadFixture('tool-call.response.json')

    const replay = await collectOpenAICompatReplayEvents(fixture, {
      model: '/data/models/hf/moonshotai__Kimi-K2.7-Code',
      stream: true,
      max_tokens: 64,
      messages: [{ role: 'user', content: 'hello' }],
    })

    const events = replay.events
    expect(replay.request_id).toBe('req-replay-0')
    expect(events[0]).toMatchObject({
      type: 'message_start',
      message: {
        role: 'assistant',
      },
    })
    const toolStarts = events.filter(
      (event) =>
        event.type === 'content_block_start' &&
        typeof event.content_block === 'object' &&
        event.content_block !== null &&
        (event.content_block as { type?: string }).type === 'tool_use',
    )
    expect(toolStarts).toHaveLength(2)
    expect(toolStarts).toEqual([
      expect.objectContaining({
        index: 1,
        content_block: expect.objectContaining({
          type: 'tool_use',
          name: 'Bash',
        }),
      }),
      expect.objectContaining({
        index: 2,
        content_block: expect.objectContaining({
          type: 'tool_use',
          name: 'Bash',
        }),
      }),
    ])
    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'message_delta',
        delta: expect.objectContaining({
          stop_reason: 'tool_use',
        }),
      }),
    )

    const firstToolArgs = JSON.parse(collectToolJsonDeltas(events, 1)) as {
      command?: string
      description?: string
    }
    const secondToolArgs = JSON.parse(collectToolJsonDeltas(events, 2)) as {
      command?: string
      description?: string
    }
    expect(firstToolArgs.command).toContain('sl root')
    expect(firstToolArgs.description).toContain('repo root')
    expect(secondToolArgs.command).toContain('find /mlstore/src/noumena/ncode/code')
    expect(secondToolArgs.description).toContain('directory structure')
  })

  it('fails a captured marker-leak receipt through the real client reducer', async () => {
    const fixture = loadFixture('marker-leak.response.json')

    await expect(
      collectOpenAICompatReplayEvents(fixture, {
        model: '/data/models/hf/moonshotai__Kimi-K2.7-Code',
        stream: true,
        max_tokens: 64,
        messages: [{ role: 'user', content: 'hello' }],
      }),
    ).rejects.toThrow('Malformed stream tool output leaked from backend response')
  })


  it('replays the captured reasoning-tail receipt cleanly through the real client reducer', async () => {
    const fixture = loadFixture('reasoning-tail-leak.response.json')

    const replay = await collectOpenAICompatReplayEvents(fixture, {
      model: '/data/models/hf/moonshotai__Kimi-K2.7-Code',
      stream: true,
      max_tokens: 64,
      messages: [{ role: 'user', content: 'hello' }],
    })

    const events = replay.events
    expect(replay.request_id).toBe('req-replay-0')
    expect(events[0]).toMatchObject({
      type: 'message_start',
      message: {
        role: 'assistant',
      },
    })
    const toolStarts = events.filter(
      (event) =>
        event.type === 'content_block_start' &&
        typeof event.content_block === 'object' &&
        event.content_block !== null &&
        (event.content_block as { type?: string }).type === 'tool_use',
    )
    expect(toolStarts).toHaveLength(1)
    expect(toolStarts).toEqual([
      expect.objectContaining({
        index: 0,
        content_block: expect.objectContaining({
          type: 'tool_use',
          name: 'Agent',
        }),
      }),
    ])
    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'message_delta',
        delta: expect.objectContaining({
          stop_reason: 'tool_use',
        }),
      }),
    )
    expect(
      events.some(
        (event) =>
          event.type === 'content_block_delta' &&
          typeof event.delta === 'object' &&
          event.delta !== null &&
          (event.delta as { type?: string }).type === 'text_delta',
      ),
    ).toBe(false)

    const toolArgs = JSON.parse(collectToolJsonDeltas(events, 0)) as {
      name?: string
      description?: string
      prompt?: string
    }
    expect(toolArgs.name).toBe('Legacy Anthropic URLs')
    expect(toolArgs.description).toContain('Legacy Anthropic URLs usage')
    expect(toolArgs.prompt).toContain('Legacy Anthropic URLs')
  })

  it('fails the captured blank-stop receipt through the real client reducer', async () => {
    const fixture = loadFixture('blank-stop.response.json')

    await expect(
      collectOpenAICompatReplayEvents(fixture, {
        model: '/data/models/hf/moonshotai__Kimi-K2.7-Code',
        stream: true,
        max_tokens: 64,
        messages: [{ role: 'user', content: 'hello' }],
      }),
    ).rejects.toThrow('Malformed stream response missing assistant content')
  })
})
