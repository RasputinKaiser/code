import type { Command, LocalCommandCall } from '../types/command.js'
import { isNoumenaMode } from '../utils/noumenaMode.js'

type UnrecoveredCommandOptions = {
  name: string
  description: string
  argumentHint?: string
  supportsNonInteractive?: boolean
}

function buildUnrecoveredCall(name: string): LocalCommandCall {
  return async () => ({
    type: 'text',
    value: `/${name} is not yet reconstructed in this source build.`,
  })
}

export function createUnrecoveredLocalCommand({
  name,
  description,
  argumentHint,
  supportsNonInteractive = true,
}: UnrecoveredCommandOptions): Command {
  return {
    type: 'local',
    name,
    description,
    argumentHint,
    isHidden: !isNoumenaMode(),
    isEnabled: () => isNoumenaMode(),
    supportsNonInteractive,
    load: () => Promise.resolve({ call: buildUnrecoveredCall(name) }),
  } satisfies Command
}
