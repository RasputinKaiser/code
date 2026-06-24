import type { AgentDefinition } from '../tools/AgentTool/loadAgentsDir.js'
import type { Message } from '../types/message.js'
import type { QueuedCommand } from '../types/textInputTypes.js'
import type { SetAppState } from '../utils/messageQueueManager.js'
import type { QuerySource } from '../constants/querySource.js'
import type { CanUseToolFn } from '../hooks/useCanUseTool.js'
import type { ProcessUserInputContext } from '../utils/processUserInput/processUserInput.js'
import { buildReplPromptContext } from './replPromptContextBuilder.js'

export type ReplBackgroundQueryDispatchDeps = {
  abortForegroundQuery: () => void
  removeTaskNotifications: () => QueuedCommand[]
  buildToolUseContext: () => ProcessUserInputContext
  buildRenderedSystemPrompt: (
    toolUseContext: ProcessUserInputContext,
  ) => Promise<string>
  getUserContext: () => Promise<Record<string, string>>
  getSystemContext: () => Promise<Record<string, string>>
  getNotificationMessages: (
    removedNotifications: QueuedCommand[],
  ) => Promise<Message[]>
  getCurrentMessages: () => Message[]
  startBackgroundSession: (params: {
    messages: Message[]
    queryParams: {
      systemPrompt: string
      userContext: Record<string, string>
      systemContext: Record<string, string>
      canUseTool: CanUseToolFn | undefined
      toolUseContext: ProcessUserInputContext
      querySource: QuerySource
    }
    description: string
    setAppState: SetAppState
    agentDefinition?: AgentDefinition
  }) => void
  canUseTool: CanUseToolFn | undefined
  querySource: QuerySource
  description: string
  setAppState: SetAppState
  agentDefinition?: AgentDefinition
}

export async function dispatchReplBackgroundQuery({
  abortForegroundQuery,
  removeTaskNotifications,
  buildToolUseContext,
  buildRenderedSystemPrompt,
  getUserContext,
  getSystemContext,
  getNotificationMessages,
  getCurrentMessages,
  startBackgroundSession,
  canUseTool,
  querySource,
  description,
  setAppState,
  agentDefinition,
}: ReplBackgroundQueryDispatchDeps): Promise<void> {
  abortForegroundQuery()

  const removedNotifications = removeTaskNotifications()
  const toolUseContext = buildToolUseContext()
  const { systemPrompt, userContext, systemContext } =
    await buildReplPromptContext(toolUseContext, {
      buildRenderedSystemPrompt,
      getUserContext,
      getSystemContext,
      setRenderedPromptOnContext: true,
    })

  const notificationMessages = await getNotificationMessages(
    removedNotifications,
  ).catch(() => [])

  const currentMessages = getCurrentMessages()
  const existingPrompts = new Set<string>()
  for (const message of currentMessages) {
    if (
      message.type === 'attachment' &&
      message.attachment.type === 'queued_command' &&
      message.attachment.commandMode === 'task-notification' &&
      typeof message.attachment.prompt === 'string'
    ) {
      existingPrompts.add(message.attachment.prompt)
    }
  }

  const uniqueNotifications = notificationMessages.filter(
    message =>
      !(
        message.type === 'attachment' &&
        message.attachment.type === 'queued_command' &&
        typeof message.attachment.prompt === 'string' &&
        existingPrompts.has(message.attachment.prompt)
      ),
  )

  startBackgroundSession({
    messages: [...currentMessages, ...uniqueNotifications],
    queryParams: {
      systemPrompt,
      userContext,
      systemContext,
      canUseTool,
      toolUseContext,
      querySource,
    },
    description,
    setAppState,
    agentDefinition,
  })
}
