import type { Tools } from '../../Tool.js'
import type {
  NormalizedMessage,
  ProgressMessage as ProgressMessageType,
  RenderableMessage,
} from '../../types/message.js'
import { collapseBackgroundBashNotifications } from '../../utils/collapseBackgroundBashNotifications.js'
import { collapseHookSummaries } from '../../utils/collapseHookSummaries.js'
import { collapseReadSearchGroups } from '../../utils/collapseReadSearch.js'
import { collapseTeammateShutdowns } from '../../utils/collapseTeammateShutdowns.js'
import { applyGrouping } from '../../utils/groupToolUses.js'
import type { MessageLookups } from '../../utils/messages.js'
import {
  buildMessageLookups,
  getMessagesAfterCompactBoundary,
  reorderMessagesInUI,
  shouldShowUserMessage,
} from '../../utils/messages.js'
import { filterForBriefTool, dropTextInBriefTurns } from './briefFiltering.js'
import { isNullRenderingAttachment } from './nullRenderingAttachments.js'

type FilteredMessage = Exclude<NormalizedMessage, ProgressMessageType>

type ProjectionOptions = {
  tools: Tools
  verbose: boolean
  isTranscriptMode: boolean
  isBriefOnly: boolean
  shouldTruncate: boolean
  fullscreenEnabled: boolean
  briefToolNames: readonly string[]
  dropTextToolNames: readonly string[]
  maxTranscriptMessages: number
}

export type TranscriptProjectionInput = ProjectionOptions & {
  normalizedMessages: readonly NormalizedMessage[]
  syntheticStreamingToolUseMessages: readonly NormalizedMessage[]
}

type TranscriptProjectionCache = {
  options: ProjectionOptions
  normalizedMessages: readonly NormalizedMessage[]
  filteredMessages: readonly FilteredMessage[]
  messagesToShowNotTruncated: readonly FilteredMessage[]
  briefFilteredMessages: readonly FilteredMessage[]
  collapsed: readonly RenderableMessage[]
  lookups: MessageLookups
}

export type TranscriptProjectionResult = {
  cache: TranscriptProjectionCache
  collapsed: readonly RenderableMessage[]
  lookups: MessageLookups
  hasTruncatedMessages: boolean
  hiddenMessageCount: number
}

function filterBaseMessages(
  messages: readonly NormalizedMessage[],
  isTranscriptMode: boolean,
): FilteredMessage[] {
  return messages
    .filter(
      (msg): msg is FilteredMessage => msg.type !== 'progress',
    )
    .filter(msg => !isNullRenderingAttachment(msg))
    .filter(msg => shouldShowUserMessage(msg, isTranscriptMode))
}

function applyBriefFiltering(
  messages: readonly FilteredMessage[],
  isTranscriptMode: boolean,
  isBriefOnly: boolean,
  briefToolNames: readonly string[],
  dropTextToolNames: readonly string[],
): FilteredMessage[] {
  if (briefToolNames.length === 0 || isTranscriptMode) {
    return [...messages]
  }
  if (isBriefOnly) {
    return filterForBriefTool([...messages], [...briefToolNames])
  }
  if (dropTextToolNames.length > 0) {
    return dropTextInBriefTurns([...messages], [...dropTextToolNames])
  }
  return [...messages]
}

