import type {
  ActiveAgentForInput,
} from '../../state/selectors.js'
import type { PromptInputHelpers } from '../../utils/handlePromptSubmit.js'
import {
  parseDirectMemberMessage,
  sendDirectMemberMessage,
} from '../../utils/directMemberMessage.js'

export type DispatchPromptInputDirectMessageShortcutOptions = {
  input: string
  swarmsEnabled: boolean
  teamContext: Parameters<typeof sendDirectMemberMessage>[2]
}

export type DispatchPromptInputDirectMessageShortcutDeps = {
  addNotification: (options: {
    key: string
    text: string
    priority: 'immediate'
    timeoutMs: number
  }) => void
  clearDraft: () => void
  writeToMailbox?: Parameters<typeof sendDirectMemberMessage>[3]
  parseDirectMemberMessageImpl?: typeof parseDirectMemberMessage
  sendDirectMemberMessageImpl?: typeof sendDirectMemberMessage
}

export async function dispatchPromptInputDirectMessageShortcut(
  { input, swarmsEnabled, teamContext }: DispatchPromptInputDirectMessageShortcutOptions,
  {
    addNotification,
    clearDraft,
    writeToMailbox,
    parseDirectMemberMessageImpl = parseDirectMemberMessage,
    sendDirectMemberMessageImpl = sendDirectMemberMessage,
  }: DispatchPromptInputDirectMessageShortcutDeps,
): Promise<boolean> {
  if (!swarmsEnabled) {
    return false
  }

  const directMessage = parseDirectMemberMessageImpl(input)
  if (!directMessage) {
    return false
  }

  const result = await sendDirectMemberMessageImpl(
    directMessage.recipientName,
    directMessage.message,
    teamContext,
    writeToMailbox,
  )

  if (!result.success) {
    return false
  }

  addNotification({
    key: 'direct-message-sent',
    text: `Sent to @${result.recipientName}`,
    priority: 'immediate',
    timeoutMs: 3000,
  })
  clearDraft()
  return true
}

export type DispatchPromptInputAgentRouteOptions = {
  input: string
  activeAgent: ActiveAgentForInput
}

export type DispatchPromptInputAgentRouteDeps = {
  helpers: PromptInputHelpers
  onAgentSubmit?: (
    input: string,
    task: Extract<ActiveAgentForInput, { type: 'viewed' | 'named_agent' }>['task'],
    helpers: PromptInputHelpers,
  ) => Promise<void>
  onRouted?: () => void
}

export async function dispatchPromptInputAgentRoute(
  { input, activeAgent }: DispatchPromptInputAgentRouteOptions,
  { helpers, onAgentSubmit, onRouted }: DispatchPromptInputAgentRouteDeps,
): Promise<boolean> {
  if (activeAgent.type === 'leader' || !onAgentSubmit) {
    return false
  }

  onRouted?.()
  await onAgentSubmit(input, activeAgent.task, helpers)
  return true
}
