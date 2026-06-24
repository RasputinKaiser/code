import {
  handlePromptSubmit,
  type HandlePromptSubmitParams,
} from '../utils/handlePromptSubmit.js'

export type DispatchLeaderSubmitOptions = {
  awaitPendingHooks: () => Promise<void>
  handlePromptSubmitParams: HandlePromptSubmitParams
  restoreDeferredStash?: () => void
}

export type DispatchLeaderSubmitDeps = {
  handlePromptSubmitImpl?: (
    params: HandlePromptSubmitParams,
  ) => Promise<void>
}

export async function dispatchLeaderSubmit(
  {
    awaitPendingHooks,
    handlePromptSubmitParams,
    restoreDeferredStash,
  }: DispatchLeaderSubmitOptions,
  deps?: DispatchLeaderSubmitDeps,
): Promise<void> {
  await awaitPendingHooks()
  const handlePromptSubmitImpl = deps?.handlePromptSubmitImpl ?? handlePromptSubmit
  await handlePromptSubmitImpl(handlePromptSubmitParams)
  restoreDeferredStash?.()
}
