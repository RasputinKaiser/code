import React, { useCallback, useEffect, useRef } from 'react'
import { Box, Text } from '../ink.js'
import { saveGlobalConfig } from '../utils/config.js'
import type { OptionWithDescription } from './CustomSelect/select.js'
import { Select } from './CustomSelect/select.js'
import { PermissionDialog } from './permissions/PermissionDialog.js'

type UndercoverAutoCalloutSelection = 'dismiss'

type UndercoverAutoCalloutProps = {
  onDone: () => void
}

export function UndercoverAutoCallout({
  onDone,
}: UndercoverAutoCalloutProps): React.ReactNode {
  const onDoneRef = useRef(onDone)
  onDoneRef.current = onDone

  // Mark this one-time explainer as seen as soon as it mounts.
  useEffect(() => {
    saveGlobalConfig(current => {
      if (current.hasSeenUndercoverAutoNotice) return current
      return {
        ...current,
        hasSeenUndercoverAutoNotice: true,
      }
    })
  }, [])

  const handleSelect = useCallback(
    (_value: UndercoverAutoCalloutSelection): void => {
      onDoneRef.current()
    },
    [],
  )

  const handleCancel = useCallback((): void => {
    onDoneRef.current()
  }, [])

  const options: OptionWithDescription<UndercoverAutoCalloutSelection>[] = [
    {
      label: 'Continue',
      description: 'Keep working with undercover protections enabled.',
      value: 'dismiss',
    },
  ]

  return (
    <PermissionDialog title="Undercover Mode Enabled">
      <Box flexDirection="column" paddingX={2} paddingY={1}>
        <Box marginBottom={1} flexDirection="column">
          <Text>
            Code automatically enabled undercover mode for this
            repository.
          </Text>
          <Text> </Text>
          <Text>
            While active, prompts and outputs are constrained for external-safe
            handling. The footer will show an undercover indicator.
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
