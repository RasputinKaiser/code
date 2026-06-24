import { projectSnippedView } from './snipProjection.js'
import { isInternalBuild } from 'src/capabilities/static.js'

type MessageLike = {
  uuid?: string
  type?: string
  subtype?: string
  [key: string]: unknown
}

export type SnipCompactOptions = {
  force?: boolean
}

export type SnipCompactResult<T extends MessageLike> = {
  messages: T[]
  tokensFreed: number
  executed: boolean
  boundaryMessage?: MessageLike
}

export const SNIP_NUDGE_TEXT =
  'Context is getting large. If older messages are no longer needed, use the Snip tool to remove them from active context while keeping the transcript intact.'

export function isSnipRuntimeEnabled(): boolean {
  return isInternalBuild()
}

export function isSnipMarkerMessage(_message: unknown): boolean {
  return false
}

export function shouldNudgeForSnips(_messages: MessageLike[]): boolean {
  return false
}

export function snipCompactIfNeeded<T extends MessageLike>(
  messages: T[],
  options?: SnipCompactOptions,
): SnipCompactResult<T> {
  if (!options?.force && !isSnipRuntimeEnabled()) {
    return {
      messages,
      tokensFreed: 0,
      executed: false,
    }
  }

  if (!options?.force) {
    return {
      messages,
      tokensFreed: 0,
      executed: false,
    }
  }

  const projected = projectSnippedView(messages)

  return {
    messages: projected,
    tokensFreed: 0,
    executed: projected.length !== messages.length,
  }
}
