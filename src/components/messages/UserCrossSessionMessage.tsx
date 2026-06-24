import type { TextBlockParam } from '@anthropic-ai/sdk/resources/index.mjs'
import React from 'react'
import { Text } from '../../ink.js'

type Props = {
  addMargin: boolean
  param: TextBlockParam
}

export function UserCrossSessionMessage({ param }: Props): React.ReactNode {
  return <Text dimColor>{param.text}</Text>
}
