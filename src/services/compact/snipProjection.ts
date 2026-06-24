type MessageLike = {
  uuid?: string
  type?: string
  [key: string]: unknown
}

type SnipBoundaryLike = MessageLike & {
  snipMetadata?: {
    removedUuids?: string[]
  }
}

export function isSnipBoundaryMessage(
  message: unknown,
): message is SnipBoundaryLike {
  if (typeof message !== 'object' || message === null) {
    return false
  }

  const candidate = message as SnipBoundaryLike
  return Array.isArray(candidate.snipMetadata?.removedUuids)
}

export function projectSnippedView<T extends MessageLike>(messages: T[]): T[] {
  const removedUuids = new Set<string>()

  for (const message of messages) {
    if (!isSnipBoundaryMessage(message)) {
      continue
    }

    for (const uuid of message.snipMetadata?.removedUuids ?? []) {
      removedUuids.add(uuid)
    }
  }

  if (removedUuids.size === 0) {
    return messages
  }

  return messages.filter(message => {
    if (isSnipBoundaryMessage(message)) {
      return true
    }
    return !message.uuid || !removedUuids.has(message.uuid)
  })
}
