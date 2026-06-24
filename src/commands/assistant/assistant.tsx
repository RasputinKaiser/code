import { join } from 'path'
import * as React from 'react'
import { useEffect, useState } from 'react'
import { resolveManagedRemoteRuntimeAuth } from '../../auth/capabilities/remote.js'
import { setIsRemoteMode, setKairosActive, setUserMsgOptIn } from '../../bootstrap/state.js'
import { AssistantSessionChooser } from '../../assistant/AssistantSessionChooser.js'
import {
  type AssistantSession,
  discoverAssistantSessions,
} from '../../assistant/sessionDiscovery.js'
import { Select } from '../../components/CustomSelect/index.js'
import { Dialog } from '../../components/design-system/Dialog.js'
import { Box, Text } from '../../ink.js'
import { createRemoteSessionConfig } from '../../remote/RemoteSessionManager.js'
import type { AppState } from '../../state/AppState.js'
import type {
  LocalJSXCommandCall,
  LocalJSXCommandContext,
  LocalJSXCommandOnDone,
} from '../../types/command.js'
import { getClaudeConfigHomeDir } from '../../utils/envUtils.js'
import { errorMessage } from '../../utils/errors.js'
import { createSystemMessage } from '../../utils/messages.js'

type NewInstallWizardProps = {
  defaultDir: string
  onInstalled: (dir: string) => void
  onCancel: () => void
  onError: (message: string) => void
}

type AssistantFlowState =
  | { kind: 'loading' }
  | { kind: 'install'; defaultDir: string }
  | { kind: 'choose'; sessions: AssistantSession[] }
  | { kind: 'attaching'; sessionId: string }
  | { kind: 'error'; message: string }

type AssistantFlowProps = {
  context: LocalJSXCommandContext
  onDone: LocalJSXCommandOnDone
}

export async function computeDefaultInstallDir(): Promise<string> {
  return join(getClaudeConfigHomeDir(), 'assistant')
}

export function buildAssistantViewerState(prev: AppState): AppState {
  return {
    ...prev,
    expandedView: 'none',
    isBriefOnly: true,
    selectedIPAgentIndex: -1,
    coordinatorTaskIndex: -1,
    viewSelectionMode: 'none',
    footerSelection: null,
    kairosEnabled: false,
    remoteSessionUrl: undefined,
    remoteConnectionStatus: 'connecting',
    remoteBackgroundTaskCount: 0,
    replBridgeEnabled: false,
    replBridgeExplicit: false,
    replBridgeOutboundOnly: false,
    replBridgeConnected: false,
    replBridgeSessionActive: false,
    replBridgeReconnecting: false,
    replBridgeConnectUrl: undefined,
    replBridgeSessionUrl: undefined,
    replBridgeEnvironmentId: undefined,
    replBridgeSessionId: undefined,
    replBridgeError: undefined,
    replBridgeInitialName: undefined,
    showRemoteCallout: false,
    tasks: {},
    agentNameRegistry: new Map(),
    foregroundedTaskId: undefined,
    viewingAgentTaskId: undefined,
    companionReaction: undefined,
  }
}

export async function attachToAssistantSession(
  sessionId: string,
  context: Pick<
    LocalJSXCommandContext,
    'setAppState' | 'setMessages' | 'setRemoteSessionConfig'
  >,
): Promise<void> {
  if (!context.setRemoteSessionConfig) {
    throw new Error('Assistant attach is not available in this environment.')
  }

  const runtimeAuth = await resolveManagedRemoteRuntimeAuth()
  const getAccessToken = (): string => {
    const accessToken = runtimeAuth.getAccessToken()
    if (!accessToken) {
      throw new Error('Managed remote authentication is unavailable.')
    }
    return accessToken
  }

  setKairosActive(true)
  setUserMsgOptIn(true)
  setIsRemoteMode(true)

  context.setRemoteSessionConfig(
    createRemoteSessionConfig(
      sessionId,
      getAccessToken,
      runtimeAuth.orgUUID,
      false,
      true,
    ),
  )
  context.setAppState(prev => buildAssistantViewerState(prev))
  context.setMessages(() => [
    createSystemMessage(
      `Attached to assistant session ${sessionId.slice(0, 8)}…`,
      'info',
    ),
  ])
}

