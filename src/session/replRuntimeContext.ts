import type { Dispatch, MutableRefObject, ReactNode, SetStateAction } from 'react'
import { assembleToolPool, filterToolsByDenyRules } from '../tools.js'
import { mergeAndFilterTools } from '../utils/toolPool.js'
import { mergeClients } from '../hooks/useMergedClients.js'
import { resolveAgentTools } from '../tools/AgentTool/agentToolUtils.js'
import type { AgentDefinition } from '../tools/AgentTool/loadAgentsDir.js'
import type { Command, ResumeEntrypoint } from '../commands.js'
import type { ProcessUserInputContext } from '../utils/processUserInput/processUserInput.js'
import type { Message as MessageType } from '../types/message.js'
import type { PromptRequest, PromptResponse } from '../types/hooks.js'
import type { IDEExtensionInstallationStatus, IdeType } from '../utils/ide.js'
import type { Theme } from '../utils/theme.js'
import type { StreamingToolUse, StreamingThinking } from '../utils/messages.js'
import type { SpinnerMode } from '../components/Spinner.js'
import type { ScopedMcpServerConfig, MCPServerConnection } from '../services/mcp/types.js'
import type { ContentReplacementState } from '../utils/toolResultStorage.js'
import type { FileHistoryState } from '../utils/fileHistory.js'
import type { AttributionState } from '../utils/commitAttribution.js'
import type { FileStateCache } from '../utils/fileStateCache.js'
import type { LocalApiMetricsEntry } from './localQueryTurnApiMetrics.js'
import type { AppStateStore } from '../state/AppStateStore.js'
import type { Notification } from '../context/notifications.js'
import type { TerminalNotification } from '../ink/useTerminalNotification.js'
import type { RemoteSessionConfig } from '../remote/RemoteSessionManager.js'
import type { UUID } from '../types/ids.js'
import type { LogOption } from '../types/logs.js'
import type { ThinkingConfig } from '../utils/thinking.js'
import type { Tool } from '../Tool.js'
import { sendNotification } from '../services/notifier.js'
import { isInternalBuild } from 'src/capabilities/static.js'

export type ToolJSXValue = {
  jsx: ReactNode | null
  shouldHidePromptInput: boolean
  shouldContinueAnimation?: true
  showSpinner?: boolean
  isLocalJSXCommand?: boolean
  clearLocalJSX?: boolean
  isImmediate?: boolean
}

export type ToolJSXSetter = (value: ToolJSXValue | null) => void

export type RequestPromptHandler = (
  title: string,
  toolInputSummary?: string | null,
) => (request: PromptRequest) => Promise<PromptResponse>

export type ToolAssemblyProviders = {
  assembleToolPool: typeof assembleToolPool
  filterToolsByDenyRules: typeof filterToolsByDenyRules
  mergeAndFilterTools: typeof mergeAndFilterTools
  resolveAgentTools: typeof resolveAgentTools
  mergeClients: typeof mergeClients
}

export type ToolUseContextDeps = {
  commands: Command[]
  combinedInitialTools: Tool[]
  mainThreadAgentDefinition: AgentDefinition | undefined
  thinkingConfig: ThinkingConfig
  customSystemPrompt?: string
  appendSystemPrompt?: string
  debug: boolean
  initialMcpClients: MCPServerConnection[]
  ideInstallationStatus: IDEExtensionInstallationStatus | null
  dynamicMcpConfig: Record<string, ScopedMcpServerConfig> | undefined
  theme: Theme
  allowedAgentTypes: string[] | undefined
  store: AppStateStore
  setAppState: AppStateStore['setState']
  reverify: () => void
  addNotification: (notification: Notification) => void
  setMessages: Dispatch<SetStateAction<MessageType[]>>
  setRemoteSessionConfig: Dispatch<SetStateAction<RemoteSessionConfig | undefined>>
  setToolJSX: ToolJSXSetter
  setIDEToInstallExtension: (value: IdeType | null) => void
  onChangeDynamicMcpConfig: (config: Record<string, ScopedMcpServerConfig>) => void
  terminal: TerminalNotification
  setResponseLength: (updater: (prev: number) => number) => void
  responseLengthRef: MutableRefObject<number>
  apiMetricsRef: MutableRefObject<LocalApiMetricsEntry[]>
  setStreamMode: Dispatch<SetStateAction<SpinnerMode>>
  setStreamingToolUses: Dispatch<SetStateAction<StreamingToolUse[]>>
  setStreamingThinking: Dispatch<SetStateAction<StreamingThinking | null>>
  onStreamingText: (updater: (current: string | null) => string | null) => void
  setInProgressToolUseIDs: Dispatch<SetStateAction<Set<string>>>
  setHasInterruptibleToolInProgress: (value: boolean) => void
  resume: (sessionId: UUID, log: LogOption, entrypoint: ResumeEntrypoint) => Promise<void>
  setConversationId: Dispatch<SetStateAction<UUID>>
  setSpinnerMessage: Dispatch<SetStateAction<string | null>>
  setSpinnerColor: Dispatch<SetStateAction<keyof Theme | null>>
  setSpinnerShimmerColor: Dispatch<SetStateAction<keyof Theme | null>>
  setIsMessageSelectorVisible: Dispatch<SetStateAction<boolean>>
  disabled: boolean
  readFileState: MutableRefObject<FileStateCache>
  contentReplacementStateRef: MutableRefObject<ContentReplacementState | undefined>
  loadedNestedMemoryPathsRef: MutableRefObject<Set<string>>
  discoveredSkillNamesRef: MutableRefObject<Set<string>>
  requestPrompt?: RequestPromptHandler
}

