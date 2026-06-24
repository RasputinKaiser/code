import type { QueuedCommand } from '../types/textInputTypes.js'
import type { UserMessage } from '../types/message.js'
import { createUserMessage } from '../utils/messages.js'

export type ReplIncomingPromptDispatchDeps = {
  queryGuardActive: boolean
  queuedCommands: readonly QueuedCommand[]
  createAbortController: () => AbortController
  setAbortController: (abortController: AbortController) => void
  submitQuery: (message: UserMessage, abortController: AbortController) => void
}

export function dispatchReplIncomingPrompt(
  {
    content,
    isMeta,
  }: {
    content: string
    isMeta?: boolean
  },
  {
    queryGuardActive,
    queuedCommands,
    createAbortController,
    setAbortController,
    submitQuery,
  }: ReplIncomingPromptDispatchDeps,
): boolean {
  if (queryGuardActive) {
    return false
  }

  if (queuedCommands.some(cmd => cmd.mode === 'prompt' || cmd.mode === 'bash')) {
    return false
  }

  const abortController = createAbortController()
  setAbortController(abortController)

  submitQuery(
    createUserMessage({
      content,
      isMeta: isMeta ? true : undefined,
    }),
    abortController,
  )
  return true
}