function collapseRenderableMessages(
  messages: readonly FilteredMessage[],
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

function cloneLookups(lookups: MessageLookups): MessageLookups {
  return {
    siblingToolUseIDs: new Map(lookups.siblingToolUseIDs),
    progressMessagesByToolUseID: new Map(lookups.progressMessagesByToolUseID),
    inProgressHookCounts: new Map(lookups.inProgressHookCounts),
    resolvedHookCounts: new Map(lookups.resolvedHookCounts),
    toolResultByToolUseID: new Map(lookups.toolResultByToolUseID),
    toolUseByToolUseID: new Map(lookups.toolUseByToolUseID),
    normalizedMessageCount: lookups.normalizedMessageCount,
    resolvedToolUseIDs: new Set(lookups.resolvedToolUseIDs),
    erroredToolUseIDs: new Set(lookups.erroredToolUseIDs),
  }
}

function mergeLookups(
  base: MessageLookups,
  tail: MessageLookups,
  normalizedMessageCount: number,
): MessageLookups {
  const merged = cloneLookups(base)
  for (const [key, value] of tail.siblingToolUseIDs) {
    merged.siblingToolUseIDs.set(key, value)
  }
  for (const [key, value] of tail.progressMessagesByToolUseID) {
    merged.progressMessagesByToolUseID.set(key, value)
  }
  for (const [key, value] of tail.inProgressHookCounts) {
    merged.inProgressHookCounts.set(key, value)
  }
  for (const [key, value] of tail.resolvedHookCounts) {
    merged.resolvedHookCounts.set(key, value)
  }
  for (const [key, value] of tail.toolResultByToolUseID) {
    merged.toolResultByToolUseID.set(key, value)
  }
  for (const [key, value] of tail.toolUseByToolUseID) {
    merged.toolUseByToolUseID.set(key, value)
  }
  for (const key of tail.resolvedToolUseIDs) {
    merged.resolvedToolUseIDs.add(key)
  }
  for (const key of tail.erroredToolUseIDs) {
    merged.erroredToolUseIDs.add(key)
  }
  merged.normalizedMessageCount = normalizedMessageCount
  return merged
}

function hasStableFastPathOptions(
  input: TranscriptProjectionInput,
  cache: TranscriptProjectionCache,
): boolean {
  return (
    cache.options.tools === input.tools &&
    cache.options.verbose === input.verbose &&
    cache.options.isTranscriptMode === input.isTranscriptMode &&
    cache.options.isBriefOnly === input.isBriefOnly &&
    cache.options.shouldTruncate === input.shouldTruncate &&
    cache.options.fullscreenEnabled === input.fullscreenEnabled &&
    cache.options.maxTranscriptMessages === input.maxTranscriptMessages &&
    cache.options.briefToolNames.length === input.briefToolNames.length &&
    cache.options.dropTextToolNames.length === input.dropTextToolNames.length &&
    cache.options.briefToolNames.every(
      (value, index) => value === input.briefToolNames[index],
    ) &&
    cache.options.dropTextToolNames.every(
      (value, index) => value === input.dropTextToolNames[index],
    )
  )
}

function sharedNormalizedPrefixLength(
  previous: readonly NormalizedMessage[],
  next: readonly NormalizedMessage[],
): number {
  const limit = Math.min(previous.length, next.length)
  let index = 0
  while (index < limit && previous[index] === next[index]) {
    index++
  }
  return index
}

function isTurnBoundaryMessage(message: FilteredMessage): boolean {
  return (
    message.type === 'user' &&
    !message.isMeta &&
    message.message.content[0]?.type !== 'tool_result'
  )
}

function findRecomputeBoundaryIndex(
  previous: readonly NormalizedMessage[],
  beforeIndexExclusive: number,
): number {
  const upperBound = Math.min(beforeIndexExclusive, previous.length)
  for (let index = upperBound - 1; index >= 0; index--) {
    const message = previous[index]
    if (message && message.type !== 'progress' && isTurnBoundaryMessage(message)) {
      return index
    }
  }
  return 0
}

function findStageBoundaryIndex<T extends { uuid: string }>(
  messages: readonly T[],
  uuid: string,
): number {
  return messages.findIndex(message => message.uuid === uuid)
}

function computeProjectionSlowPath(
  input: TranscriptProjectionInput,
): TranscriptProjectionResult {
  const compactAwareMessages =
    input.verbose || input.fullscreenEnabled
      ? input.normalizedMessages
      : getMessagesAfterCompactBoundary(input.normalizedMessages, {
          includeSnipped: true,
        })
  const filteredMessages = filterBaseMessages(
    compactAwareMessages,
    input.isTranscriptMode,
  )
  const messagesToShowNotTruncated = reorderMessagesInUI(
    filteredMessages,
    [...input.syntheticStreamingToolUseMessages] as FilteredMessage[],
  )
  const briefFilteredMessages = applyBriefFiltering(
    messagesToShowNotTruncated,
    input.isTranscriptMode,
    input.isBriefOnly,
    input.briefToolNames,
    input.dropTextToolNames,
  )
  const messagesToShow = input.shouldTruncate
    ? briefFilteredMessages.slice(-input.maxTranscriptMessages)
    : briefFilteredMessages
  const hasTruncatedMessages =
    input.shouldTruncate &&
    briefFilteredMessages.length > input.maxTranscriptMessages
  const collapsed = collapseRenderableMessages(
    messagesToShow,
    input.tools,
    input.verbose,
    input.isTranscriptMode,
  )
  const lookups = buildMessageLookups(
    [...input.normalizedMessages],
    [...messagesToShow],
  )
  const hiddenMessageCount =
    messagesToShowNotTruncated.length - input.maxTranscriptMessages

  const cache: TranscriptProjectionCache = {
    options: {
      tools: input.tools,
      verbose: input.verbose,
      isTranscriptMode: input.isTranscriptMode,
      isBriefOnly: input.isBriefOnly,
      shouldTruncate: input.shouldTruncate,
      fullscreenEnabled: input.fullscreenEnabled,
      briefToolNames: [...input.briefToolNames],
      dropTextToolNames: [...input.dropTextToolNames],
      maxTranscriptMessages: input.maxTranscriptMessages,
    },
    normalizedMessages: input.normalizedMessages,
    filteredMessages,
    messagesToShowNotTruncated,
    briefFilteredMessages,
    collapsed,
    lookups,
  }

  return {
    cache,
    collapsed,
    lookups,
    hasTruncatedMessages,
    hiddenMessageCount,
  }
}

export function computeTranscriptProjection(
  input: TranscriptProjectionInput,
  previous?: TranscriptProjectionCache,
): TranscriptProjectionResult {
  if (
    !previous ||
    input.shouldTruncate ||
    !(input.verbose || input.fullscreenEnabled) ||
    !hasStableFastPathOptions(input, previous)
  ) {
    return computeProjectionSlowPath(input)
  }

  const sharedPrefix = sharedNormalizedPrefixLength(
    previous.normalizedMessages,
    input.normalizedMessages,
  )
  if (
    input.normalizedMessages.length < previous.normalizedMessages.length ||
    sharedPrefix < previous.normalizedMessages.length
  ) {
    return computeProjectionSlowPath(input)
  }

  const recomputeBoundaryIndex = findRecomputeBoundaryIndex(
    previous.normalizedMessages,
    sharedPrefix === previous.normalizedMessages.length
      ? previous.normalizedMessages.length
      : sharedPrefix,
  )
  const boundaryUuid = input.normalizedMessages[recomputeBoundaryIndex]?.uuid
  if (!boundaryUuid) {
    return computeProjectionSlowPath(input)
  }

  const filteredBoundaryIndex = findStageBoundaryIndex(
    previous.filteredMessages,
    boundaryUuid,
  )
  const reorderedBoundaryIndex = findStageBoundaryIndex(
    previous.messagesToShowNotTruncated,
    boundaryUuid,
  )
  const briefBoundaryIndex = findStageBoundaryIndex(
    previous.briefFilteredMessages,
    boundaryUuid,
  )
  const collapsedBoundaryIndex = findStageBoundaryIndex(
    previous.collapsed,
    boundaryUuid,
  )
  if (
    filteredBoundaryIndex < 0 ||
    reorderedBoundaryIndex < 0 ||
    briefBoundaryIndex < 0 ||
    collapsedBoundaryIndex < 0
  ) {
    return computeProjectionSlowPath(input)
  }

  const tailNormalizedMessages = input.normalizedMessages.slice(
    recomputeBoundaryIndex,
  )
  const filteredTail = filterBaseMessages(
    tailNormalizedMessages,
    input.isTranscriptMode,
  )
  const filteredMessages = [
    ...previous.filteredMessages.slice(0, filteredBoundaryIndex),
    ...filteredTail,
  ]
  const reorderedTail = reorderMessagesInUI(
    filteredTail,
    [...input.syntheticStreamingToolUseMessages] as FilteredMessage[],
  )
  const messagesToShowNotTruncated = [
    ...previous.messagesToShowNotTruncated.slice(0, reorderedBoundaryIndex),
    ...reorderedTail,
  ]
  const briefFilteredTail = applyBriefFiltering(
    reorderedTail,
    input.isTranscriptMode,
    input.isBriefOnly,
    input.briefToolNames,
    input.dropTextToolNames,
  )
  const briefFilteredMessages = [
    ...previous.briefFilteredMessages.slice(0, briefBoundaryIndex),
    ...briefFilteredTail,
  ]
  const collapsedTail = collapseRenderableMessages(
    briefFilteredTail,
    input.tools,
    input.verbose,
    input.isTranscriptMode,
  )
  const collapsed = [
    ...previous.collapsed.slice(0, collapsedBoundaryIndex),
    ...collapsedTail,
  ]
  const lookups = mergeLookups(
    previous.lookups,
    buildMessageLookups([...tailNormalizedMessages], [...briefFilteredTail]),
    input.normalizedMessages.length,
  )

  const cache: TranscriptProjectionCache = {
    ...previous,
    normalizedMessages: input.normalizedMessages,
    filteredMessages,
    messagesToShowNotTruncated,
    briefFilteredMessages,
    collapsed,
    lookups,
  }

  return {
    cache,
    collapsed,
    lookups,
    hasTruncatedMessages: false,
    hiddenMessageCount:
      messagesToShowNotTruncated.length - input.maxTranscriptMessages,
  }
}
