import { getCommandName, type Command } from '../commands.js'
import type { SpinnerMode } from '../components/Spinner.js'
import type { IDESelection } from '../hooks/useIdeSelection.js'
import type { FileStateCache } from '../utils/fileStateCache.js'
import type { PromptInputHelpers } from '../utils/handlePromptSubmit.js'
import type { PastedContent } from '../utils/config.js'
import type { PromptInputMode } from '../types/textInputTypes.js'
import type { HandlePromptSubmitParams } from '../utils/handlePromptSubmit.js'
import type { ReplSpeculationAccept } from './postBookkeepingSubmitDispatch.js'
import {
  dispatchReplPostBookkeepingSubmit,
  type DispatchReplPostBookkeepingSubmitDeps,
} from './replPostBookkeepingSubmitDispatch.js'
import {
  dispatchReplSubmitBookkeeping,
  type ReplSubmitBookkeepingDispatchDeps,
} from './replSubmitBookkeepingDispatch.js'
import {
  resolveReplSubmitBookkeepingPlan,
  type ReplStashedPromptState,
} from './replSubmitBookkeepingPlan.js'
import {
  dispatchReplSubmitPrelude,
  type ReplSubmitPreludeDispatchDeps,
} from './replSubmitPreludeDispatch.js'
import { resolveReplSubmitPreludePlan } from './replSubmitPreludePlan.js'
import {
  resolveReplSubmitState,
  type ReplSubmitState,
} from './replSubmitState.js'

export type DispatchReplSubmitOptions = {
  input: string
  helpers: Pick<PromptInputHelpers, 'setCursorOffset' | 'clearBuffer'>
  speculationAccept?: ReplSpeculationAccept
  fromKeybinding: boolean
  inputMode: PromptInputMode
  isLoading: boolean
  commands: Command[]
  isCommandEnabled: (command: Command) => boolean
  isRemoteMode: boolean
  pastedContents: Record<number, PastedContent>
  queryGuardActive: boolean
  userType: string | undefined
  willowMode: string
  idleReturnDismissed: boolean
  skipIdleCheck: boolean
  lastQueryCompletionTimeMs: number
  getTotalInputTokens: () => number
  tokenThreshold: number
  idleThresholdMinutes: number
  expandPastedTextRefs: (
    input: string,
    pastedContents: Record<number, PastedContent>,
  ) => string
  parseBackgroundPRShortcutInput: (input: string) => string | null
  getInputValue: () => string
  mainLoopModel: string
  stashedPrompt: ReplStashedPromptState | undefined
  getMessageCount: () => number
  cwd: string
  readFileState: { current: FileStateCache }
  ideSelection: IDESelection | undefined
  abortController: AbortController | null
  isExternalLoading: boolean
  streamMode: SpinnerMode
  hasInterruptibleToolInProgress: boolean
  querySource: HandlePromptSubmitParams['querySource']
  nowProvider?: () => number
}

export type DispatchReplSubmitDeps = {
  preludeDeps: ReplSubmitPreludeDispatchDeps
  bookkeepingDeps: ReplSubmitBookkeepingDispatchDeps
  postBookkeepingDeps: DispatchReplPostBookkeepingSubmitDeps
  resolveReplSubmitStateImpl?: typeof resolveReplSubmitState
  resolveReplSubmitPreludePlanImpl?: typeof resolveReplSubmitPreludePlan
  dispatchReplSubmitPreludeImpl?: typeof dispatchReplSubmitPrelude
  resolveReplSubmitBookkeepingPlanImpl?: typeof resolveReplSubmitBookkeepingPlan
  dispatchReplSubmitBookkeepingImpl?: typeof dispatchReplSubmitBookkeeping
  dispatchReplPostBookkeepingSubmitImpl?: typeof dispatchReplPostBookkeepingSubmit
}

type NormalizedReplSubmitIntent = {
  input: string
  inputMode: PromptInputMode
}

function normalizeReplSubmitIntent({
  input,
  inputMode,
  hasSpeculationAccept,
}: {
  input: string
  inputMode: PromptInputMode
  hasSpeculationAccept: boolean
}): NormalizedReplSubmitIntent {
  if (hasSpeculationAccept) {
    return { input, inputMode }
  }

  if ((inputMode === 'prompt' || inputMode === 'bash') && input.startsWith('!')) {
    return {
      input: input.slice(1),
      inputMode: 'bash',
    }
  }

  return { input, inputMode }
}

function findMatchingSubmitCommand(
  input: string,
  submitState: ReplSubmitState,
  commands: Command[],
  isCommandEnabled: (command: Command) => boolean,
): Command | undefined {
  const submittedCommandName = submitState.isSlashCommand
    ? input.trim().slice(1).split(/\s/)[0]
    : undefined

  return submittedCommandName
    ? commands.find(
        command =>
          isCommandEnabled(command) &&
          (command.name === submittedCommandName ||
            command.aliases?.includes(submittedCommandName) ||
            getCommandName(command) === submittedCommandName),
      )
    : undefined
}

