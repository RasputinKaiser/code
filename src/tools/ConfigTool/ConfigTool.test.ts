import { beforeEach, describe, expect, it, mock } from 'bun:test'
import { getDefaultAppState } from '../../state/AppStateStore.js'

type MockGlobalConfig = Record<string, unknown>
type MockSettings = Record<string, unknown>

const analyticsEvents: Array<{ name: string; payload: Record<string, unknown> }> =
  []

let mockGlobalConfig: MockGlobalConfig
let mockSettings: MockSettings

const configModulePaths = [
  import.meta.resolve('../../utils/config.ts'),
  import.meta.resolve('../../utils/config.js'),
]
const settingsModulePaths = [
  import.meta.resolve('../../utils/settings/settings.ts'),
  import.meta.resolve('../../utils/settings/settings.js'),
]
const supportedSettingsPaths = [
  import.meta.resolve('./supportedSettings.ts'),
  import.meta.resolve('./supportedSettings.js'),
]
const analyticsPaths = [
  import.meta.resolve('../../services/analytics/index.ts'),
  import.meta.resolve('../../services/analytics/index.js'),
]
const logPaths = [
  import.meta.resolve('../../utils/log.ts'),
  import.meta.resolve('../../utils/log.js'),
]

const actualLogModule = await import(import.meta.resolve('../../utils/log.ts'))

function mergeObjects(
  target: Record<string, unknown>,
  update: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...target }
  for (const [key, value] of Object.entries(update)) {
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      result[key] &&
      typeof result[key] === 'object' &&
      !Array.isArray(result[key])
    ) {
      result[key] = mergeObjects(
        result[key] as Record<string, unknown>,
        value as Record<string, unknown>,
      )
      continue
    }
    result[key] = value
  }
  return result
}

for (const configModulePath of configModulePaths) {
  mock.module(configModulePath, () => ({
    getGlobalConfig: () => mockGlobalConfig,
    getRemoteControlAtStartup: () =>
      (mockGlobalConfig.remoteControlAtStartup as boolean | undefined) ?? false,
    saveGlobalConfig(
      updater: (current: MockGlobalConfig) => MockGlobalConfig,
    ): void {
      mockGlobalConfig = updater({ ...mockGlobalConfig })
    },
  }))
}

for (const settingsModulePath of settingsModulePaths) {
  mock.module(settingsModulePath, () => ({
    getInitialSettings: () => mockSettings,
    updateSettingsForSource(
      _source: string,
      update: Record<string, unknown>,
    ): { error?: Error } {
      mockSettings = mergeObjects(mockSettings, update)
      return {}
    },
  }))
}

for (const supportedSettingsPath of supportedSettingsPaths) {
  mock.module(supportedSettingsPath, () => {
    const settings = {
      theme: {
        source: 'global' as const,
        type: 'string' as const,
        description: 'Theme',
        options: ['dark', 'light'],
      },
      verbose: {
        source: 'global' as const,
        type: 'boolean' as const,
        description: 'Verbose',
        appStateKey: 'verbose' as const,
      },
      alwaysThinkingEnabled: {
        source: 'settings' as const,
        type: 'boolean' as const,
        description: 'Thinking',
        appStateKey: 'thinkingEnabled' as const,
      },
      'permissions.defaultMode': {
        source: 'settings' as const,
        type: 'string' as const,
        description: 'Permissions mode',
        options: ['default', 'plan'],
      },
      remoteControlAtStartup: {
        source: 'global' as const,
        type: 'boolean' as const,
        description: 'Bridge startup mode',
      },
    }

    return {
      isSupported(key: string) {
        return key in settings
      },
      getConfig(key: string) {
        return settings[key as keyof typeof settings]
      },
      getPath(key: string) {
        return key.split('.')
      },
      getOptionsForSetting(key: string) {
        const config = settings[key as keyof typeof settings]
        return config && 'options' in config ? [...(config.options ?? [])] : undefined
      },
    }
  })
}

for (const analyticsPath of analyticsPaths) {
  mock.module(analyticsPath, () => ({
    logEvent(name: string, payload: Record<string, unknown>) {
      analyticsEvents.push({ name, payload })
    },
  }))
}

for (const logPath of logPaths) {
  mock.module(logPath, () => ({
    ...actualLogModule,
    logError() {},
  }))
}

const { ConfigTool } = await import(import.meta.resolve('./ConfigTool.ts'))