const defaultToolAssemblyProviders: ToolAssemblyProviders = {
  assembleToolPool,
  filterToolsByDenyRules,
  mergeAndFilterTools,
  resolveAgentTools,
  mergeClients,
}

export function createToolUseContextGetter(
  deps: ToolUseContextDeps,
  providers: ToolAssemblyProviders = defaultToolAssemblyProviders,
): (
  messages: MessageType[],
  newMessages: MessageType[],
  abortController: AbortController,
  mainLoopModel: string,
) => ProcessUserInputContext {
  return (
    messages,
    newMessages,
    abortController,
    mainLoopModel,
  ): ProcessUserInputContext => {
    const computeTools = () => {
      const state = deps.store.getState()
      const assembled = providers.assembleToolPool(
        state.toolPermissionContext,
        state.mcp.tools,
      )
      const filteredInitialTools = providers.filterToolsByDenyRules(
        deps.combinedInitialTools,
        state.toolPermissionContext,
      )
      const merged = providers.mergeAndFilterTools(
        filteredInitialTools,
        assembled,
        state.toolPermissionContext.mode,
      )
      if (!deps.mainThreadAgentDefinition) {
        return merged
      }
      return providers.resolveAgentTools(
        deps.mainThreadAgentDefinition,
        merged,
        false,
        true,
      ).resolvedTools
    }

    const state = deps.store.getState()
    return {
      abortController,
      options: {
        commands: deps.commands,
        tools: computeTools(),
        debug: deps.debug,
        verbose: state.verbose,
        mainLoopModel,
        thinkingConfig:
          state.thinkingEnabled !== false
            ? deps.thinkingConfig
            : { type: 'disabled' },
        mcpClients: providers.mergeClients(
          deps.initialMcpClients,
          state.mcp.clients,
        ),
        mcpResources: state.mcp.resources,
        ideInstallationStatus: deps.ideInstallationStatus,
        isNonInteractiveSession: false,
        dynamicMcpConfig: deps.dynamicMcpConfig,
        theme: deps.theme,
        agentDefinitions: deps.allowedAgentTypes
          ? {
              ...state.agentDefinitions,
              allowedAgentTypes: deps.allowedAgentTypes,
            }
          : state.agentDefinitions,
        customSystemPrompt: deps.customSystemPrompt,
        appendSystemPrompt: deps.appendSystemPrompt,
        refreshTools: computeTools,
      },
      getAppState: () => deps.store.getState(),
      setAppState: deps.setAppState,
      messages,
      setMessages: deps.setMessages,
      setRemoteSessionConfig: deps.setRemoteSessionConfig,
      updateFileHistoryState: (updater: (prev: FileHistoryState) => FileHistoryState) => {
        deps.setAppState(prev => {
          const updated = updater(prev.fileHistory)
          if (updated === prev.fileHistory) {
            return prev
          }
          return {
            ...prev,
            fileHistory: updated,
          }
        })
      },
      updateAttributionState: (updater: (prev: AttributionState) => AttributionState) => {
        deps.setAppState(prev => {
          const updated = updater(prev.attribution)
          if (updated === prev.attribution) {
            return prev
          }
          return {
            ...prev,
            attribution: updated,
          }
        })
      },
      openMessageSelector: () => {
        if (!deps.disabled) {
          deps.setIsMessageSelectorVisible(true)
        }
      },
      onChangeAPIKey: deps.reverify,
      readFileState: deps.readFileState.current,
      setToolJSX: deps.setToolJSX,
      addNotification: deps.addNotification,
      appendSystemMessage: msg =>
        deps.setMessages(prev => [...prev, msg]),
      sendOSNotification: opts => {
        void sendNotification(opts, deps.terminal)
      },
      onChangeDynamicMcpConfig: deps.onChangeDynamicMcpConfig,
      onInstallIDEExtension: deps.setIDEToInstallExtension,
      nestedMemoryAttachmentTriggers: new Set<string>(),
      loadedNestedMemoryPaths: deps.loadedNestedMemoryPathsRef.current,
      dynamicSkillDirTriggers: new Set<string>(),
      discoveredSkillNames: deps.discoveredSkillNamesRef.current,
      setResponseLength: deps.setResponseLength,
      pushApiMetricsEntry:
        isInternalBuild()
          ? (ttftMs: number) => {
              const now = Date.now()
              const baseline = deps.responseLengthRef.current
              deps.apiMetricsRef.current.push({
                ttftMs,
                firstTokenTime: now,
                lastTokenTime: now,
                responseLengthBaseline: baseline,
                endResponseLength: baseline,
              })
            }
          : undefined,
      setStreamMode: deps.setStreamMode,
      onCompactProgress: event => {
        switch (event.type) {
          case 'hooks_start':
            deps.setSpinnerColor('claudeBlue_FOR_SYSTEM_SPINNER')
            deps.setSpinnerShimmerColor('claudeBlueShimmer_FOR_SYSTEM_SPINNER')
            deps.setSpinnerMessage(
              event.hookType === 'pre_compact'
                ? 'Running PreCompact hooks…'
                : event.hookType === 'post_compact'
                ? 'Running PostCompact hooks…'
                : 'Running SessionStart hooks…',
            )
            break
          case 'compact_start':
            deps.setSpinnerMessage('Compacting conversation')
            break
          case 'compact_end':
            deps.setSpinnerMessage(null)
            deps.setSpinnerColor(null)
            deps.setSpinnerShimmerColor(null)
            break
        }
      },
      setInProgressToolUseIDs: deps.setInProgressToolUseIDs,
      setHasInterruptibleToolInProgress: deps.setHasInterruptibleToolInProgress,
      resume: deps.resume,
      setConversationId: deps.setConversationId,
      requestPrompt: deps.requestPrompt,
      contentReplacementState: deps.contentReplacementStateRef.current,
    }
  }
}
