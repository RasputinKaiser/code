import type { UUID } from 'crypto'
import type { Message as MessageType, NormalizedMessage } from '../../types/message.js'
import {
  createUserMessage,
  deriveUUID,
  isNotEmptyMessage,
} from '../../utils/messages.js'

export type IncrementalNormalizedMessagesState = {
  rawMessages: readonly MessageType[]
  normalizedMessages: readonly NormalizedMessage[]
  normalizedOffsets: readonly number[]
  chainStates: readonly boolean[]
  normalizedToolUseIDs: ReadonlySet<string>
  lastThinkingBlockId: string | null
  latestBashOutputUUID: string | null
  firstChangedNormalizedIndex: number
}

function getLastThinkingBlockIdForNormalizedMessage(
  message: NormalizedMessage,
): string | null {
  if (message.type === 'assistant') {
    if (message.message.content[0]?.type === 'thinking') {
      return `${message.uuid}:0`
    }
    return null
  }

  if (message.type === 'user') {
    const hasToolResult = message.message.content.some(
      block => block.type === 'tool_result',
    )
    if (!hasToolResult) {
      return 'no-thinking'
    }
  }

  return null
}

function getLatestBashOutputUUIDForNormalizedMessage(
  message: NormalizedMessage,
): string | null {
  if (message.type !== 'user') {
    return null
  }

  const hasBashOutput = message.message.content.some(block => {
    return (
      block.type === 'text' &&
      (block.text.startsWith('<bash-stdout') ||
        block.text.startsWith('<bash-stderr'))
    )
  })

  return hasBashOutput ? message.uuid : null
}

function getNormalizedAssistantMessages(
  message: Extract<MessageType, { type: 'assistant' }>,
  initialIsNewChain: boolean,
): { normalized: NormalizedMessage[]; isNewChain: boolean } {
  const normalized: NormalizedMessage[] = []
  const isNewChain = initialIsNewChain || message.message.content.length > 1
  for (let index = 0; index < message.message.content.length; index++) {
    const content = message.message.content[index]!
    normalized.push({
      type: 'assistant',
      timestamp: message.timestamp,
      message: {
        ...message.message,
        content: [content],
        context_management: message.message.context_management ?? null,
      },
      isMeta: message.isMeta,
      isVirtual: message.isVirtual,
      requestId: message.requestId,
      uuid: isNewChain
        ? deriveUUID(message.uuid as UUID, index)
        : message.uuid,
      error: message.error,
      isApiErrorMessage: message.isApiErrorMessage,
      advisorModel: message.advisorModel,
    } as NormalizedMessage)
  }
  return { normalized, isNewChain }
}

function getNormalizedUserMessages(
  message: Extract<MessageType, { type: 'user' }>,
  initialIsNewChain: boolean,
): { normalized: NormalizedMessage[]; isNewChain: boolean } {
  if (typeof message.message.content === 'string') {
    return {
      normalized: [
        {
          ...message,
          uuid: initialIsNewChain
            ? deriveUUID(message.uuid as UUID, 0)
            : message.uuid,
          message: {
            ...message.message,
            content: [{ type: 'text', text: message.message.content }],
          },
        } as NormalizedMessage,
      ],
      isNewChain: initialIsNewChain,
    }
  }

  const normalized: NormalizedMessage[] = []
  const isNewChain = initialIsNewChain || message.message.content.length > 1
  let imageIndex = 0
  for (let index = 0; index < message.message.content.length; index++) {
    const content = message.message.content[index]!
    const isImage = content.type === 'image'
    const imageId =
      isImage && message.imagePasteIds
        ? message.imagePasteIds[imageIndex]
        : undefined
    if (isImage) imageIndex++
    normalized.push({
      ...createUserMessage({
        content: [content],
        toolUseResult: message.toolUseResult,
        mcpMeta: message.mcpMeta,
        isMeta: message.isMeta,
        isVisibleInTranscriptOnly: message.isVisibleInTranscriptOnly,
        isVirtual: message.isVirtual,
        timestamp: message.timestamp,
        imagePasteIds: imageId !== undefined ? [imageId] : undefined,
        origin: message.origin,
      }),
      uuid: isNewChain
        ? deriveUUID(message.uuid as UUID, index)
        : message.uuid,
    } as NormalizedMessage)
  }

  return { normalized, isNewChain }
}

