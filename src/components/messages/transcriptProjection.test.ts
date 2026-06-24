import { describe, expect, it } from 'bun:test'
import type { Tools } from '../../Tool.js'
import type { NormalizedMessage, RenderableMessage } from '../../types/message.js'
import { BashTool } from '../../tools/BashTool/BashTool.js'
import { collapseBackgroundBashNotifications } from '../../utils/collapseBackgroundBashNotifications.js'
import { collapseHookSummaries } from '../../utils/collapseHookSummaries.js'
import { collapseReadSearchGroups } from '../../utils/collapseReadSearch.js'
import { collapseTeammateShutdowns } from '../../utils/collapseTeammateShutdowns.js'
import { applyGrouping } from '../../utils/groupToolUses.js'
import {
  CANCEL_MESSAGE,
  buildMessageLookups,
  createAssistantMessage,
  createUserMessage,
  REJECT_MESSAGE_WITH_REASON_PREFIX,
  reorderMessagesInUI,
  shouldShowUserMessage,
} from '../../utils/messages.js'
import { filterForBriefTool, dropTextInBriefTurns } from './briefFiltering.js'
import { computeIncrementalNormalizedMessages } from './incrementalNormalizeMessages.js'
import { isNullRenderingAttachment } from './nullRenderingAttachments.js'
import {
  computeTranscriptProjection,
  type TranscriptProjectionInput,
} from './transcriptProjection.js'

const NO_TOOLS: Tools = [] as never
const BASH_ONLY_TOOLS: Tools = [BashTool] as Tools

function collapseBaseline(
  messages: readonly RenderableMessage[],
  tools: Tools,
  verbose: boolean,
  isTranscriptMode: boolean,
): RenderableMessage[] {
  const { messages: groupedMessages } = applyGrouping([...messages], tools, verbose)
  return collapseBackgroundBashNotifications(
    collapseHookSummaries(
      collapseTeammateShutdowns(
        collapseReadSearchGroups(groupedMessages, tools, {
          allowFullscreenBashCollapse: !isTranscriptMode,
        }),
      ),
    ),
    verbose,
  )
}

function baselineProjection(input: TranscriptProjectionInput) {
  const filteredMessages = input.normalizedMessages
    .filter(
      (message): message is Exclude<NormalizedMessage, { type: 'progress' }> =>
        message.type !== 'progress',
    )
    .filter(message => !isNullRenderingAttachment(message))
    .filter(message => shouldShowUserMessage(message, input.isTranscriptMode))
  const messagesToShowNotTruncated = reorderMessagesInUI(
    filteredMessages,
    [...input.syntheticStreamingToolUseMessages] as never,
  )
  const briefFilteredMessages =
    input.briefToolNames.length === 0 || input.isTranscriptMode
      ? messagesToShowNotTruncated
      : input.isBriefOnly
        ? filterForBriefTool(
            [...messagesToShowNotTruncated],
            [...input.briefToolNames],
          )
        : input.dropTextToolNames.length > 0
          ? dropTextInBriefTurns(
              [...messagesToShowNotTruncated],
              [...input.dropTextToolNames],
            )
          : messagesToShowNotTruncated
  const messagesToShow = input.shouldTruncate
    ? briefFilteredMessages.slice(-input.maxTranscriptMessages)
    : briefFilteredMessages

  return {
    collapsed: collapseBaseline(
      messagesToShow,
      input.tools,
      input.verbose,
      input.isTranscriptMode,
    ),
    lookups: buildMessageLookups(
      [...input.normalizedMessages],
      [...messagesToShow],
    ),
    hasTruncatedMessages:
      input.shouldTruncate &&
      briefFilteredMessages.length > input.maxTranscriptMessages,
    hiddenMessageCount:
      messagesToShowNotTruncated.length - input.maxTranscriptMessages,
  }
}

function serializeCollapsed(messages: readonly RenderableMessage[]) {
  return messages.map(message => ({
    type: message.type,
    uuid: message.uuid,
  }))
}

