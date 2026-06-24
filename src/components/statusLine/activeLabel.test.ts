import { describe, expect, it } from 'bun:test'
import { getStatusLineActiveLabel } from './activeLabel.js'

function makeState(overrides: Partial<Parameters<typeof getStatusLineActiveLabel>[0]> = {}) {
  return {
    viewingAgentTaskId: undefined,
    tasks: {},
    agentNameRegistry: new Map(),
    ...overrides,
  }
}

describe('getStatusLineActiveLabel', () => {
  it('uses Main for the leader view', () => {
    expect(getStatusLineActiveLabel(makeState())).toBe('Main')
  })

  it('uses the teammate name when viewing an in-process teammate', () => {
    expect(
      getStatusLineActiveLabel(
        makeState({
          viewingAgentTaskId: 'teammate-task',
          tasks: {
            'teammate-task': {
              id: 'teammate-task',
              type: 'in_process_teammate',
              status: 'running',
              description: 'Research issue',
              startTime: 0,
              outputFile: '',
              outputOffset: 0,
              notified: false,
              identity: {
                agentId: 'researcher@team',
                agentName: 'researcher',
                teamName: 'team',
                planModeRequired: false,
                parentSessionId: 'parent',
              },
              prompt: 'Investigate',
              awaitingPlanApproval: false,
              permissionMode: 'default',
              pendingUserMessages: [],
              isIdle: false,
              shutdownRequested: false,
              lastReportedToolCount: 0,
              lastReportedTokenCount: 0,
            },
          },
        }),
      ),
    ).toBe('@researcher')
  })

  it('uses the registered agent name for a viewed background agent', () => {
    expect(
      getStatusLineActiveLabel(
        makeState({
          viewingAgentTaskId: 'agent-task',
          tasks: {
            'agent-task': {
              id: 'agent-task',
              type: 'local_agent',
              status: 'running',
              description: 'Review code',
              startTime: 0,
              outputFile: '',
              outputOffset: 0,
              notified: false,
              agentId: 'agent-id',
              prompt: 'Review',
              agentType: 'reviewer',
              retrieved: false,
              lastReportedToolCount: 0,
              lastReportedTokenCount: 0,
              isBackgrounded: true,
              pendingMessages: [],
              retain: false,
              diskLoaded: false,
            },
          },
          agentNameRegistry: new Map([['alice', 'agent-task']]),
        }),
      ),
    ).toBe('@alice')
  })

  it('falls back to the agent type when a viewed background agent has no registry name', () => {
    expect(
      getStatusLineActiveLabel(
        makeState({
          viewingAgentTaskId: 'agent-task',
          tasks: {
            'agent-task': {
              id: 'agent-task',
              type: 'local_agent',
              status: 'running',
              description: 'Review code',
              startTime: 0,
              outputFile: '',
              outputOffset: 0,
              notified: false,
              agentId: 'agent-id',
              prompt: 'Review',
              agentType: 'reviewer',
              retrieved: false,
              lastReportedToolCount: 0,
              lastReportedTokenCount: 0,
              isBackgrounded: true,
              pendingMessages: [],
              retain: false,
              diskLoaded: false,
            },
          },
        }),
      ),
    ).toBe('@reviewer')
  })
})