function normalizeRenderableSegment(
  messages: readonly MessageType[],
  initialIsNewChain: boolean,
): {
  normalizedMessages: NormalizedMessage[]
  normalizedOffsets: number[]
  chainStates: boolean[]
  normalizedToolUseIDs: Set<string>
  lastThinkingBlockId: string | null
  latestBashOutputUUID: string | null
} {
  const normalizedMessages: NormalizedMessage[] = []
  const normalizedOffsets = [0]
  const chainStates = [initialIsNewChain]
  const normalizedToolUseIDs = new Set<string>()
  let lastThinkingBlockId: string | null = null
  let latestBashOutputUUID: string | null = null

  let isNewChain = initialIsNewChain
  for (const message of messages) {
    let maybeNormalized: NormalizedMessage[]
    switch (message.type) {
      case 'assistant': {
        const assistant = getNormalizedAssistantMessages(message, isNewChain)
        maybeNormalized = assistant.normalized
        isNewChain = assistant.isNewChain
        break
      }
      case 'user': {
        const user = getNormalizedUserMessages(message, isNewChain)
        maybeNormalized = user.normalized
        isNewChain = user.isNewChain
        break
      }
      case 'attachment':
      case 'progress':
      case 'system':
        maybeNormalized = [message]
        break
    }

    for (const normalized of maybeNormalized) {
      if (!isNotEmptyMessage(normalized)) continue
      normalizedMessages.push(normalized)
      const nextThinkingBlockId =
        getLastThinkingBlockIdForNormalizedMessage(normalized)
      if (nextThinkingBlockId !== null) {
        lastThinkingBlockId = nextThinkingBlockId
      }
      const nextBashOutputUUID =
        getLatestBashOutputUUIDForNormalizedMessage(normalized)
      if (nextBashOutputUUID !== null) {
        latestBashOutputUUID = nextBashOutputUUID
      }
      if (
        normalized.type === 'assistant' &&
        normalized.message.content[0]?.type === 'tool_use'
      ) {
        normalizedToolUseIDs.add(normalized.message.content[0].id)
      }
    }

    normalizedOffsets.push(normalizedMessages.length)
    chainStates.push(isNewChain)
  }

  return {
    normalizedMessages,
    normalizedOffsets,
    chainStates,
    normalizedToolUseIDs,
    lastThinkingBlockId,
    latestBashOutputUUID,
  }
}

function sharedRawPrefixLength(
  previous: readonly MessageType[],
  next: readonly MessageType[],
): number {
  const limit = Math.min(previous.length, next.length)
  let index = 0
  while (index < limit && previous[index] === next[index]) {
    index++
  }
  return index
}