function buildInput(
  normalizedMessages: readonly NormalizedMessage[],
  syntheticStreamingToolUseMessages: readonly NormalizedMessage[] = [],
  options?: Partial<
    Pick<
      TranscriptProjectionInput,
      'tools' | 'isTranscriptMode' | 'verbose' | 'shouldTruncate'
    >
  >,
): TranscriptProjectionInput {
  return {
    normalizedMessages,
    syntheticStreamingToolUseMessages,
    tools: options?.tools ?? NO_TOOLS,
    verbose: options?.verbose ?? false,
    isTranscriptMode: options?.isTranscriptMode ?? false,
    isBriefOnly: false,
    shouldTruncate: options?.shouldTruncate ?? false,
    fullscreenEnabled: true,
    briefToolNames: [],
    dropTextToolNames: [],
    maxTranscriptMessages: 30,
  }
}

function createBashToolUseTurn(command: string) {
  return createAssistantMessage({
    content: [
      {
        type: 'tool_use' as const,
        id: 'toolu_bash_contract',
        name: 'Bash',
        input: { command },
      },
    ],
  })
}

function createBashToolResultTurn(
  content: string,
  toolUseResult: unknown,
  options?: { isError?: boolean },
) {
  return createUserMessage({
    content: [
      {
        type: 'tool_result' as const,
        tool_use_id: 'toolu_bash_contract',
        content,
        ...(options?.isError ? { is_error: true } : {}),
      },
    ],
    toolUseResult,
  })
}

