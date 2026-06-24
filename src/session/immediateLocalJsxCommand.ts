import type { ReactNode } from 'react'
import { LOCAL_COMMAND_STDOUT_TAG } from '../constants/xml.js'
import type { Message } from '../types/message.js'
import type { Command, CommandResultDisplay } from '../types/command.js'
import type { ProcessUserInputContext } from '../utils/processUserInput/processUserInput.js'
import {
  createCommandInputMessage,
  createUserMessage,
  formatCommandInputTags,
} from '../utils/messages.js'
import { escapeXml } from '../utils/xml.js'

type ImmediateLocalJsxCommand = Extract<Command, { type: 'local-jsx' }>

export type ImmediateLocalJsxToolState = {
  jsx: ReactNode | null
  shouldHidePromptInput: boolean
  shouldContinueAnimation?: true
  showSpinner?: boolean
  isLocalJSXCommand?: boolean
  clearLocalJSX?: boolean
}

export type ImmediateLocalJsxCommandDeps = {
  addNotification: (options: {
    key: string
    text: string
    priority: 'immediate'
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
  setToolJSX: (value: ImmediateLocalJsxToolState | null) => void
}

export type ExecuteImmediateLocalJsxCommandOptions = {
  command: ImmediateLocalJsxCommand
  commandArgs: string
  commandName: string
  commandNotificationName: string
  fullscreenEnabled: boolean
  mainLoopModel: string
  restoreStashedPrompt?: () => void
}

export function buildImmediateLocalJsxCompletionMessages({
  commandArgs,
  commandName,
  fullscreenEnabled,
  metaMessages,
  result,
  display,
}: {
  commandArgs: string
  commandName: string
  fullscreenEnabled: boolean
  metaMessages: string[] | undefined
  result: string | undefined
  display: CommandResultDisplay | undefined
}): Message[] {
  const messages: Message[] = []

  if (result && display !== 'skip' && !fullscreenEnabled) {
    messages.push(
      createCommandInputMessage(formatCommandInputTags(commandName, commandArgs)),
      createCommandInputMessage(
        `<${LOCAL_COMMAND_STDOUT_TAG}>${escapeXml(result)}</${LOCAL_COMMAND_STDOUT_TAG}>`,
      ),
    )
  }

  if (metaMessages?.length) {
    messages.push(
      ...metaMessages.map(content =>
        createUserMessage({
          content,
          isMeta: true,
        }),
      ),
    )
  }

  return messages
}

export async function executeImmediateLocalJsxCommand(
  {
    command,
    commandArgs,
    commandName,
    commandNotificationName,
    fullscreenEnabled,
    mainLoopModel,
    restoreStashedPrompt,
  }: ExecuteImmediateLocalJsxCommandOptions,
  {
    addNotification,
    createAbortController,
    getMessages,
    getToolUseContext,
    setMessages,
    setToolJSX,
  }: ImmediateLocalJsxCommandDeps,
): Promise<void> {
  let doneWasCalled = false

  const onDone = (
    result?: string,
    doneOptions?: {
      display?: CommandResultDisplay
      metaMessages?: string[]
    },
  ): void => {
    doneWasCalled = true
    setToolJSX({
      jsx: null,
      shouldHidePromptInput: false,
      clearLocalJSX: true,
    })

    if (result && doneOptions?.display !== 'skip') {
      addNotification({
        key: `immediate-${commandNotificationName}`,
        text: result,
        priority: 'immediate',
      })
    }

    const newMessages = buildImmediateLocalJsxCompletionMessages({
      commandArgs,
      commandName,
      fullscreenEnabled,
      metaMessages: doneOptions?.metaMessages,
      result,
      display: doneOptions?.display,
    })
    if (newMessages.length > 0) {
      setMessages(prev => [...prev, ...newMessages])
    }

    restoreStashedPrompt?.()
  }

  const context = getToolUseContext(
    getMessages(),
    [],
    createAbortController(),
    mainLoopModel,
  )
  const mod = await command.load()
  const jsx = await mod.call(onDone, context, commandArgs)

  if (jsx && !doneWasCalled) {
    setToolJSX({
      jsx,
      shouldHidePromptInput: false,
      isLocalJSXCommand: true,
    })
  }
}
