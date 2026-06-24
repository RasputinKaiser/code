import React from 'react'
import { Box, Text } from '../../ink.js'
import { useAppState } from '../../state/AppState.js'

export function TungstenLiveMonitor(): React.ReactNode {
  const session = useAppState(s => s.tungstenActiveSession)
  const autoHidden = useAppState(s => s.tungstenPanelAutoHidden)
  const visible = useAppState(s => s.tungstenPanelVisible)
  const lastCommand = useAppState(s => s.tungstenLastCommand)
  const lastCapturedTime = useAppState(s => s.tungstenLastCapturedTime)

  if (!session || autoHidden || visible !== true) {
    return null
  }

  const parts: string[] = [`Tungsten: ${session.sessionName}`]
  if (lastCommand) {
    parts.push(`cmd "${lastCommand.command}"`)
  }
  if (lastCapturedTime) {
    parts.push(`captured ${new Date(lastCapturedTime).toLocaleTimeString()}`)
  }

  return (
    <Box paddingX={1}>
      <Text dimColor>{parts.join(' | ')}</Text>
    </Box>
  )
}
