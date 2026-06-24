import type { Command } from '../commands.js'
import type * as React from 'react'
import { getCommandName } from '../commands.js'
import type { PromptInputHelpers } from '../utils/handlePromptSubmit.js'
import type { PastedContent } from '../utils/config.js'
import type { PromptInputMode } from '../types/textInputTypes.js'
import type { IDESelection } from '../hooks/useIdeSelection.js'
import type { Message as MessageType } from '../types/message.js'
import type { AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS } from 'src/services/analytics/index.js'
import { dispatchBackgroundPrShortcutPrelaunch } from './backgroundPrShortcutPrelaunch.js'
import { dispatchImmediateLocalJsxSubmit } from './immediateLocalJsxSubmitDispatch.js'
import { dispatchReplIdleReturnDialog } from './replIdleReturnDialogDispatch.js'
import type { ReplSubmitPreludePlan } from './replSubmitPreludePlan.js'

export type ReplSubmitPreludeDispatchOptions = {
  submitPreludePlan: ReplSubmitPreludePlan
  shouldAddToHistory: boolean
  input: string
  pastedContents: Record<number, PastedContent>
  getInputValue: () => string
  helpers: Pick<PromptInputHelpers, 'setCursorOffset' | 'clearBuffer'>
  promptInputMode: PromptInputMode
  matchingSubmitCommand: Command | undefined
  fromKeybinding: boolean
  mainLoopModel: string
  stashedPrompt:
    | {
        text: string
        cursorOffset: number
        pastedContents: Record<number, PastedContent>
      }
    | undefined
  totalInputTokens: number
  nowMs: number
  lastQueryCompletionTimeMs: number
  messageCount: number
}

export type ReplSubmitPreludeDispatchDeps = {
  addNotification: (notification: {
    key: string
    text: string
    priority: 'immediate'
    timeoutMs: number
  }) => void
  dispatchBackgroundPrShortcutPrelaunchImpl?: typeof dispatchBackgroundPrShortcutPrelaunch
  dispatchImmediateLocalJsxSubmitImpl?: typeof dispatchImmediateLocalJsxSubmit
  dispatchReplIdleReturnDialogImpl?: typeof dispatchReplIdleReturnDialog
  addToHistory: (entry: {
    display: string
    pastedContents: Record<number, PastedContent>
  }) => void
  setInputValue: (value: string) => void
  setPastedContents: (value: Record<number, PastedContent>) => void
  setInputMode: (mode: PromptInputMode) => void
  setIDESelection: (selection: IDESelection | undefined) => void
  incrementSubmitCount: () => void
  createAbortController: () => AbortController
  getMessages: () => MessageType[]
  getToolUseContext: (
    messages: MessageType[],
    additionalTools: any[],
    abortController: AbortController,
    modelName: string,
  ) => any
  setMessages: (updater: (prev: MessageType[]) => MessageType[]) => void
  setStashedPrompt: (
    value:
      | {
          text: string
          cursorOffset: number
          pastedContents: Record<number, PastedContent>
        }
      | undefined,
  ) => void
  setToolJSX: (jsx: React.ReactNode | null) => void
  logEvent: (name: string, payload: Record<string, unknown>) => void
  addIdleReturnPending: (value: { input: string; idleMinutes: number }) => void
  clearIdleHint: () => void
  getIdleHint: () => string | false
  isFullscreenEnvEnabled: () => boolean
}

export async function dispatchReplSubmitPrelude(
  {
    submitPreludePlan,
    shouldAddToHistory,
    input,
    pastedContents,
    getInputValue,
    helpers,
    promptInputMode,
    matchingSubmitCommand,
    fromKeybinding,
    mainLoopModel,
    stashedPrompt,
    totalInputTokens,
    nowMs,
    lastQueryCompletionTimeMs,
    messageCount,
  }: ReplSubmitPreludeDispatchOptions,
  {
    addNotification,
    dispatchBackgroundPrShortcutPrelaunchImpl = dispatchBackgroundPrShortcutPrelaunch,
    dispatchImmediateLocalJsxSubmitImpl = dispatchImmediateLocalJsxSubmit,
    dispatchReplIdleReturnDialogImpl = dispatchReplIdleReturnDialog,
    addToHistory,
    setInputValue,
    setPastedContents,
    setInputMode,
    setIDESelection,
    incrementSubmitCount,
    createAbortController,
    getMessages,
    getToolUseContext,
    setMessages,
    setStashedPrompt,
    setToolJSX,
    logEvent,
    addIdleReturnPending,
    clearIdleHint,
    getIdleHint,
    isFullscreenEnvEnabled,
  }: ReplSubmitPreludeDispatchDeps,
): Promise<boolean> {
  switch (submitPreludePlan.type) {
    case 'background-pr-empty-prompt':
      addNotification({
        key: 'suggest-background-pr-empty',
        text: 'Background PR shortcut needs a prompt after "&".',
        priority: 'immediate',
        timeoutMs: 3500,
      })
      return true
    case 'background-pr-images-unsupported':
      addNotification({
        key: 'suggest-background-pr-images-unsupported',
        text: 'Background PR shortcut currently supports text input only.',
        priority: 'immediate',
        timeoutMs: 3500,
      })
      return true
    case 'background-pr-launch':
      await dispatchBackgroundPrShortcutPrelaunchImpl(
        {
          shouldAddToHistory,
          input,
          pastedContents,
          getInputValue,
          helpers,
          prompt: submitPreludePlan.prompt,
          mainLoopModel,
        },
        {
          addToHistory,
          setInputValue,
          setPastedContents,
          setInputMode,
          setIDESelection,
          incrementSubmitCount,
          addNotification,
          createAbortController,
          getMessages,
          getToolUseContext,
          setMessages,
        },
      )
      return true
    case 'immediate-local-jsx':
      if (matchingSubmitCommand?.name === 'clear') {
        const idleHint = getIdleHint()
        if (idleHint) {
          logEvent('ncode_idle_return_action', {
            action:
              'hint_converted' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
            variant: idleHint as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
            idleMinutes: Math.round((nowMs - lastQueryCompletionTimeMs) / 60_000),
            messageCount,
            totalInputTokens,
          })
          clearIdleHint()
        }
      }
      if (matchingSubmitCommand) {
        dispatchImmediateLocalJsxSubmitImpl(
          {
            input,
            getInputValue,
            helpers,
            pastedContents,
            command: matchingSubmitCommand,
            commandArgs: submitPreludePlan.commandArgs,
            commandName: getCommandName(matchingSubmitCommand),
            fromKeybinding,
            fullscreenEnabled: isFullscreenEnvEnabled(),
            mainLoopModel,
            stashedPrompt,
          },
          {
            setInputValue,
            setPastedContents,
            setStashedPrompt,
            logEvent,
            addNotification,
            createAbortController,
            getMessages,
            getToolUseContext,
            setMessages,
            setToolJSX,
          },
        )
        return true
      }
      return false
    case 'skip-empty-remote':
      return true
    case 'idle-return-dialog':
      return dispatchReplIdleReturnDialogImpl(
        {
          input,
          idleReturnPreflight: submitPreludePlan.preflight,
        },
        {
          setIdleReturnPending: addIdleReturnPending,
          setInputValue,
          setCursorOffset: helpers.setCursorOffset,
          clearBuffer: helpers.clearBuffer,
        },
      )
    case 'continue':
      return false
  }
}
