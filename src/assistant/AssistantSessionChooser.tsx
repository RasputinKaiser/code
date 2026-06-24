import React from 'react'
import { Box, Text } from '../ink.js'
import type { AssistantSession } from './sessionDiscovery.js'
import { Select } from '../components/CustomSelect/index.js'
import { Dialog } from '../components/design-system/Dialog.js'

type Props = {
  sessions: AssistantSession[]
  onSelect: (id: string) => void
  onCancel: () => void
}

function formatStatus(status: AssistantSession['status']): string {
  switch (status) {
    case 'requires_action':
      return 'needs action'
    default:
      return status
  }
}

function renderSessionLabel(session: AssistantSession): React.ReactNode {
  return (
    <Box flexDirection="column">
      <Text bold>{session.title}</Text>
      <Text dimColor>
        {session.id.slice(0, 8)} · {formatStatus(session.status)}
        {session.repoPath ? ` · ${session.repoPath}` : ''}
      </Text>
    </Box>
  )
}

export function AssistantSessionChooser({
  sessions,
  onSelect,
  onCancel,
}: Props): React.ReactNode {
  const options = [
    ...sessions.map(session => ({
      label: renderSessionLabel(session),
      value: session.id,
    })),
    { label: 'Cancel', value: '__cancel__' },
  ]

  return (
    <Dialog title="Assistant Sessions" onCancel={onCancel} color="background">
      <Box flexDirection="column" gap={1}>
        <Text>Select a running assistant session to attach to.</Text>
        <Select
          options={options}
          onChange={value => {
            if (value === '__cancel__') {
              onCancel()
              return
            }
            onSelect(value)
          }}
        />
      </Box>
    </Dialog>
  )
}
