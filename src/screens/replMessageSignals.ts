import { derivePromptInputMessageSignals, type PromptInputMessageSignals } from '../components/PromptInput/promptInputMessageSignals.js'
import type { HookProgress } from '../types/hooks.js'
import type { Message } from '../types/message.js'
import { truncateToWidth } from '../utils/format.js'
import { getTokenUsage } from '../utils/tokens.js'
import { isInternalBuild } from 'src/capabilities/static.js'

type StopHookEvent = 'Stop' | 'SubagentStop'

type StopHookExecutionState = {
  toolUseID: string | null
  hookEvent: StopHookEvent | null
  total: number
  completedCount: number
  customMessage: string | null
  commands: string[]
  hasSummary: boolean
}

type AssistantToolUseSignal = {
  id: string
  name: string
}

export type ReplMessageSignals = PromptInputMessageSignals & {
  stopHookSpinnerSuffix: string | null
  lastAssistantToolUses: ReadonlyArray<AssistantToolUseSignal>
}

export type ReplMessageSignalState = {
  messageCount: number
  lastMessageRef: Message | undefined
  promptSignals: PromptInputMessageSignals
  lastAssistantToolUses: ReadonlyArray<AssistantToolUseSignal>
  stopHookState: StopHookExecutionState
  signals: ReplMessageSignals
}

const EMPTY_STOP_HOOK_STATE: StopHookExecutionState = {
  toolUseID: null,
  hookEvent: null,
  total: 0,
  completedCount: 0,
  customMessage: null,
  commands: [],
  hasSummary: false,
}

export function deriveNextReplMessageSignalState(
  previous: ReplMessageSignalState | null,
  messages: Message[],
  isLoading: boolean,
): ReplMessageSignalState {
  if (!previous) {
    return deriveReplMessageSignalState(messages, isLoading)
  }

  if (messages.length === previous.messageCount) {
    const lastMessageRef = messages.at(-1)
    if (lastMessageRef === previous.lastMessageRef) {
      return withSignals(previous, isLoading)
    }

    // Fast path: only the last message changed.  If both old and new last
    // messages are non-assistant, all previous signal values remain valid
    // (most common: ephemeral progress updates replacing a progress message).
    // If the new last message is an assistant, recompute signals from it.
    // Otherwise fall back to full rebuild.
    const oldLastWasAssistant = previous.lastMessageRef?.type === 'assistant'
    const newLastIsAssistant = lastMessageRef?.type === 'assistant'
    if (!oldLastWasAssistant && !newLastIsAssistant) {
      return finalizeReplMessageSignalState(
        messages,
        previous.promptSignals,
        previous.lastAssistantToolUses,
        previous.stopHookState,
        isLoading,
      )
    }
    if (newLastIsAssistant && lastMessageRef) {
      const promptSignals = applyAppendedPromptSignals(
        previous.promptSignals,
        [lastMessageRef],
      )
      const lastAssistantToolUses = applyAppendedLastAssistantToolUses(
        previous.lastAssistantToolUses,
        [lastMessageRef],
      )
      return finalizeReplMessageSignalState(
        messages,
        promptSignals,
        lastAssistantToolUses,
        previous.stopHookState,
        isLoading,
      )
    }
  }

  if (canAppendIncrementally(previous, messages)) {
    const appended = messages.slice(previous.messageCount)
    const promptSignals = applyAppendedPromptSignals(
      previous.promptSignals,
      appended,
    )
    const lastAssistantToolUses = applyAppendedLastAssistantToolUses(
      previous.lastAssistantToolUses,
      appended,
    )
    const stopHookState = applyAppendedStopHookMessages(
      previous.stopHookState,
      appended,
    )

    return finalizeReplMessageSignalState(
      messages,
      promptSignals,
      lastAssistantToolUses,
      stopHookState,
      isLoading,
    )
  }

  return deriveReplMessageSignalState(messages, isLoading)
}

function deriveReplMessageSignalState(
  messages: Message[],
  isLoading: boolean,
): ReplMessageSignalState {
  const promptSignals = derivePromptInputMessageSignals(messages)
  const lastAssistantToolUses = deriveLastAssistantToolUses(messages)
  const stopHookState = deriveStopHookExecutionState(messages)

  return finalizeReplMessageSignalState(
    messages,
    promptSignals,
    lastAssistantToolUses,
    stopHookState,
    isLoading,
  )
}

function finalizeReplMessageSignalState(
  messages: Message[],
  promptSignals: PromptInputMessageSignals,
  lastAssistantToolUses: ReadonlyArray<AssistantToolUseSignal>,
  stopHookState: StopHookExecutionState,
  isLoading: boolean,
): ReplMessageSignalState {
  return {
    messageCount: messages.length,
    lastMessageRef: messages.at(-1),
    promptSignals,
    lastAssistantToolUses,
    stopHookState,
    signals: {
      ...promptSignals,
      lastAssistantToolUses,
      stopHookSpinnerSuffix: formatStopHookSpinnerSuffix(
        stopHookState,
        isLoading,
      ),
    },
  }
}

function withSignals(
  previous: ReplMessageSignalState,
  isLoading: boolean,
): ReplMessageSignalState {
  return {
    ...previous,
    signals: {
      ...previous.promptSignals,
      lastAssistantToolUses: previous.lastAssistantToolUses,
      stopHookSpinnerSuffix: formatStopHookSpinnerSuffix(
        previous.stopHookState,
        isLoading,
      ),
    },
  }
}

function canAppendIncrementally(
  previous: ReplMessageSignalState,
  messages: Message[],
): boolean {
  if (messages.length <= previous.messageCount) {
    return false
  }

  if (previous.messageCount === 0) {
    return true
  }

  return messages[previous.messageCount - 1] === previous.lastMessageRef
}

