import type { RenderableMessage } from '../../types/message.js'

export type TranscriptSearchCorpusDelta =
  | { kind: 'reset' }
  | { kind: 'unchanged' }
  | { kind: 'append'; fromIndex: number; toIndex: number }

function stableAnchorIndices(length: number): number[] {
  if (length <= 0) return []
  const anchors = new Set<number>([
    0,
    length - 1,
    Math.floor(length / 4),
    Math.floor(length / 2),
    Math.floor((length * 3) / 4),
  ])
  return [...anchors]
}

function hasStableAnchors(
  previous: readonly RenderableMessage[],
  next: readonly RenderableMessage[],
): boolean {
  for (const idx of stableAnchorIndices(previous.length)) {
    if (next[idx] !== previous[idx]) {
      return false
    }
  }
  return true
}

export function classifyTranscriptSearchCorpusDelta(
  previous: readonly RenderableMessage[] | null,
  next: readonly RenderableMessage[],
): TranscriptSearchCorpusDelta {
  if (!previous) {
    return { kind: 'reset' }
  }

  if (next === previous) {
    return { kind: 'unchanged' }
  }

  if (next.length < previous.length) {
    return { kind: 'reset' }
  }

  if (next.length === previous.length) {
    return { kind: 'reset' }
  }

  if (previous.length === 0) {
    return { kind: 'append', fromIndex: 0, toIndex: next.length }
  }

  if (!hasStableAnchors(previous, next)) {
    return { kind: 'reset' }
  }

  return {
    kind: 'append',
    fromIndex: previous.length,
    toIndex: next.length,
  }
}
