import { afterEach, describe, expect, it } from 'bun:test'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { quote } from '../../bash/shellQuote.js'
import { TEAMMATE_COMMAND_ENV_VAR } from '../constants.js'
import { PaneBackendExecutor } from './PaneBackendExecutor.js'
import type { PaneBackend } from './types.js'

const originalCommand = process.env[TEAMMATE_COMMAND_ENV_VAR]
const originalConfigDir = process.env.NCODE_CONFIG_DIR

afterEach(async () => {
  if (originalCommand === undefined) {
    delete process.env[TEAMMATE_COMMAND_ENV_VAR]
  } else {
    process.env[TEAMMATE_COMMAND_ENV_VAR] = originalCommand
  }
  if (originalConfigDir === undefined) {
    delete process.env.NCODE_CONFIG_DIR
  } else {
    process.env.NCODE_CONFIG_DIR = originalConfigDir
  }
})

describe('PaneBackendExecutor spawn command', () => {
  it('launches non-bundled script builds through the current runtime', async () => {
    const configDir = await mkdtemp(join(tmpdir(), 'ncode-pane-backend-test-'))
    process.env.NCODE_CONFIG_DIR = configDir
    delete process.env[TEAMMATE_COMMAND_ENV_VAR]

    const sentCommands: string[] = []
    const backend: PaneBackend = {
      type: 'tmux',
      displayName: 'tmux',
      supportsHideShow: true,
      isAvailable: async () => true,
      isRunningInside: async () => true,
      createTeammatePaneInSwarmView: async () => ({
        paneId: '%42',
        isFirstTeammate: false,
      }),
      sendCommandToPane: async (_paneId, command) => {
        sentCommands.push(command)
      },
      setPaneBorderColor: async () => {},
      setPaneTitle: async () => {},
      enablePaneBorderStatus: async () => {},
      rebalancePanes: async () => {},
      killPane: async () => true,
      hidePane: async () => true,
      showPane: async () => true,
    }

    try {
      const executor = new PaneBackendExecutor(backend)
      executor.setContext({
        getAppState: () => ({
          toolPermissionContext: {
            mode: 'acceptEdits',
          },
        }),
      } as never)

      const result = await executor.spawn({
        name: 'fix-small-families',
        teamName: 'github-families',
        prompt: 'work',
        cwd: '/mlstore/src/noumena/ncode/platform/github',
        parentSessionId: 'parent-session',
      })

      expect(result.success).toBe(true)
      expect(sentCommands).toHaveLength(1)
      const command = sentCommands[0]!
      expect(command).toContain(quote([process.execPath]))
      expect(command).toContain(quote([process.argv[1]!]))
      expect(command).not.toContain(`env CLAUDECODE=1 ${quote([process.argv[1] ?? ''])} `)
      expect(command).toContain('--agent-id')
      expect(command).toContain('--permission-mode acceptEdits')
    } finally {
      await rm(configDir, { recursive: true, force: true })
    }
  })
})
