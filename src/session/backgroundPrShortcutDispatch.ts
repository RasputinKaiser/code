import type { Message } from '../types/message.js'
import type { ProcessUserInputContext } from '../utils/processUserInput/processUserInput.js'
import { errorMessage } from '../utils/errors.js'
import { createSystemMessage, createUserMessage } from '../utils/messages.js'
import { launchSuggestBackgroundPRTask } from '../tools/SuggestBackgroundPRTool/SuggestBackgroundPRTool.js'

export type BackgroundPrShortcutDispatchOptions = {
  input: string
  prompt: string
  mainLoopModel: string
}

export type BackgroundPrShortcutDispatchDeps = {
  addNotification: (options: {
    key: string
    text: string
    priority: 'immediate'
    timeoutMs: number
  }) => void
  createAbortController: () => AbortController
  getMessages: () => Message[]
  getToolUseContext: (
    messages: Message[],
    newMessages: Message[],
    abortController: AbortController,
    mainLoopModel: string,
  ) => ProcessUserInputContext
  setMessages: (updater: (prev: Message[]) => Message[]) => void
  launchSuggestBackgroundPRTaskImpl?: typeof launchSuggestBackgroundPRTask
  createUserMessageImpl?: typeof createUserMessage
  createSystemMessageImpl?: typeof createSystemMessage
  errorMessageImpl?: typeof errorMessage
}

export function getBackgroundPrDescription(prompt: string): string {
  const firstNonEmptyLine =
    prompt
      .split('\n')
      .map(line => line.trim())
      .find(line => line.length > 0) ?? 'Background PR task'
  const maxChars = 96
  if (firstNonEmptyLine.length <= maxChars) {
    return firstNonEmptyLine
  }
  return `${firstNonEmptyLine.slice(0, maxChars - 1)}…`
}

export async function dispatchBackgroundPrShortcut(
  { input, prompt, mainLoopModel }: BackgroundPrShortcutDispatchOptions,
  {
    addNotification,
    createAbortController,
    getMessages,
    getToolUseContext,
    setMessages,
    launchSuggestBackgroundPRTaskImpl = launchSuggestBackgroundPRTask,
    createUserMessageImpl = createUserMessage,
    createSystemMessageImpl = createSystemMessage,
    errorMessageImpl = errorMessage,
  }: BackgroundPrShortcutDispatchDeps,
): Promise<void> {
  try {
    const context = getToolUseContext(
      getMessages(),
      [],
      createAbortController(),
      mainLoopModel,
    )
    const launched = await launchSuggestBackgroundPRTaskImpl({
      description: getBackgroundPrDescription(prompt),
      prompt,
      use_bundle: true,
      toolUseContext: context,
    })
    const launchSummary = `Background PR task launched in CCR.\ntaskId: ${launched.taskId}\nsession_url: ${launched.sessionUrl}\noutput_file: ${launched.outputFile}`
    setMessages(prev => [
      ...prev,
      createUserMessageImpl({
        content: input,
      }),
      createSystemMessageImpl(launchSummary, 'info'),
    ])
    addNotification({
      key: `suggest-background-pr-launched-${launched.taskId}`,
      text: `Background PR launched: ${launched.taskId}`,
      priority: 'immediate',
      timeoutMs: 3500,
    })
  } catch (error) {
    const message = errorMessageImpl(error)
    setMessages(prev => [
      ...prev,
      createSystemMessageImpl(`Background PR launch failed: ${message}`, 'warning'),
    ])
    addNotification({
      key: 'suggest-background-pr-launch-failed',
      text: `Background PR launch failed: ${message}`,
      priority: 'immediate',
      timeoutMs: 5000,
    })
  }
}
