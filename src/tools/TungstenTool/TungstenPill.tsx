// Copyright 2026 Noumena, Inc. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod/v4'
import { Box, Text } from '../../ink.js'
import { useAppState } from '../../state/AppState.js'
import type { ThemeName } from '../../utils/theme.js'

type Props = {
  selected: boolean
}

export function TungstenPill({ selected }: Props) {
  const session = useAppState(s => s.tungstenActiveSession)
  const label = session?.sessionName ?? 'tmux'

  return (
    <Text
      color="background"
      inverse={selected}
      key={selected ? 'selected' : 'normal'}
    >
      {label}
    </Text>
  )
}

export function renderToolUseMessage() {
  return (
    <Box>
      <Text dimColor>Tungsten session active</Text>
    </Box>
  )
}
