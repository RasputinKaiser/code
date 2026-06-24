import type { FileStateCache } from '../utils/fileStateCache.js'
import type { Message } from '../types/message.js'
import type { PastedContent } from '../utils/config.js'
import type { SetAppState } from '../utils/messageQueueManager.js'
import {
  handleSpeculationAccept,
  type ActiveSpeculationState,
} from '../services/PromptSuggestion/speculation.js'
import {
  dispatchRemoteSubmit,
  type DispatchRemoteSubmitDeps,
} from './remoteSubmitDispatch.js'
import {
  dispatchLeaderSubmit,
  type DispatchLeaderSubmitOptions,
} from './leaderSubmitDispatch.js'
import { logError } from '../utils/log.js'

export type ReplSpeculationAccept = {
  state: ActiveSpeculationState
  speculationSessionTimeSavedMs: number
  setAppState: SetAppState
}

export type DispatchPostBookkeepingSubmitOptions = {
  input: string
  pastedContents: Record<number, PastedContent>
  mainLoopModel: string
  cwd: string
  readFileState: { current: FileStateCache }
  speculationAccept?: ReplSpeculationAccept
  leaderSubmit: DispatchLeaderSubmitOptions
}

export type DispatchPostBookkeepingSubmitDeps = {
  setMessages: (updater: (prev: Message[]) => Message[]) => void
  createAbortController: () => AbortController
  setAbortController: (abortController: AbortController) => void
  onQuery: (
    newMessages: Message[],
    abortController: AbortController,
    shouldQuery: boolean,
    additionalAllowedTools: string[],
    mainLoopModel: string,
  ) => Promise<void>
  remoteSubmit?: DispatchRemoteSubmitDeps
  handleSpeculationAcceptImpl?: typeof handleSpeculationAccept
  dispatchRemoteSubmitImpl?: typeof dispatchRemoteSubmit
  dispatchLeaderSubmitImpl?: typeof dispatchLeaderSubmit
}

export async function dispatchPostBookkeepingSubmit(
  {
    input,
    pastedContents,
    mainLoopModel,
    cwd,
    readFileState,
    speculationAccept,
    leaderSubmit,
  }: DispatchPostBookkeepingSubmitOptions,
  {
    setMessages,
    createAbortController,
    setAbortController,
    onQuery,
    remoteSubmit,
    handleSpeculationAcceptImpl = handleSpeculationAccept,
    dispatchRemoteSubmitImpl = dispatchRemoteSubmit,
    dispatchLeaderSubmitImpl = dispatchLeaderSubmit,
  }: DispatchPostBookkeepingSubmitDeps,
): Promise<'speculation' | 'remote' | 'leader'> {
  if (speculationAccept) {
    const { queryRequired } = await handleSpeculationAcceptImpl(
      speculationAccept.state,
      speculationAccept.speculationSessionTimeSavedMs,
      speculationAccept.setAppState,
      input,
      {
        setMessages,
        readFileState,
        cwd,
      },
    )

    if (queryRequired) {
      const abortController = createAbortController()
      setAbortController(abortController)
      void onQuery([], abortController, true, [], mainLoopModel).catch(logError)
    }

    return 'speculation'
  }

  if (remoteSubmit) {
    await dispatchRemoteSubmitImpl(
      {
        input,
        pastedContents,
      },
      remoteSubmit,
    )
    return 'remote'
  }

  await dispatchLeaderSubmitImpl(leaderSubmit)
  return 'leader'
}