function applyAppendedPromptSignals(
  previous: PromptInputMessageSignals,
  appended: Message[],
): PromptInputMessageSignals {
  if (appended.length === 0) {
    return previous
  }

  let lastAssistantMessageId = previous.lastAssistantMessageId
  let lastApiUsageKey = previous.lastApiUsageKey
  let hasAssistantMessages = previous.hasAssistantMessages

  for (const message of appended) {
    if (message?.type !== 'assistant') {
      continue
    }

    hasAssistantMessages = true
    lastAssistantMessageId = message.uuid

    const usage = getTokenUsage(message)
    if (!usage) {
      continue
    }

    lastApiUsageKey = [
      message.uuid,
      usage.input_tokens,
      usage.output_tokens,
      usage.cache_creation_input_tokens ?? 0,
      usage.cache_read_input_tokens ?? 0,
    ].join(':')
  }

  return {
    hasMessages: true,
    hasAssistantMessages,
    lastAssistantMessageId,
    lastApiUsageKey,
  }
}

function deriveLastAssistantToolUses(
  messages: Message[],
): ReadonlyArray<AssistantToolUseSignal> {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i]
    if (message?.type !== 'assistant') {
      continue
    }

    return extractAssistantToolUses(message)
  }

  return []
}

function applyAppendedLastAssistantToolUses(
  previous: ReadonlyArray<AssistantToolUseSignal>,
  appended: Message[],
): ReadonlyArray<AssistantToolUseSignal> {
  if (appended.length === 0) {
    return previous
  }

  let lastAssistantToolUses = previous
  for (const message of appended) {
    if (message?.type !== 'assistant') {
      continue
    }

    lastAssistantToolUses = extractAssistantToolUses(message)
  }

  return lastAssistantToolUses
}

function extractAssistantToolUses(
  message: Extract<Message, { type: 'assistant' }>,
): ReadonlyArray<AssistantToolUseSignal> {
  return message.message.content
    .filter(
      (
        block,
      ): block is Extract<
        (typeof message.message.content)[number],
        { type: 'tool_use' }
      > => block.type === 'tool_use',
    )
    .map(block => ({
      id: block.id,
      name: block.name,
    }))
}

function deriveStopHookExecutionState(messages: Message[]): StopHookExecutionState {
  let state = EMPTY_STOP_HOOK_STATE

  for (const message of messages) {
    state = applyStopHookMessage(state, message)
  }

  return state
}

function applyAppendedStopHookMessages(
  previous: StopHookExecutionState,
  appended: Message[],
): StopHookExecutionState {
  let state = previous

  for (const message of appended) {
    state = applyStopHookMessage(state, message)
  }

  return state
}

function applyStopHookMessage(
  previous: StopHookExecutionState,
  message: Message,
): StopHookExecutionState {
  if (isStopHookProgressMessage(message)) {
    const toolUseID = message.toolUseID
    const reset =
      !toolUseID || toolUseID !== previous.toolUseID
        ? {
            toolUseID,
            hookEvent: message.data.hookEvent,
            total: 0,
            completedCount: 0,
            customMessage: null,
            commands: [],
            hasSummary: false,
          }
        : previous

    return {
      ...reset,
      hookEvent: message.data.hookEvent,
      total: reset.total + 1,
      customMessage: reset.customMessage ?? message.data.statusMessage ?? null,
      commands: [...reset.commands, message.data.command],
    }
  }

  if (
    previous.toolUseID &&
    message.type === 'system' &&
    message.subtype === 'stop_hook_summary' &&
    message.toolUseID === previous.toolUseID
  ) {
    return {
      ...previous,
      hasSummary: true,
    }
  }

  if (
    previous.toolUseID &&
    isStopHookAttachmentMessage(message) &&
    message.attachment.toolUseID === previous.toolUseID
  ) {
    return {
      ...previous,
      completedCount: previous.completedCount + 1,
    }
  }

  return previous
}

function formatStopHookSpinnerSuffix(
  state: StopHookExecutionState,
  isLoading: boolean,
): string | null {
  if (!isLoading || !state.toolUseID || state.total === 0 || state.hasSummary) {
    return null
  }

  if (state.customMessage) {
    return state.total === 1
      ? `${state.customMessage}…`
      : `${state.customMessage}… ${state.completedCount}/${state.total}`
  }

  const hookType = state.hookEvent === 'SubagentStop' ? 'subagent stop' : 'stop'

  if (isInternalBuild()) {
    const cmd = state.commands[state.completedCount]
    const label = cmd ? ` '${truncateToWidth(cmd, 40)}'` : ''

    return state.total === 1
      ? `running ${hookType} hook${label}`
      : `running ${hookType} hook${label}… ${state.completedCount}/${state.total}`
  }

  return state.total === 1
    ? `running ${hookType} hook`
    : `running stop hooks… ${state.completedCount}/${state.total}`
}

function isStopHookProgressMessage(
  message: Message,
): message is Message & {
  type: 'progress'
  toolUseID: string
  data: HookProgress & { hookEvent: StopHookEvent }
} {
  return (
    message.type === 'progress' &&
    !!message.toolUseID &&
    message.data.type === 'hook_progress' &&
    (message.data.hookEvent === 'Stop' ||
      message.data.hookEvent === 'SubagentStop')
  )
}

function isStopHookAttachmentMessage(message: Message): boolean {
  if (message.type !== 'attachment') {
    return false
  }

  const attachment = message.attachment
  return (
    'hookEvent' in attachment &&
    'toolUseID' in attachment &&
    (attachment.hookEvent === 'Stop' || attachment.hookEvent === 'SubagentStop')
  )
}
