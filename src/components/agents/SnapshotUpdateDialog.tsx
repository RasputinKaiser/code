import React from 'react'
import { Box, Text } from '../../ink.js'
import type { AgentMemoryScope } from '../../tools/AgentTool/agentMemory.js'
import { Select } from '../CustomSelect/index.js'
import { Dialog } from '../design-system/Dialog.js'

type Props = {
  agentType: string
  scope: AgentMemoryScope
  snapshotTimestamp: string
  onComplete: (choice: 'merge' | 'keep' | 'replace') => void
  onCancel: () => void
}

function formatScope(scope: AgentMemoryScope): string {
  switch (scope) {
    case 'user':
      return 'user'
    case 'project':
      return 'project'
    case 'local':
      return 'local'
  }
}

export function buildMergePrompt(
  agentType: string,
  scope: AgentMemoryScope,
): string {
  return [
    `A newer ${formatScope(scope)} memory snapshot is available for the ${agentType} agent.`,
    'Review the snapshot alongside the current memory files and merge any durable facts that should carry forward before continuing.',
  ].join(' ')
}

export function SnapshotUpdateDialog({
  agentType,
  scope,
  snapshotTimestamp,
  onComplete,
  onCancel,
}: Props): React.ReactNode {
  const options = [
    {
      label: 'Merge current memory with the snapshot',
      value: 'merge',
    },
    {
      label: 'Replace current memory with the snapshot',
      value: 'replace',
    },
    {
      label: 'Keep current memory',
      value: 'keep',
    },
  ] as const

  return (
    <Dialog title="Agent Memory Update" onCancel={onCancel} color="warning">
      <Box flexDirection="column" gap={1}>
        <Text>
          A newer snapshot is available for <Text bold>{agentType}</Text>{' '}
          ({formatScope(scope)} memory).
        </Text>
        <Text dimColor>Snapshot timestamp: {snapshotTimestamp}</Text>
        <Text dimColor>{buildMergePrompt(agentType, scope)}</Text>
        <Select
          options={options}
          onChange={value => onComplete(value as 'merge' | 'keep' | 'replace')}
        />
      </Box>
    </Dialog>
  )
}
