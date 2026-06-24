import type { Command } from '../commands.js'
import type { QuerySource } from '../constants/querySource.js'
import type { IDESelection } from '../hooks/useIdeSelection.js'
import type { CanUseToolFn } from '../hooks/useCanUseTool.js'
import type { Message } from '../types/message.js'
import type { QueuedCommand } from '../types/textInputTypes.js'
import type { SetToolJSXFn } from '../Tool.js'
import type { AppState } from '../state/AppState.js'
import type { EffortValue } from '../utils/effort.js'
import type { ProcessUserInputContext } from '../utils/processUserInput/processUserInput.js'
import type { QueryGuard } from '../utils/QueryGuard.js'
import {
  handlePromptSubmit,
  type HandlePromptSubmitParams,
} from '../utils/handlePromptSubmit.js'

export type ReplQueuedInputDispatchDeps = {
  queuedCommands: QueuedCommand[]
  queryGuard: QueryGuard
  commands: Command[]
  setToolJSX: SetToolJSXFn
  getToolUseContext: (
    messages: Message[],
    newMessages: Message[],
    abortController: AbortController,
    mainLoopModel: string,
  ) => ProcessUserInputContext
  messages: Message[]
  mainLoopModel: string
  ideSelection: IDESelection | undefined
  setUserInputOnProcessing: (prompt?: string) => void
  setAbortController: (abortController: AbortController | null) => void
  onQuery: (
    newMessages: Message[],
    abortController: AbortController,
    shouldQuery: boolean,
    additionalAllowedTools: string[],
    mainLoopModel: string,
    onBeforeQuery?: (input: string, newMessages: Message[]) => Promise<boolean>,
    input?: string,
    effort?: EffortValue,
  ) => Promise<void>
  setAppState: (updater: (prev: AppState) => AppState) => void
  querySource: QuerySource
  onBeforeQuery?: (input: string, newMessages: Message[]) => Promise<boolean>
  canUseTool?: CanUseToolFn
  addNotification?: HandlePromptSubmitParams['addNotification']
  setMessages?: HandlePromptSubmitParams['setMessages']
}

export async function dispatchReplQueuedInput({
  queuedCommands,
  queryGuard,
  commands,
  setToolJSX,
  getToolUseContext,
  messages,
  mainLoopModel,
  ideSelection,
  setUserInputOnProcessing,
  setAbortController,
  onQuery,
  setAppState,
  querySource,
  onBeforeQuery,
  canUseTool,
  addNotification,
  setMessages,
}: ReplQueuedInputDispatchDeps): Promise<void> {
  await handlePromptSubmit({
    helpers: {
      setCursorOffset: () => {},
      clearBuffer: () => {},
      resetHistory: () => {},
    },
    queryGuard,
    commands,
    onInputChange: () => {},
    setPastedContents: () => {},
    setToolJSX,
    getToolUseContext,
    messages,
    mainLoopModel,
    ideSelection,
    setUserInputOnProcessing,
    setAbortController,
    onQuery,
    setAppState,
    querySource,
    onBeforeQuery,
    canUseTool,
    addNotification,
    setMessages,
    queuedCommands,
  })
}
