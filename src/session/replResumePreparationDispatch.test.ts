import { describe, expect, test } from 'bun:test'

import type { UUID } from 'crypto'

import type { Message } from '../types/message.js'
import { dispatchReplResumePreparation } from './replResumePreparationDispatch.js'

function createMessage(uuid: string): Message {
  return {
    type: 'assistant',
    uuid,
    message: {
      id: `assistant-${uuid}`,
      content: [],
    },
  } as Message
}

describe('dispatchReplResumePreparation', () => {
  test('preserves resume hook, plan-copy, state-restore, and loading-reset ordering', async () => {
    const events: string[] = []
    const messages = [createMessage('existing')]
    const hookMessage = createMessage('hook')

    await dispatchReplResumePreparation({
      sessionId: 'resume-session' as UUID,
      log: {
        agentSetting: 'builder',
        agentName: 'Ada',
        agentColor: 'blue',
        projectPath: '/tmp/log-project',
        fileHistorySnapshots: [{ uuid: 'snapshot' } as any],
      } as any,
      entrypoint: 'cli_flag',
      messages,
      getSessionEndHookTimeoutMs: () => {
        events.push('get-session-end-timeout')
        return 500
      },
      createTimeoutSignal: timeoutMs => {
        events.push(`create-timeout-signal:${timeoutMs}`)
        return AbortSignal.timeout(timeoutMs)
      },
      getAppState: () => {
        events.push('get-app-state')
        return {}
      },
      setAppState: updater => {
        events.push('set-app-state')
        updater({} as any)
        return updater as any
      },
      executeSessionEndHooks: async (_source, { timeoutMs }) => {
        events.push(`execute-session-end-hooks:${timeoutMs}`)
      },
      processSessionStartHooks: async (_source, { sessionId, agentType }) => {
        events.push(`process-session-start-hooks:${sessionId}:${agentType}`)
        return [hookMessage]
      },
      agentType: 'coder',
      model: 'model-x',
      copyPlanForFork: () => {
        events.push('copy-plan-for-fork')
      },
      copyPlanForResume: () => {
        events.push('copy-plan-for-resume')
      },
      restoreSessionStateFromLog: () => {
        events.push('restore-session-state-from-log')
      },
      copyFileHistoryForResume: () => {
        events.push('copy-file-history-for-resume')
      },
      restoreAgentFromSession: agentSetting => {
        events.push(`restore-agent-from-session:${agentSetting}`)
        return {
          agentDefinition: {
            agentType: 'builder',
          },
        }
      },
      setMainThreadAgentDefinition: agentDefinition => {
        events.push(`set-main-thread-agent:${agentDefinition?.agentType}`)
      },
      computeStandaloneAgentContext: (agentName, agentColor) => {
        events.push(`compute-standalone-agent-context:${agentName}:${agentColor}`)
        return {
          agentName,
          agentColor,
        }
      },
      updateSessionName: agentName => {
        events.push(`update-session-name:${agentName}`)
      },
      restoreReadFileState: (restoredMessages, projectPath) => {
        events.push(`restore-read-file-state:${restoredMessages.length}:${projectPath}`)
      },
      projectPath: '/tmp/original-project',
      resetLoadingState: () => {
        events.push('reset-loading-state')
      },
      clearAbortController: () => {
        events.push('clear-abort-controller')
      },
      setConversationId: sessionId => {
        events.push(`set-conversation-id:${sessionId}`)
      },
    })

    expect(events).toEqual([
      'get-session-end-timeout',
      'create-timeout-signal:500',
      'execute-session-end-hooks:500',
      'process-session-start-hooks:resume-session:coder',
      'copy-plan-for-resume',
      'restore-session-state-from-log',
      'copy-file-history-for-resume',
      'restore-agent-from-session:builder',
      'set-main-thread-agent:builder',
      'set-app-state',
      'set-app-state',
      'compute-standalone-agent-context:Ada:blue',
      'update-session-name:Ada',
      'restore-read-file-state:2:/tmp/log-project',
      'reset-loading-state',
      'clear-abort-controller',
      'set-conversation-id:resume-session',
    ])
    expect(messages).toEqual([createMessage('existing'), hookMessage])
  })

  test('fork resume copies the fork plan and skips file-history copy when no snapshots exist', async () => {
    const events: string[] = []
    const messages = [createMessage('existing')]

    await dispatchReplResumePreparation({
      sessionId: 'fork-session' as UUID,
      log: {
        projectPath: undefined,
      } as any,
      entrypoint: 'fork',
      messages,
      getSessionEndHookTimeoutMs: () => 1,
      createTimeoutSignal: timeoutMs => AbortSignal.timeout(timeoutMs),
      getAppState: () => ({}),
      setAppState: updater => {
        updater({} as any)
        return updater as any
      },
      executeSessionEndHooks: async () => {
        events.push('execute-session-end-hooks')
      },
      processSessionStartHooks: async () => [],
      agentType: undefined,
      model: 'model-x',
      copyPlanForFork: () => {
        events.push('copy-plan-for-fork')
      },
      copyPlanForResume: () => {
        events.push('copy-plan-for-resume')
      },
      restoreSessionStateFromLog: () => {
        events.push('restore-session-state-from-log')
      },
      copyFileHistoryForResume: () => {
        events.push('copy-file-history-for-resume')
      },
      restoreAgentFromSession: () => ({
        agentDefinition: undefined,
      }),
      setMainThreadAgentDefinition: () => {
        events.push('set-main-thread-agent')
      },
      computeStandaloneAgentContext: () => null,
      updateSessionName: () => {
        events.push('update-session-name')
      },
      restoreReadFileState: (_restoredMessages, projectPath) => {
        events.push(`restore-read-file-state:${projectPath}`)
      },
      projectPath: '/tmp/original-project',
      resetLoadingState: () => {
        events.push('reset-loading-state')
      },
      clearAbortController: () => {
        events.push('clear-abort-controller')
      },
      setConversationId: () => {
        events.push('set-conversation-id')
      },
    })

    expect(events).toEqual([
      'execute-session-end-hooks',
      'copy-plan-for-fork',
      'restore-session-state-from-log',
      'set-main-thread-agent',
      'update-session-name',
      'restore-read-file-state:/tmp/original-project',
      'reset-loading-state',
      'clear-abort-controller',
      'set-conversation-id',
    ])
  })
})
