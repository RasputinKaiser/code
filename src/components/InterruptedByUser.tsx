import * as React from 'react'
import { Text } from '../ink.js'

export function InterruptedByUser(): React.ReactNode {
  return (
    <Text dimColor={true}>
      <Text color="red">■</Text>{' '}
      Conversation interrupted - tell the model what to do differently. Something went wrong? Hit `/feedback` to report the issue.
    </Text>
  )
}
