import React from 'react'
import type { DeepImmutable } from 'src/types/utils.js'
import { useElapsedTime } from '../../hooks/useElapsedTime.js'
import type { KeyboardEvent } from '../../ink/events/keyboard-event.js'
import { Box, Text } from '../../ink.js'
import { useKeybindings } from '../../keybindings/useKeybinding.js'
import type { LocalWorkflowTaskState } from '../../tasks/LocalWorkflowTask/LocalWorkflowTask.js'
import type { CommandResultDisplay } from '../../commands.js'
import { plural } from '../../utils/stringUtils.js'
import { Byline } from '../design-system/Byline.js'
import { Dialog } from '../design-system/Dialog.js'
import { KeyboardShortcutHint } from '../design-system/KeyboardShortcutHint.js'
import { getTaskStatusColor, getTaskStatusIcon } from './taskStatusUtils.js'

type Props = {
  workflow: DeepImmutable<LocalWorkflowTaskState>
  onDone: (result?: string, options?: { display?: CommandResultDisplay }) => void
  onKill?: () => void
  onSkipAgent?: (agentId: string) => void
  onRetryAgent?: (agentId: string) => void
  onBack: () => void
}

function buildSubtitle(workflow: DeepImmutable<LocalWorkflowTaskState>): string {
  const parts = [`${workflow.completedCount}/${workflow.agentCount} completed`]

  if (workflow.failedCount > 0) {
    parts.push(`${workflow.failedCount} failed`)
  }
  if (workflow.killedCount > 0) {
    parts.push(`${workflow.killedCount} stopped`)
  }

  return parts.join(' · ')
}

export function WorkflowDetailDialog({
  workflow,
  onDone,
  onKill,
  onBack,
}: Props): React.ReactNode {
  const elapsedTime = useElapsedTime(
    workflow.startTime,
    workflow.status === 'running',
    1000,
    0,
  )

  useKeybindings({ 'confirm:yes': onDone }, { context: 'Confirmation' })

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === ' ') {
      e.preventDefault()
      onDone('Workflow details dismissed', { display: 'system' })
      return
    }

    if (e.key === 'left') {
      e.preventDefault()
      onBack()
      return
    }

    if (e.key === 'x' && workflow.status === 'running' && onKill) {
      e.preventDefault()
      onKill()
    }
  }

  const title = <Text>{workflow.workflowName}</Text>
  const subtitle = (
    <Text dimColor>
      {elapsedTime} · {buildSubtitle(workflow)}
    </Text>
  )

  const inputGuide = (exitState: { pending: boolean; keyName: string }) =>
    exitState.pending ? (
      <Text>Press {exitState.keyName} again to exit</Text>
    ) : (
      <Byline>
        <KeyboardShortcutHint shortcut="←" action="go back" />
        <KeyboardShortcutHint shortcut="Esc/Enter/Space" action="close" />
        {workflow.status === 'running' && onKill && (
          <KeyboardShortcutHint shortcut="x" action="stop" />
        )}
      </Byline>
    )

  return (
    <Box flexDirection="column" tabIndex={0} autoFocus onKeyDown={handleKeyDown}>
      <Dialog
        title={title}
        subtitle={subtitle}
        onCancel={() => onDone('Workflow details dismissed', { display: 'system' })}
        color="background"
        inputGuide={inputGuide}
      >
        <Box flexDirection="column" gap={1}>
          <Box flexDirection="column">
            <Text bold>Objective</Text>
            <Text wrap="wrap">{workflow.objective}</Text>
          </Box>

          <Box flexDirection="column">
            <Text bold>Status</Text>
            <Text>
              <Text color={getTaskStatusColor(workflow.status)}>
                {getTaskStatusIcon(workflow.status)} {workflow.status}
              </Text>
              <Text dimColor>
                {' '}
                · {workflow.executionMode} · {workflow.agentCount}{' '}
                {plural(workflow.agentCount, 'agent')}
              </Text>
            </Text>
            {workflow.error && (
              <Text color="error" wrap="wrap">
                {workflow.error}
              </Text>
            )}
          </Box>

          <Box flexDirection="column">
            <Text bold>Agents</Text>
            {workflow.agents.map(agent => (
              <Box key={agent.id} flexDirection="column" marginBottom={1}>
                <Text>
                  <Text color={getTaskStatusColor(agent.status)}>
                    {getTaskStatusIcon(agent.status)} {agent.name}
                  </Text>
                  <Text dimColor> · {agent.agentType}</Text>
                  {agent.model && <Text dimColor> · {agent.model}</Text>}
                </Text>
                <Text dimColor wrap="wrap">
                  {agent.description}
                </Text>
                {agent.summary && (
                  <Text wrap="wrap">
                    <Text bold>Summary:</Text> {agent.summary}
                  </Text>
                )}
                {agent.error && (
                  <Text color="error" wrap="wrap">
                    {agent.error}
                  </Text>
                )}
                {(agent.tokenCount > 0 || agent.toolUseCount > 0) && (
                  <Text dimColor>
                    {agent.tokenCount > 0 && `${agent.tokenCount} tokens`}
                    {agent.tokenCount > 0 && agent.toolUseCount > 0 && ' · '}
                    {agent.toolUseCount > 0 &&
                      `${agent.toolUseCount} ${plural(agent.toolUseCount, 'tool')}`}
                  </Text>
                )}
              </Box>
            ))}
          </Box>
        </Box>
      </Dialog>
    </Box>
  )
}
