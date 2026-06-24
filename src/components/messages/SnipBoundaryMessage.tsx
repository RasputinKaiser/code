import React from 'react'
import { Text } from '../../ink.js'

type Props = {
  message: {
    snipMetadata?: {
      removedUuids?: string[]
    }
  }
}

export function SnipBoundaryMessage({ message }: Props): React.ReactNode {
  const removedCount = message.snipMetadata?.removedUuids?.length ?? 0
  const label =
    removedCount === 1
      ? '1 earlier message snipped'
      : `${removedCount} earlier messages snipped`
  return <Text dimColor>{label} from active context</Text>
}
