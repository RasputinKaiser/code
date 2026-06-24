import type { RenderableMessage } from '../../types/message.js'
import { stripSystemReminders } from '../messageActions.js'

const promptTextCache = new WeakMap<RenderableMessage, string | null>()

export function stickyPromptText(msg: RenderableMessage): string | null {
  const cached = promptTextCache.get(msg)
  if (cached !== undefined) return cached
  const result = computeStickyPromptText(msg)
  promptTextCache.set(msg, result)
  return result
}

function computeStickyPromptText(msg: RenderableMessage): string | null {
  let raw: string | null = null
  if (msg.type === 'user') {
    if (msg.isMeta || msg.isVisibleInTranscriptOnly) return null
    if (typeof msg.message.content === 'string') {
      raw = msg.message.content
    } else {
      const block = msg.message.content[0]
      if (block?.type !== 'text') return null
      raw = block.text
    }
  } else if (
    msg.type === 'attachment' &&
    msg.attachment.type === 'queued_command' &&
    msg.attachment.commandMode !== 'task-notification' &&
    !msg.attachment.isMeta
  ) {
    const prompt = msg.attachment.prompt
    raw =
      typeof prompt === 'string'
        ? prompt
        : prompt.flatMap(block => (block.type === 'text' ? [block.text] : [])).join('\n')
  }
  if (raw === null) return null
  const stripped = stripSystemReminders(raw)
  if (stripped.startsWith('<') || stripped === '') return null
  return stripped
}

export type StickyPromptPredecessorState = {
  messages: readonly RenderableMessage[]
  previousStickyPromptIndex: Int32Array
}

function sharedPrefixLength(
  previous: readonly RenderableMessage[],
  next: readonly RenderableMessage[],
): number {
  const limit = Math.min(previous.length, next.length)
  let index = 0
  while (index < limit && previous[index] === next[index]) {
    index++
  }
  return index
}

export function computeStickyPromptPredecessors(
  messages: readonly RenderableMessage[],
  previous?: StickyPromptPredecessorState,
): StickyPromptPredecessorState {
  if (!previous || previous.messages.length === 0) {
    return {
      messages,
      previousStickyPromptIndex: buildPredecessorArray(messages),
    }
  }

  const prefix = sharedPrefixLength(previous.messages, messages)
  if (
    messages.length < previous.messages.length ||
    prefix < previous.messages.length
  ) {
    return {
      messages,
      previousStickyPromptIndex: buildPredecessorArray(messages),
    }
  }

  if (messages.length === previous.messages.length) {
    return {
      messages,
      previousStickyPromptIndex: previous.previousStickyPromptIndex,
    }
  }

  const next = new Int32Array(messages.length + 1)
  next.set(previous.previousStickyPromptIndex)
  for (let index = previous.messages.length; index < messages.length; index++) {
    next[index + 1] =
      stickyPromptText(messages[index]!) !== null ? index : next[index]!
  }
  return {
    messages,
    previousStickyPromptIndex: next,
  }
}

function buildPredecessorArray(
  messages: readonly RenderableMessage[],
): Int32Array {
  const previousStickyPromptIndex = new Int32Array(messages.length + 1)
  previousStickyPromptIndex[0] = -1
  for (let index = 0; index < messages.length; index++) {
    previousStickyPromptIndex[index + 1] =
      stickyPromptText(messages[index]!) !== null
        ? index
        : previousStickyPromptIndex[index]!
  }
  return previousStickyPromptIndex
}