function createToolUseContext(
  initialAppState?: Partial<ReturnType<typeof getDefaultAppState>>,
) {
  let appState = {
    ...getDefaultAppState(),
    ...initialAppState,
  }

  const setAppState = (updater: (prev: typeof appState) => typeof appState) => {
    appState = updater(appState)
  }

  return {
    options: {
      commands: [],
      debug: false,
      mainLoopModel: '/data/models/hf/moonshotai__Kimi-K2.7-Code',
      tools: [ConfigTool] as never,
      verbose: false,
      thinkingConfig: {} as never,
      mcpClients: [],
      mcpResources: {},
      isNonInteractiveSession: true,
      agentDefinitions: {
        activeAgents: [],
        allAgents: [],
      },
    },
    abortController: new AbortController(),
    readFileState: {} as never,
    getAppState: () => appState,
    setAppState,
    setAppStateForTasks: setAppState,
    setInProgressToolUseIDs: () => {},
    setResponseLength: () => {},
    updateFileHistoryState: () => {},
    updateAttributionState: () => {},
    messages: [],
  } as never
}

beforeEach(() => {
  analyticsEvents.length = 0
  mockGlobalConfig = {
    theme: 'dark',
    verbose: false,
    remoteControlAtStartup: true,
  }
  mockSettings = {
    permissions: {
      defaultMode: 'default',
    },
    alwaysThinkingEnabled: false,
  }
})

describe('ConfigTool runtime contract', () => {
  it('auto-allows get requests and asks before set requests', async () => {
    const toolUseContext = createToolUseContext()

    const readDecision = await ConfigTool.checkPermissions!(
      { setting: 'theme' },
      toolUseContext,
    )
    const writeDecision = await ConfigTool.checkPermissions!(
      { setting: 'theme', value: 'light' },
      toolUseContext,
    )

    expect(readDecision).toEqual({
      behavior: 'allow',
      updatedInput: { setting: 'theme' },
    })
    expect(writeDecision).toEqual({
      behavior: 'ask',
      message: 'Set theme to "light"',
    })
  })

  it('reads global config and writes boolean globals with immediate app-state sync', async () => {
    const toolUseContext = createToolUseContext()

    const getResult = await ConfigTool.call!(
      { setting: 'theme' },
      toolUseContext,
    )
    expect(getResult.data).toEqual({
      success: true,
      operation: 'get',
      setting: 'theme',
      value: 'dark',
    })

    const setResult = await ConfigTool.call!(
      {
        setting: 'verbose',
        value: 'true',
      },
      toolUseContext,
    )

    expect(setResult.data).toMatchObject({
      success: true,
      operation: 'set',
      setting: 'verbose',
      previousValue: false,
      newValue: true,
    })
    expect(mockGlobalConfig.verbose).toBe(true)
    expect(toolUseContext.getAppState().verbose).toBe(true)
    expect(analyticsEvents).toContainEqual({
      name: 'ncode_config_tool_changed',
      payload: {
        setting: 'verbose',
        value: 'true',
      },
    })
  })

  it('writes settings-backed values and rejects invalid options', async () => {
    const toolUseContext = createToolUseContext()

    const success = await ConfigTool.call!(
      {
        setting: 'permissions.defaultMode',
        value: 'plan',
      },
      toolUseContext,
    )
    expect(success.data).toMatchObject({
      success: true,
      operation: 'set',
      setting: 'permissions.defaultMode',
      previousValue: 'default',
      newValue: 'plan',
    })
    expect(mockSettings.permissions).toEqual({
      defaultMode: 'plan',
    })

    const failure = await ConfigTool.call!(
      {
        setting: 'permissions.defaultMode',
        value: 'invalid',
      },
      toolUseContext,
    )
    expect(failure.data).toEqual({
      success: false,
      operation: 'set',
      setting: 'permissions.defaultMode',
      error: 'Invalid value "invalid". Options: default, plan',
    })
  })

  it('resets remoteControlAtStartup to default and updates bridge app state immediately', async () => {
    const toolUseContext = createToolUseContext({
      replBridgeEnabled: true,
      replBridgeOutboundOnly: true,
    })

    const result = await ConfigTool.call!(
      {
        setting: 'remoteControlAtStartup',
        value: 'default',
      },
      toolUseContext,
    )

    expect(result.data).toEqual({
      success: true,
      operation: 'set',
      setting: 'remoteControlAtStartup',
      value: false,
    })
    expect('remoteControlAtStartup' in mockGlobalConfig).toBe(false)
    expect(toolUseContext.getAppState().replBridgeEnabled).toBe(false)
    expect(toolUseContext.getAppState().replBridgeOutboundOnly).toBe(false)
  })
})
