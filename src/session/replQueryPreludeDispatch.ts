import type { Message as MessageType } from '../types/message.js'
import type { MCPServerConnection } from '../services/mcp/types.js'

export type ReplQueryPreludeDispatchArgs = {
  shouldQuery: boolean
  newMessages: MessageType[]
}

export type ReplQueryPreludeDispatchDeps = {
  initialMcpClients: MCPServerConnection[]
  getDynamicMcpClients: () => MCPServerConnection[]
  handleQueryStart: (clients: MCPServerConnection[]) => void
  getConnectedIdeClient: (
    clients: MCPServerConnection[],
  ) => unknown | undefined
  closeOpenDiffs: (client: unknown) => void
  maybeMarkProjectOnboardingComplete: () => void
  titleDisabled: boolean
  sessionTitle?: string
  agentTitle?: string
  haikuTitleAttemptedRef: { current: boolean }
  getContentText: (content: unknown) => string | null
  syntheticBreadcrumbPrefixes: string[]
  generateSessionTitle: (
    text: string,
    signal: AbortSignal,
  ) => Promise<string | null | undefined>
  setHaikuTitle: (title: string) => void
  mergeClients: (
    initialClients: MCPServerConnection[],
    dynamicClients: MCPServerConnection[],
  ) => MCPServerConnection[]
}

export function dispatchReplQueryPrelude(
  args: ReplQueryPreludeDispatchArgs,
  deps: ReplQueryPreludeDispatchDeps,
): void {
  if (args.shouldQuery) {
    const freshClients = deps.mergeClients(
      deps.initialMcpClients,
      deps.getDynamicMcpClients(),
    )
    deps.handleQueryStart(freshClients)
    const ideClient = deps.getConnectedIdeClient(freshClients)
    if (ideClient) {
      deps.closeOpenDiffs(ideClient)
    }
  }

  deps.maybeMarkProjectOnboardingComplete()

  if (
    deps.titleDisabled ||
    deps.sessionTitle ||
    deps.agentTitle ||
    deps.haikuTitleAttemptedRef.current
  ) {
    return
  }

  const firstUserMessage = args.newMessages.find(
    message => message.type === 'user' && !message.isMeta,
  )
  const text =
    firstUserMessage?.type === 'user'
      ? deps.getContentText(firstUserMessage.message.content)
      : null

  if (
    !text ||
    deps.syntheticBreadcrumbPrefixes.some(prefix =>
      text.startsWith(`<${prefix}>`),
    )
  ) {
    return
  }

  deps.haikuTitleAttemptedRef.current = true
  void deps.generateSessionTitle(text, new AbortController().signal).then(
    title => {
      if (title) {
        deps.setHaikuTitle(title)
      } else {
        deps.haikuTitleAttemptedRef.current = false
      }
    },
    () => {
      deps.haikuTitleAttemptedRef.current = false
    },
  )
}