export function NewInstallWizard({
  defaultDir,
  onCancel,
}: NewInstallWizardProps): React.ReactNode {
  return (
    <Dialog title="Assistant Install" onCancel={onCancel} color="warning">
      <Box flexDirection="column" gap={1}>
        <Text>
          No running assistant sessions were found, and the assistant
          installation workflow is not yet recovered in this source build.
        </Text>
        <Text dimColor>Expected default install directory: {defaultDir}</Text>
        <Select
          options={[{ label: 'Cancel', value: 'cancel' }]}
          onChange={() => onCancel()}
        />
      </Box>
    </Dialog>
  )
}

function LoadingDialog({
  title,
  message,
  onCancel,
}: {
  title: string
  message: string
  onCancel: () => void
}): React.ReactNode {
  return (
    <Dialog title={title} onCancel={onCancel} color="background">
      <Box flexDirection="column" gap={1}>
        <Text>{message}</Text>
      </Box>
    </Dialog>
  )
}

function ErrorDialog({
  message,
  onRetry,
  onCancel,
}: {
  message: string
  onRetry: () => void
  onCancel: () => void
}): React.ReactNode {
  return (
    <Dialog title="Assistant" onCancel={onCancel} color="warning">
      <Box flexDirection="column" gap={1}>
        <Text color="warning">{message}</Text>
        <Select
          options={[
            { label: 'Retry', value: 'retry' },
            { label: 'Cancel', value: 'cancel' },
          ]}
          onChange={value => {
            if (value === 'retry') {
              onRetry()
              return
            }
            onCancel()
          }}
        />
      </Box>
    </Dialog>
  )
}

function AssistantFlow({
  context,
  onDone,
}: AssistantFlowProps): React.ReactNode {
  const [state, setState] = useState<AssistantFlowState>({ kind: 'loading' })
  const [discoveryNonce, setDiscoveryNonce] = useState(0)

  useEffect(() => {
    let cancelled = false

    void (async () => {
      setState({ kind: 'loading' })
      try {
        const sessions = await discoverAssistantSessions()
        if (cancelled) return

        if (sessions.length === 0) {
          const defaultDir = await computeDefaultInstallDir()
          if (cancelled) return
          setState({ kind: 'install', defaultDir })
          return
        }

        if (sessions.length === 1) {
          setState({ kind: 'attaching', sessionId: sessions[0]!.id })
          return
        }

        setState({ kind: 'choose', sessions })
      } catch (error) {
        if (cancelled) return
        setState({
          kind: 'error',
          message: `Assistant discovery failed: ${errorMessage(error)}`,
        })
      }
    })()

    return () => {
      cancelled = true
    }
  }, [discoveryNonce])

  useEffect(() => {
    if (state.kind !== 'attaching') return

    let cancelled = false
    void (async () => {
      try {
        await attachToAssistantSession(state.sessionId, context)
        if (cancelled) return
        onDone(undefined, { display: 'skip' })
      } catch (error) {
        if (cancelled) return
        setState({
          kind: 'error',
          message: `Assistant attach failed: ${errorMessage(error)}`,
        })
      }
    })()

    return () => {
      cancelled = true
    }
  }, [context, onDone, state])

  switch (state.kind) {
    case 'loading':
      return (
        <LoadingDialog
          title="Assistant"
          message="Discovering assistant sessions…"
          onCancel={() =>
            onDone('Assistant dismissed', { display: 'system' })
          }
        />
      )
    case 'install':
      return (
        <NewInstallWizard
          defaultDir={state.defaultDir}
          onInstalled={dir =>
            onDone(`Assistant installed in ${dir}`, { display: 'system' })
          }
          onCancel={() =>
            onDone('Assistant install dismissed', { display: 'system' })
          }
          onError={message =>
            onDone(`Assistant installation failed: ${message}`, {
              display: 'system',
            })
          }
        />
      )
    case 'choose':
      return (
        <AssistantSessionChooser
          sessions={state.sessions}
          onSelect={sessionId => setState({ kind: 'attaching', sessionId })}
          onCancel={() =>
            onDone('Assistant attach cancelled', { display: 'system' })
          }
        />
      )
    case 'attaching':
      return (
        <LoadingDialog
          title="Assistant"
          message={`Attaching to assistant session ${state.sessionId.slice(0, 8)}…`}
          onCancel={() =>
            onDone('Assistant attach cancelled', { display: 'system' })
          }
        />
      )
    case 'error':
      return (
        <ErrorDialog
          message={state.message}
          onRetry={() => setDiscoveryNonce(prev => prev + 1)}
          onCancel={() =>
            onDone('Assistant dismissed', { display: 'system' })
          }
        />
      )
  }
}

export const call: LocalJSXCommandCall = async (onDone, context) => {
  return <AssistantFlow onDone={onDone} context={context} />
}
