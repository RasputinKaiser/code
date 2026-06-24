import type { Dispatch, SetStateAction } from 'react'
import type { Command } from '../commands.js'
import type { SpinnerMode } from '../components/Spinner.js'
import type { IDESelection } from '../hooks/useIdeSelection.js'
import type { FileStateCache } from '../utils/fileStateCache.js'
import type { Message } from '../types/message.js'
import type { PromptInputMode } from '../types/textInputTypes.js'
import type { PastedContent } from '../utils/config.js'
import type { PromptInputHelpers } from '../utils/handlePromptSubmit.js'
import type { ToolJSXSetter } from './replRuntimeContext.js'
import {
  dispatchPostBookkeepingSubmit,
  type DispatchPostBookkeepingSubmitDeps,
  type ReplSpeculationAccept,
} from './postBookkeepingSubmitDispatch.js'
import { shouldUseRemoteSubmit } from './remoteSubmitPolicy.js'
import type { HandlePromptSubmitParams } from '../utils/handlePromptSubmit.js'

type StashedPrompt = {
  text: string
  cursorOffset: number
  pastedContents: Record<number, PastedContent>
}

export type DispatchReplPostBookkeepingSubmitOptions = {
  input: string
  pastedContents: Record<number, PastedContent>
  mainLoopModel: string
  cwd: string
  readFileState: { current: FileStateCache }
  speculationAccept?: ReplSpeculationAccept
  inputMode: PromptInputMode
  commands: Command[]
  ideSelection: IDESelection | undefined
  stashedPrompt: StashedPrompt | undefined
  shouldProvideDeferredStashRestore: boolean
  abortController: AbortController | null
  isExternalLoading: boolean
  streamMode: SpinnerMode
  hasInterruptibleToolInProgress: boolean
  isRemoteMode: boolean
  isSlashCommand: boolean
  matchedCommandType?: string
  querySource: HandlePromptSubmitParams['querySource']
}

export type DispatchReplPostBookkeepingSubmitDeps = {
  awaitPendingHooks: () => Promise<void>
  helpers: Pick<PromptInputHelpers, 'setCursorOffset'>
  queryGuard: HandlePromptSubmitParams['queryGuard']
  setInputValue: (value: string) => void
  setPastedContents: HandlePromptSubmitParams['setPastedContents']
  clearStashedPrompt: () => void
  setToolJSX: ToolJSXSetter
  getToolUseContext: HandlePromptSubmitParams['getToolUseContext']
  getMessages: () => Message[]
  setUserInputOnProcessing: HandlePromptSubmitParams['setUserInputOnProcessing']
  setAbortController: HandlePromptSubmitParams['setAbortController']
  onQuery: HandlePromptSubmitParams['onQuery']
  setAppState: HandlePromptSubmitParams['setAppState']
  onBeforeQuery: HandlePromptSubmitParams['onBeforeQuery']
  canUseTool: HandlePromptSubmitParams['canUseTool']
  addNotification: NonNullable<HandlePromptSubmitParams['addNotification']>
  setMessages: Dispatch<SetStateAction<Message[]>>
  createAbortController: () => AbortController
  activeRemoteSendMessage: (
    content: unknown,
    options: { uuid: string },
  ) => Promise<void>
  dispatchPostBookkeepingSubmitImpl?: typeof dispatchPostBookkeepingSubmit
}

export async function dispatchReplPostBookkeepingSubmit(
  {
    input,
    pastedContents,
    mainLoopModel,
    cwd,
    readFileState,
    speculationAccept,
    inputMode,
    commands,
    ideSelection,
    stashedPrompt,
    shouldProvideDeferredStashRestore,
    abortController,
    isExternalLoading,
    streamMode,
    hasInterruptibleToolInProgress,
    isRemoteMode,
    isSlashCommand,
    matchedCommandType,
    querySource,
  }: DispatchReplPostBookkeepingSubmitOptions,
  {
    awaitPendingHooks,
    helpers,
    queryGuard,
    setInputValue,
    setPastedContents,
    clearStashedPrompt,
    setToolJSX,
    getToolUseContext,
    getMessages,
    setUserInputOnProcessing,
    setAbortController,
    onQuery,
    setAppState,
    onBeforeQuery,
    canUseTool,
    addNotification,
    setMessages,
    createAbortController,
    activeRemoteSendMessage,
    dispatchPostBookkeepingSubmitImpl = dispatchPostBookkeepingSubmit,
  }: DispatchReplPostBookkeepingSubmitDeps,
): Promise<'speculation' | 'remote' | 'leader'> {
  const remoteSubmit = shouldUseRemoteSubmit({
    isRemoteMode,
    isSlashCommand,
    matchedCommandType,
  })
    ? {
        appendUserMessage: (userMessage: Message) => {
          setMessages(prev => [...prev, userMessage])
        },
        sendMessage: activeRemoteSendMessage,
      }
    : undefined

  const restoreDeferredStash =
    shouldProvideDeferredStashRestore && stashedPrompt !== undefined
      ? () => {
          setInputValue(stashedPrompt.text)
          helpers.setCursorOffset(stashedPrompt.cursorOffset)
          setPastedContents(stashedPrompt.pastedContents)
          clearStashedPrompt()
        }
      : undefined

  return dispatchPostBookkeepingSubmitImpl(
    {
      input,
      pastedContents,
      mainLoopModel,
      cwd,
      readFileState,
      speculationAccept,
      leaderSubmit: {
        awaitPendingHooks,
        handlePromptSubmitParams: {
          input,
          helpers,
          queryGuard,
          isExternalLoading,
          mode: inputMode,
          commands,
          onInputChange: setInputValue,
          setPastedContents,
          setToolJSX,
          getToolUseContext,
          messages: getMessages(),
          mainLoopModel,
          pastedContents,
          ideSelection,
          setUserInputOnProcessing,
          setAbortController,
          abortController,
          onQuery,
          setAppState,
          querySource,
          onBeforeQuery,
          canUseTool,
          addNotification,
          setMessages,
          streamMode,
          hasInterruptibleToolInProgress,
        },
        restoreDeferredStash,
      },
    },
    {
      setMessages,
      createAbortController,
      setAbortController,
      onQuery,
      remoteSubmit,
    } satisfies DispatchPostBookkeepingSubmitDeps,
  )
}
