import type { Message } from '../../types/message.js'
import { getLastAssistantMessage } from '../../utils/messages.js'
import { getTokenUsage } from '../../utils/tokens.js'

export type PromptInputMessageSignals = {
  hasMessages: boolean
  hasAssistantMessages: boolean
  lastAssistantMessageId: string | null
  lastApiUsageKey: string
}

export function derivePromptInputMessageSignals(
  messages: Message[],
): PromptInputMessageSignals {
  const lastAssistant = getLastAssistantMessage(messages)

  return {
    hasMessages: messages.length > 0,
    hasAssistantMessages: lastAssistant !== undefined,
    lastAssistantMessageId: lastAssistant?.uuid ?? null,
    lastApiUsageKey: getLastApiUsageKey(messages),
  }
}

function getLastApiUsageKey(messages: Message[]): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i]
    const usage = message ? getTokenUsage(message) : undefined
    if (!usage || !message || message.type !== 'assistant') {
      continue
    }

    return [
      message.uuid,
      usage.input_tokens,
      usage.output_tokens,
      usage.cache_creation_input_tokens ?? 0,
      usage.cache_read_input_tokens ?? 0,
    ].join(':')
  }

  return 'none'
}
