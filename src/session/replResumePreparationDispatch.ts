import type { UUID } from 'crypto'

import type { ResumeEntrypoint } from '../types/command.js'
import type { LogOption } from '../types/logs.js'
import type { Message } from '../types/message.js'
import type { SetAppState } from '../utils/messageQueueManager.js'

export type ReplResumePreparationDispatchDeps = {
  sessionId: UUID
  log: LogOption
  entrypoint: ResumeEntrypoint
  messages: Message[]
  getSessionEndHookTimeoutMs: () => number
  createTimeoutSignal: (timeoutMs: number) => AbortSignal
  getAppState: () => unknown
  setAppState: SetAppState
  executeSessionEndHooks: (
    source: 'resume',
    params: {
      getAppState: () => unknown
      setAppState: SetAppState
      signal: AbortSignal
      timeoutMs: number
    },
  ) => Promise<void>
  processSessionStartHooks: (
    source: 'resume',
    params: {
      sessionId: UUID
      agentType: string | undefined
      model: unknown
    },
  ) => Promise<Message[]>
  agentType: string | undefined
  model: unknown
  copyPlanForFork: (log: LogOption, sessionId: UUID) => void
  copyPlanForResume: (log: LogOption, sessionId: UUID) => void
  restoreSessionStateFromLog: (log: LogOption, setAppState: SetAppState) => void
  copyFileHistoryForResume: (log: LogOption) => void
  restoreAgentFromSession: (
    agentSetting: string | undefined,
  ) => { agentDefinition: { agentType?: string } | undefined }
  setMainThreadAgentDefinition: (
    agentDefinition: { agentType?: string } | undefined,
  ) => void
  computeStandaloneAgentContext: (
    agentName: string | undefined,
    agentColor: string | undefined,
  ) => unknown
  updateSessionName: (agentName: string | undefined) => void
  restoreReadFileState: (messages: Message[], projectPath: string) => void
  projectPath: string
  resetLoadingState: () => void
  clearAbortController: () => void
  setConversationId: (sessionId: UUID) => void
}

export async function dispatchReplResumePreparation({
  sessionId,
  log,
  entrypoint,
  messages,
  getSessionEndHookTimeoutMs,
  createTimeoutSignal,
  getAppState,
  setAppState,
  executeSessionEndHooks,
  processSessionStartHooks,
  agentType,
  model,
  copyPlanForFork,
  copyPlanForResume,
  restoreSessionStateFromLog,
  copyFileHistoryForResume,
  restoreAgentFromSession,
  setMainThreadAgentDefinition,
  computeStandaloneAgentContext,
  updateSessionName,
  restoreReadFileState,
  projectPath,
  resetLoadingState,
  clearAbortController,
  setConversationId,
}: ReplResumePreparationDispatchDeps): Promise<void> {
  const sessionEndTimeoutMs = getSessionEndHookTimeoutMs()
  await executeSessionEndHooks('resume', {
    getAppState,
    setAppState,
    signal: createTimeoutSignal(sessionEndTimeoutMs),
    timeoutMs: sessionEndTimeoutMs,
  })

  const hookMessages = await processSessionStartHooks('resume', {
    sessionId,
    agentType,
    model,
  })
  messages.push(...hookMessages)

  if (entrypoint === 'fork') {
    copyPlanForFork(log, sessionId)
  } else {
    copyPlanForResume(log, sessionId)
  }

  restoreSessionStateFromLog(log, setAppState)
  if (log.fileHistorySnapshots) {
    copyFileHistoryForResume(log)
  }

  const { agentDefinition: restoredAgent } = restoreAgentFromSession(log.agentSetting)
  setMainThreadAgentDefinition(restoredAgent)
  setAppState(prev => ({
    ...prev,
    agent: restoredAgent?.agentType,
  }))
  setAppState(prev => ({
    ...prev,
    standaloneAgentContext: computeStandaloneAgentContext(
      log.agentName,
      log.agentColor,
    ),
  }))
  updateSessionName(log.agentName)

  restoreReadFileState(messages, log.projectPath ?? projectPath)
  resetLoadingState()
  clearAbortController()
  setConversationId(sessionId)
}