function computeLastMessageReplacement(
  messages: readonly MessageType[],
  previous: IncrementalNormalizedMessagesState,
  replaceRawIndex: number,
): IncrementalNormalizedMessagesState {
  const msg = messages[replaceRawIndex]!
  const isNewChain = previous.chainStates[replaceRawIndex] ?? false

  // Normalize only the changed message
  let tailNormalized: NormalizedMessage[]
  let tailIsNewChain: boolean
  switch (msg.type) {
    case 'assistant': {
      const assistant = getNormalizedAssistantMessages(msg, isNewChain)
      tailNormalized = assistant.normalized
      tailIsNewChain = assistant.isNewChain
      break
    }
    case 'user': {
      const user = getNormalizedUserMessages(msg, isNewChain)
      tailNormalized = user.normalized
      tailIsNewChain = user.isNewChain
      break
    }
    case 'attachment':
    case 'progress':
    case 'system':
      tailNormalized = [msg]
      tailIsNewChain = isNewChain
      break
  }

  // Filter empty messages exactly as normalizeRenderableSegment does
  const newTail: NormalizedMessage[] = []
  for (const normalized of tailNormalized) {
    if (isNotEmptyMessage(normalized)) {
      newTail.push(normalized)
    }
  }

  const oldNormStart = previous.normalizedOffsets[replaceRawIndex]!
  const oldNormEnd = previous.normalizedOffsets[replaceRawIndex + 1]!

  // Splice new tail into normalized messages
  const normalizedMessages = [
    ...previous.normalizedMessages.slice(0, oldNormStart),
    ...newTail,
  ]

  // Rebuild offsets: adjust everything after the replaced raw message
  const offsetDelta = newTail.length - (oldNormEnd - oldNormStart)
  const normalizedOffsets = previous.normalizedOffsets.slice()
  for (let i = replaceRawIndex + 1; i < normalizedOffsets.length; i++) {
    normalizedOffsets[i]! += offsetDelta
  }

  // Rebuild chainStates
  const chainStates = previous.chainStates.slice()
  chainStates[replaceRawIndex + 1] = tailIsNewChain || tailNormalized.length > 1

  // Update derived state by scanning the old tail and new tail
  let lastThinkingBlockId = previous.lastThinkingBlockId
  let latestBashOutputUUID = previous.latestBashOutputUUID
  const normalizedToolUseIDs = new Set(previous.normalizedToolUseIDs)

  // Determine whether the old tail produced the previous derived values
  let oldTailProducedThinking = false
  let oldTailProducedBash = false
  const oldTailToolUseIDs = new Set<string>()
  for (let i = oldNormStart; i < oldNormEnd; i++) {
    const normalized = previous.normalizedMessages[i]!
    const thinkingId = getLastThinkingBlockIdForNormalizedMessage(normalized)
    if (thinkingId !== null && thinkingId === previous.lastThinkingBlockId) {
      oldTailProducedThinking = true
    }
    const bashUUID = getLatestBashOutputUUIDForNormalizedMessage(normalized)
    if (bashUUID !== null && bashUUID === previous.latestBashOutputUUID) {
      oldTailProducedBash = true
    }
    if (
      normalized.type === 'assistant' &&
      normalized.message.content[0]?.type === 'tool_use'
    ) {
      oldTailToolUseIDs.add(normalized.message.content[0].id)
    }
  }

  // Scan new tail for its contributions
  let newTailProducesThinking = false
  let newTailProducesBash = false
  const newTailToolUseIDs = new Set<string>()
  for (const normalized of newTail) {
    const thinkingId = getLastThinkingBlockIdForNormalizedMessage(normalized)
    if (thinkingId !== null) {
      newTailProducesThinking = true
      lastThinkingBlockId = thinkingId
    }
    const bashUUID = getLatestBashOutputUUIDForNormalizedMessage(normalized)
    if (bashUUID !== null) {
      newTailProducesBash = true
      latestBashOutputUUID = bashUUID
    }
    if (
      normalized.type === 'assistant' &&
      normalized.message.content[0]?.type === 'tool_use'
    ) {
      newTailToolUseIDs.add(normalized.message.content[0].id)
    }
  }

  // If old tail produced a derived value the new tail does not replace,
  // scan backward through the preserved prefix to find the previous one.
  if (oldTailProducedThinking && !newTailProducesThinking) {
    lastThinkingBlockId = null
    for (let i = oldNormStart - 1; i >= 0; i--) {
      const thinkingId = getLastThinkingBlockIdForNormalizedMessage(
        previous.normalizedMessages[i]!,
      )
      if (thinkingId !== null) {
        lastThinkingBlockId = thinkingId
        break
      }
    }
  }
  if (oldTailProducedBash && !newTailProducesBash) {
    latestBashOutputUUID = null
    for (let i = oldNormStart - 1; i >= 0; i--) {
      const bashUUID = getLatestBashOutputUUIDForNormalizedMessage(
        previous.normalizedMessages[i]!,
      )
      if (bashUUID !== null) {
        latestBashOutputUUID = bashUUID
        break
      }
    }
  }

  // Update tool_use IDs: remove old tail's, add new tail's
  for (const id of oldTailToolUseIDs) {
    normalizedToolUseIDs.delete(id)
  }
  for (const id of newTailToolUseIDs) {
    normalizedToolUseIDs.add(id)
  }

  return {
    rawMessages: messages,
    normalizedMessages,
    normalizedOffsets,
    chainStates,
    normalizedToolUseIDs,
    lastThinkingBlockId,
    latestBashOutputUUID,
    firstChangedNormalizedIndex: oldNormStart,
  }
}