export async function dispatchReplSubmit(
  {
    input: rawInput,
    helpers,
    speculationAccept,
    fromKeybinding,
    inputMode: rawInputMode,
    isLoading,
    commands,
    isCommandEnabled,
    isRemoteMode,
    pastedContents,
    queryGuardActive,
    userType,
    willowMode,
    idleReturnDismissed,
    skipIdleCheck,
    lastQueryCompletionTimeMs,
    getTotalInputTokens,
    tokenThreshold,
    idleThresholdMinutes,
    expandPastedTextRefs,
    parseBackgroundPRShortcutInput,
    getInputValue,
    mainLoopModel,
    stashedPrompt,
    getMessageCount,
    cwd,
    readFileState,
    ideSelection,
    abortController,
    isExternalLoading,
    streamMode,
    hasInterruptibleToolInProgress,
    querySource,
    nowProvider = Date.now,
  }: DispatchReplSubmitOptions,
  {
    preludeDeps,
    bookkeepingDeps,
    postBookkeepingDeps,
    resolveReplSubmitStateImpl = resolveReplSubmitState,
    resolveReplSubmitPreludePlanImpl = resolveReplSubmitPreludePlan,
    dispatchReplSubmitPreludeImpl = dispatchReplSubmitPrelude,
    resolveReplSubmitBookkeepingPlanImpl = resolveReplSubmitBookkeepingPlan,
    dispatchReplSubmitBookkeepingImpl = dispatchReplSubmitBookkeeping,
    dispatchReplPostBookkeepingSubmitImpl = dispatchReplPostBookkeepingSubmit,
  }: DispatchReplSubmitDeps,
): Promise<void> {
  const { input, inputMode } = normalizeReplSubmitIntent({
    input: rawInput,
    inputMode: rawInputMode,
    hasSpeculationAccept: !!speculationAccept,
  })

  const submitState = resolveReplSubmitStateImpl({
    input,
    inputMode,
    isLoading,
    isRemoteMode,
    hasSpeculationAccept: !!speculationAccept,
    fromKeybinding,
    hasStashedPrompt: stashedPrompt !== undefined,
  })

  const matchingSubmitCommand = findMatchingSubmitCommand(
    input,
    submitState,
    commands,
    isCommandEnabled,
  )

  const submitPreludePlan = resolveReplSubmitPreludePlanImpl({
    input,
    inputMode,
    hasSpeculationAccept: !!speculationAccept,
    fromKeybinding,
    userType,
    pastedContents,
    queryGuardActive,
    matchingCommand: matchingSubmitCommand,
    isRemoteMode,
    willowMode,
    idleReturnDismissed,
    skipIdleCheck,
    lastQueryCompletionTimeMs,
    totalInputTokens: getTotalInputTokens(),
    tokenThreshold,
    idleThresholdMinutes,
    nowMs: nowProvider(),
    expandPastedTextRefs,
    parseBackgroundPRShortcutInput,
  })

  if (
    await dispatchReplSubmitPreludeImpl(
      {
        submitPreludePlan,
        shouldAddToHistory: submitState.shouldAddToHistory,
        input,
        pastedContents,
        getInputValue,
        helpers,
        promptInputMode: inputMode,
        matchingSubmitCommand,
        fromKeybinding,
        mainLoopModel,
        stashedPrompt,
        totalInputTokens: getTotalInputTokens(),
        nowMs: nowProvider(),
        lastQueryCompletionTimeMs,
        messageCount: getMessageCount(),
      },
      preludeDeps,
    )
  ) {
    return
  }

  const submitBookkeepingPlan = resolveReplSubmitBookkeepingPlanImpl({
    submitState,
    input,
    inputMode,
    hasSpeculationAccept: !!speculationAccept,
    pastedContents,
    stashedPrompt,
  })

  dispatchReplSubmitBookkeepingImpl(
    {
      input,
      inputMode,
      submitState,
      submitBookkeepingPlan,
    },
    bookkeepingDeps,
  )

  await dispatchReplPostBookkeepingSubmitImpl(
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
      shouldProvideDeferredStashRestore:
        submitState.shouldProvideDeferredStashRestore,
      abortController,
      isExternalLoading,
      streamMode,
      hasInterruptibleToolInProgress,
      isRemoteMode,
      isSlashCommand: submitState.isSlashCommand,
      matchedCommandType: matchingSubmitCommand?.type,
      querySource,
    },
    postBookkeepingDeps,
  )
}
