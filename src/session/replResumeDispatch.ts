import type { UUID } from 'crypto'

import { dispatchReplResumeOrchestration } from './replResumeOrchestrationDispatch.js'
import type { Message } from '../types/message.js'
import type { ResumeEntrypoint } from '../types/command.js'
import type { LogOption } from '../types/logs.js'

export type DispatchReplResumeOptions = {
  sessionId: UUID
  log: LogOption
  entrypoint: ResumeEntrypoint
}

export type DispatchReplResumeDeps = {
  nowMs: () => number
  deserializeMessages: (messages: LogOption['messages']) => Message[]
  coordinatorModeEnabled: boolean
  getCoordinatorWarning: (mode: LogOption['mode']) => string | undefined
  refreshAgentDefinitionsForModeChange: () => Promise<void>
  createWarningMessage: (warning: string) => Message
  runPreparation: (messages: Message[]) => Promise<void>
  runSessionSwitch: () => Promise<void>
  runFinalize: (messages: Message[]) => void | Promise<void>
  logResumeEvent: Parameters<
    typeof dispatchReplResumeOrchestration
  >[1]['logResumeEvent']
}

export async function dispatchReplResume(
  options: DispatchReplResumeOptions,
  deps: DispatchReplResumeDeps,
): Promise<void> {
  const messages = deps.deserializeMessages(options.log.messages)

  if (deps.coordinatorModeEnabled) {
    const warning = deps.getCoordinatorWarning(options.log.mode)
    if (warning) {
      await deps.refreshAgentDefinitionsForModeChange()
      messages.push(deps.createWarningMessage(warning))
    }
  }

  await dispatchReplResumeOrchestration(
    {
      entrypoint: options.entrypoint,
    },
    {
      nowMs: deps.nowMs,
      runPreparation: () => deps.runPreparation(messages),
      runSessionSwitch: deps.runSessionSwitch,
      runFinalize: () => deps.runFinalize(messages),
      logResumeEvent: deps.logResumeEvent,
    },
  )
}