export function computeIncrementalNormalizedMessages(
  messages: readonly MessageType[],
  previous?: IncrementalNormalizedMessagesState,
): IncrementalNormalizedMessagesState {
  if (!previous || previous.rawMessages.length === 0) {
    const initial = normalizeRenderableSegment(messages, false)
    return {
      rawMessages: messages,
      normalizedMessages: initial.normalizedMessages,
      normalizedOffsets: initial.normalizedOffsets,
      chainStates: initial.chainStates,
      normalizedToolUseIDs: initial.normalizedToolUseIDs,
      lastThinkingBlockId: initial.lastThinkingBlockId,
      latestBashOutputUUID: initial.latestBashOutputUUID,
      firstChangedNormalizedIndex: 0,
    }
  }

  const sharedPrefix = sharedRawPrefixLength(previous.rawMessages, messages)

  // Fast path: last raw message replaced in place (ephemeral progress
  // updates).  Only the final raw entry changed, so we can splice the
  // corresponding normalized slice instead of rebuilding the whole array.
  if (
    messages.length === previous.rawMessages.length &&
    sharedPrefix === messages.length - 1
  ) {
    return computeLastMessageReplacement(messages, previous, sharedPrefix)
  }

  // Any mid-history edit, compaction rewrite, or /clear replacement falls
  // back to a full rebuild. The fast path is only for append-only growth.
  if (
    messages.length < previous.rawMessages.length ||
    sharedPrefix < previous.rawMessages.length
  ) {
    const rebuilt = normalizeRenderableSegment(messages, false)
    return {
      rawMessages: messages,
      normalizedMessages: rebuilt.normalizedMessages,
      normalizedOffsets: rebuilt.normalizedOffsets,
      chainStates: rebuilt.chainStates,
      normalizedToolUseIDs: rebuilt.normalizedToolUseIDs,
      lastThinkingBlockId: rebuilt.lastThinkingBlockId,
      latestBashOutputUUID: rebuilt.latestBashOutputUUID,
      firstChangedNormalizedIndex: 0,
    }
  }

  if (messages.length === previous.rawMessages.length) {
    return {
      rawMessages: messages,
      normalizedMessages: previous.normalizedMessages,
      normalizedOffsets: previous.normalizedOffsets,
      chainStates: previous.chainStates,
      normalizedToolUseIDs: previous.normalizedToolUseIDs,
      lastThinkingBlockId: previous.lastThinkingBlockId,
      latestBashOutputUUID: previous.latestBashOutputUUID,
      firstChangedNormalizedIndex: previous.normalizedMessages.length,
    }
  }

  const tailMessages = messages.slice(sharedPrefix)
  const tail = normalizeRenderableSegment(
    tailMessages,
    previous.chainStates[sharedPrefix] ?? false,
  )
  const normalizedOffsetBase = previous.normalizedOffsets[sharedPrefix] ?? 0

  return {
    rawMessages: messages,
    normalizedMessages: [
      ...previous.normalizedMessages,
      ...tail.normalizedMessages,
    ],
    normalizedOffsets: [
      ...previous.normalizedOffsets.slice(0, sharedPrefix + 1),
      ...tail.normalizedOffsets
        .slice(1)
        .map(offset => normalizedOffsetBase + offset),
    ],
    chainStates: [
      ...previous.chainStates.slice(0, sharedPrefix + 1),
      ...tail.chainStates.slice(1),
    ],
    normalizedToolUseIDs: new Set([
      ...previous.normalizedToolUseIDs,
      ...tail.normalizedToolUseIDs,
    ]),
    lastThinkingBlockId:
      tail.lastThinkingBlockId ?? previous.lastThinkingBlockId,
    latestBashOutputUUID:
      tail.latestBashOutputUUID ?? previous.latestBashOutputUUID,
    firstChangedNormalizedIndex: previous.normalizedMessages.length,
  }
}
