import React, { useCallback, useEffect, useRef } from 'react'
import { isBridgeEnabled } from '../bridge/bridgeEnabled.js'
import { getAuthRuntime } from '../auth/runtime/AuthRuntime.js'
import type { ResolvedAuthSession } from '../auth/runtime/types.js'
import { Box, Text } from '../ink.js'
import { getGlobalConfig, saveGlobalConfig } from '../utils/config.js'
import type { OptionWithDescription } from './CustomSelect/select.js'
import { Select } from './CustomSelect/select.js'
import { PermissionDialog } from './permissions/PermissionDialog.js'

type RemoteCalloutSelection = 'enable' | 'dismiss'
type Props = {
  onDone: (selection: RemoteCalloutSelection) => void
}

type RemoteCalloutSession =
  | Pick<
      ResolvedAuthSession,
      'principalSource' | 'sessionState' | 'accessToken' | 'scopes'
    >
  | null
  | undefined

export function RemoteCallout({ onDone }: Props): React.ReactNode {
  const onDoneRef = useRef(onDone)
  onDoneRef.current = onDone

  const handleCancel = useCallback((): void => {
    onDoneRef.current('dismiss')
  }, [])

  // Permanently mark as seen on mount so it only shows once.
  useEffect(() => {
    saveGlobalConfig(current => {
      if (current.remoteDialogSeen) return current
      return {
        ...current,
        remoteDialogSeen: true,
      }
    })
  }, [])

  const handleSelect = useCallback((value: RemoteCalloutSelection): void => {
    onDoneRef.current(value)
  }, [])

  const options: OptionWithDescription<RemoteCalloutSelection>[] = [
    {
      label: 'Enable Remote Control for this session',
      description:
        'Opens a secure connection to the Noumena remote session service.',
      value: 'enable',
    },
    {
      label: 'Never mind',
      description: 'You can always enable it later with /remote-control.',
      value: 'dismiss',
    },
  ]

  return (
    <PermissionDialog title="Remote Control">
      <Box flexDirection="column" paddingX={2} paddingY={1}>
        <Box marginBottom={1} flexDirection="column">
          <Text>
            Remote Control lets you access this CLI session from the web app or
            desktop app, so you can pick up where you left off on any device.
          </Text>
          <Text> </Text>
          <Text>
            You can disconnect remote access anytime by running /remote-control
            again.
          </Text>
        </Box>
        <Box>
          <Select
            options={options}
            onChange={handleSelect}
            onCancel={handleCancel}
          />
        </Box>
      </Box>
    </PermissionDialog>
  )
}

/**
 * Check whether to show the remote callout (first-time dialog).
 */
export function shouldShowRemoteCallout(): boolean {
  const config = getGlobalConfig()
  return shouldShowRemoteCalloutForState({
    remoteDialogSeen: Boolean(config.remoteDialogSeen),
    bridgeEnabled: isBridgeEnabled(),
    session: getAuthRuntime().getCurrentSession(),
  })
}

export function shouldShowRemoteCalloutForState(params: {
  remoteDialogSeen: boolean
  bridgeEnabled: boolean
  session: RemoteCalloutSession
}): boolean {
  if (params.remoteDialogSeen) return false
  if (!params.bridgeEnabled) return false
  return hasRemoteCalloutSession(params.session)
}

export function hasRemoteCalloutSession(
  session: RemoteCalloutSession,
): boolean {
  return (
    session?.principalSource === 'managed_oauth' &&
    session.sessionState === 'usable' &&
    session.scopes.includes('user:inference') &&
    Boolean(session.accessToken)
  )
}
