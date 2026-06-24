import { createSignal } from '../../utils/signal.js'
import type { QuerySource } from '../../constants/querySource.js'
import type { Message } from '../../types/message.js'
import type { ToolUseContext } from '../../Tool.js'

export type ContextCollapseStats = {
  collapsedSpans: number
  collapsedMessages: number
  stagedSpans: number
  health: {
    totalSpawns: number
    totalErrors: number
    totalEmptySpawns: number
    emptySpawnWarningEmitted: boolean
    lastError?: string
  }
}

const changed = createSignal()

const EMPTY_STATS: ContextCollapseStats = {
  collapsedSpans: 0,
  collapsedMessages: 0,
  stagedSpans: 0,
  health: {
    totalSpawns: 0,
    totalErrors: 0,
    totalEmptySpawns: 0,
    emptySpawnWarningEmitted: false,
    lastError: undefined,
  },
}

let stats: ContextCollapseStats = structuredClone(EMPTY_STATS)

export const subscribe = changed.subscribe

export function initContextCollapse(): void {
  resetContextCollapse()
}

export function resetContextCollapse(): void {
  stats = structuredClone(EMPTY_STATS)
  changed.emit()
}

export function getStats(): ContextCollapseStats {
  return {
    ...stats,
    health: { ...stats.health },
  }
}

export function isContextCollapseEnabled(): boolean {
  return false
}

export async function applyCollapsesIfNeeded(
  messages: Message[],
  _toolUseContext: ToolUseContext,
  _querySource: QuerySource,
): Promise<{ messages: Message[] }> {
  return { messages }
}

export function isWithheldPromptTooLong(
  _message: Message,
  _isPromptTooLongMessage: (message: Message) => boolean,
  _querySource: QuerySource,
): boolean {
  return false
}

export function recoverFromOverflow(
  messages: Message[],
  _querySource: QuerySource,
): { messages: Message[]; committed: number } {
  return {
    messages,
    committed: 0,
  }
}