describe('computeTranscriptProjection', () => {
  it('matches the direct baseline for an initial projection', () => {
    const normalizedMessages = computeIncrementalNormalizedMessages([
      createUserMessage({ content: 'first prompt' }),
      createAssistantMessage({
        content: [{ type: 'text', text: 'first reply' }],
      }),
      createUserMessage({ content: 'second prompt' }),
    ]).normalizedMessages

    const input = buildInput(normalizedMessages)
    const projected = computeTranscriptProjection(input)
    const baseline = baselineProjection(input)

    expect(serializeCollapsed(projected.collapsed)).toEqual(
      serializeCollapsed(baseline.collapsed),
    )
    expect(projected.hiddenMessageCount).toBe(baseline.hiddenMessageCount)
    expect(projected.hasTruncatedMessages).toBe(baseline.hasTruncatedMessages)
    expect(projected.lookups.normalizedMessageCount).toBe(
      baseline.lookups.normalizedMessageCount,
    )
  })

  it('preserves prior-turn collapsed rows on append-only current-turn growth', () => {
    const firstMessages = [
      createUserMessage({ content: 'first prompt' }),
      createAssistantMessage({
        content: [{ type: 'text', text: 'first reply' }],
      }),
      createUserMessage({ content: 'second prompt' }),
    ]
    const firstNormalized = computeIncrementalNormalizedMessages(firstMessages)
    const firstInput = buildInput(firstNormalized.normalizedMessages)
    const firstProjection = computeTranscriptProjection(firstInput)

    const secondMessages = [
      ...firstMessages,
      createAssistantMessage({
        content: [{ type: 'text', text: 'second reply' }],
      }),
    ]
    const secondNormalized = computeIncrementalNormalizedMessages(
      secondMessages,
      firstNormalized,
    )
    const secondInput = buildInput(secondNormalized.normalizedMessages)
    const secondProjection = computeTranscriptProjection(
      secondInput,
      firstProjection.cache,
    )
    const baseline = baselineProjection(secondInput)

    expect(serializeCollapsed(secondProjection.collapsed)).toEqual(
      serializeCollapsed(baseline.collapsed),
    )
    expect(secondProjection.cache.collapsed[0]).toBe(firstProjection.cache.collapsed[0])
    expect(secondProjection.cache.collapsed[1]).toBe(firstProjection.cache.collapsed[1])
  })

  it('recomputes the active turn when synthetic streaming tool uses change', () => {
    const baseMessages = [
      createUserMessage({ content: 'first prompt' }),
      createAssistantMessage({
        content: [{ type: 'text', text: 'first reply' }],
      }),
      createUserMessage({ content: 'run the tool now' }),
    ]
    const normalized = computeIncrementalNormalizedMessages(baseMessages)
    const syntheticOne = normalizeSyntheticToolUse('tool-1')
    const firstInput = buildInput(normalized.normalizedMessages, syntheticOne)
    const firstProjection = computeTranscriptProjection(firstInput)

    const syntheticTwo = normalizeSyntheticToolUse('tool-2')
    const secondInput = buildInput(normalized.normalizedMessages, syntheticTwo)
    const secondProjection = computeTranscriptProjection(
      secondInput,
      firstProjection.cache,
    )
    const baseline = baselineProjection(secondInput)

    expect(serializeCollapsed(secondProjection.collapsed)).toEqual(
      serializeCollapsed(baseline.collapsed),
    )
    expect(secondProjection.cache.collapsed[0]).toBe(firstProjection.cache.collapsed[0])
    expect(secondProjection.cache.collapsed[1]).toBe(firstProjection.cache.collapsed[1])
  })

  it('retains interrupted Bash tool-result rows in transcript projection', () => {
    const normalizedMessages = computeIncrementalNormalizedMessages([
      createUserMessage({ content: 'show interrupted transcript' }),
      createBashToolUseTurn('sleep 60'),
      createBashToolResultTurn(CANCEL_MESSAGE, CANCEL_MESSAGE),
    ]).normalizedMessages

    const projected = computeTranscriptProjection(
      buildInput(normalizedMessages, [], {
        isTranscriptMode: true,
        tools: BASH_ONLY_TOOLS,
      }),
    )

    expect(projected.collapsed).toHaveLength(3)
    expect(projected.collapsed[2]?.type).toBe('user')
    expect(projected.collapsed[2]?.message.content[0]?.type).toBe('tool_result')
    expect(projected.collapsed[2]?.message.content[0]?.content).toBe(CANCEL_MESSAGE)
  })

  it('retains rejected Bash tool-result rows in transcript projection', () => {
    const normalizedMessages = computeIncrementalNormalizedMessages([
      createUserMessage({ content: 'show rejected transcript' }),
      createBashToolUseTurn('rm -rf tmp-contract-dir'),
      createBashToolResultTurn(
        `${REJECT_MESSAGE_WITH_REASON_PREFIX}Please stop and wait for instructions.`,
        'User rejected tool use',
        { isError: true },
      ),
    ]).normalizedMessages

    const projected = computeTranscriptProjection(
      buildInput(normalizedMessages, [], {
        isTranscriptMode: true,
        tools: BASH_ONLY_TOOLS,
      }),
    )

    expect(projected.collapsed).toHaveLength(3)
    expect(projected.collapsed[2]?.type).toBe('user')
    expect(projected.collapsed[2]?.message.content[0]?.type).toBe('tool_result')
    expect(projected.collapsed[2]?.message.content[0]?.is_error).toBe(true)
  })

  it('retains failed Bash tool-result rows in transcript projection', () => {
    const normalizedMessages = computeIncrementalNormalizedMessages([
      createUserMessage({ content: 'show failed transcript' }),
      createBashToolUseTurn('mkdir /root/blocked-dir'),
      createBashToolResultTurn(
        '<tool_use_error>Error calling tool (Bash): permission denied</tool_use_error>',
        'Error calling tool (Bash): permission denied',
        { isError: true },
      ),
    ]).normalizedMessages

    const projected = computeTranscriptProjection(
      buildInput(normalizedMessages, [], {
        isTranscriptMode: true,
        tools: BASH_ONLY_TOOLS,
      }),
    )

    expect(projected.collapsed).toHaveLength(3)
    expect(projected.collapsed[2]?.type).toBe('user')
    expect(projected.collapsed[2]?.message.content[0]?.type).toBe('tool_result')
    expect(projected.collapsed[2]?.message.content[0]?.is_error).toBe(true)
  })
})

function normalizeSyntheticToolUse(id: string): readonly NormalizedMessage[] {
  return computeIncrementalNormalizedMessages([
    createAssistantMessage({
      content: [
        {
          type: 'tool_use',
          id,
          name: 'Read',
          input: { file_path: 'README.md' },
        } as never,
      ],
    }),
  ]).normalizedMessages
}
