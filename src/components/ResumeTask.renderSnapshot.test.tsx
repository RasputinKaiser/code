import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import React from 'react'
import {
  cleanupMountedComponent,
  mountMountedComponent,
} from '../testing/mountedComponentHarness.js'
import {
  expectRowsToContainSubstringsInDistinctOrder,
  waitForMountedVisibleRows,
} from '../testing/replScreenContractHarness.js'
import { expectTextSnapshot } from '../testing/textSnapshotHarness.js'
import type { CodeSession } from '../utils/teleport/api.js'

const mockSessions: CodeSession[] = []
let mockCurrentRepo: string | null = null
let mockNeedsLogin = false
let mockIsGitClean = true

const preconditionPaths = [
  import.meta.resolve('src/utils/background/remote/preconditions.js'),
  import.meta.resolve('src/utils/background/remote/preconditions.ts'),
]
const detectRepositoryPaths = [
  import.meta.resolve('../utils/detectRepository.js'),
  import.meta.resolve('../utils/detectRepository.ts'),
]
const teleportApiPaths = [
  import.meta.resolve('src/utils/teleport/api.js'),
  import.meta.resolve('src/utils/teleport/api.ts'),
]
const formatPaths = [
  import.meta.resolve('../utils/format.js'),
  import.meta.resolve('../utils/format.ts'),
]

const actualFormat = await import(import.meta.resolve('../utils/format.ts'))

for (const preconditionPath of preconditionPaths) {
  mock.module(preconditionPath, () => ({
    checkNeedsClaudeAiLogin: async () => mockNeedsLogin,
    checkIsGitClean: async () => mockIsGitClean,
  }))
}

for (const detectRepositoryPath of detectRepositoryPaths) {
  mock.module(detectRepositoryPath, () => ({
    detectCurrentRepository: async () => mockCurrentRepo,
  }))
}

for (const teleportApiPath of teleportApiPaths) {
  mock.module(teleportApiPath, () => ({
    fetchCodeSessionsFromSessionsAPI: async () => [...mockSessions],
  }))
}

for (const formatPath of formatPaths) {
  mock.module(formatPath, () => ({
    ...actualFormat,
    formatRelativeTime(date: Date) {
      return date.toISOString().includes('00:05:00.000Z') ? '2m ago' : '7m ago'
    },
  }))
}

const { ResumeTask } = await import(import.meta.resolve('./ResumeTask.tsx'))

const ORIGINAL_NO_FLICKER = process.env.CLAUDE_CODE_NO_FLICKER
const ORIGINAL_API_KEY = process.env.ANTHROPIC_API_KEY

beforeEach(() => {
  process.env.CLAUDE_CODE_NO_FLICKER = '1'
  process.env.ANTHROPIC_API_KEY = 'test-key'
  mockSessions.length = 0
  mockCurrentRepo = null
  mockNeedsLogin = false
  mockIsGitClean = true
})

afterEach(async () => {
  await cleanupMountedComponent()
  if (ORIGINAL_NO_FLICKER === undefined) {
    delete process.env.CLAUDE_CODE_NO_FLICKER
  } else {
    process.env.CLAUDE_CODE_NO_FLICKER = ORIGINAL_NO_FLICKER
  }

  if (ORIGINAL_API_KEY === undefined) {
    delete process.env.ANTHROPIC_API_KEY
  } else {
    process.env.ANTHROPIC_API_KEY = ORIGINAL_API_KEY
  }
})

function makeSession(
  id: string,
  title: string,
  updatedAt: string,
): CodeSession {
  return {
    id,
    title,
    description: '',
    status: 'idle',
    repo: {
      name: 'ncode',
      owner: { login: 'noumena' },
      default_branch: 'main',
    },
    turns: [],
    created_at: '2026-04-22T00:00:00Z',
    updated_at: updatedAt,
  }
}

describe('ResumeTask rendered snapshots', () => {
  test('renders the session selection surface', async () => {
    mockCurrentRepo = 'noumena/ncode'
    mockSessions.push(
      makeSession('session-2', 'Weekly bug bash', '2026-04-22T00:05:00Z'),
      makeSession('session-1', 'Teleport drill', '2026-04-22T00:02:00Z'),
    )

    const { ink } = await mountMountedComponent(
      <ResumeTask onSelect={() => {}} onCancel={() => {}} />,
      {
        columns: 92,
        rows: 20,
      },
    )

    const rows = await waitForMountedVisibleRows(
      ink,
      visibleRows =>
        visibleRows.some(row => row.includes('Select a session to resume')) &&
        visibleRows.some(row => row.includes('Weekly bug bash')) &&
        visibleRows.some(row => row.includes('Teleport drill')),
      {
        timeoutMs: 4000,
        label: 'resume task session-selection surface',
      },
    )

    expectRowsToContainSubstringsInDistinctOrder(
      rows,
      [
        'Select a session to resume',
        'Updated  Session Title',
        '2m ago   Weekly bug bash',
        '7m ago   Teleport drill',
      ],
      'resume task session-selection rows',
    )

    expectTextSnapshot({
      snapshotFileUrl: new URL(
        './snapshots/ResumeTask.renderSnapshot.test__session_selection_surface.snap',
        import.meta.url,
      ),
      source: 'src/components/ResumeTask.renderSnapshot.test.tsx',
      expression: 'session_selection_surface',
      value: rows.join('\n'),
    })
  })

  test('renders the empty-state surface', async () => {
    mockCurrentRepo = 'noumena/ncode'

    const { ink } = await mountMountedComponent(
      <ResumeTask onSelect={() => {}} onCancel={() => {}} />,
      {
        columns: 92,
        rows: 16,
      },
    )

    const rows = await waitForMountedVisibleRows(
      ink,
      visibleRows =>
        visibleRows.some(row => row.includes('No Code sessions found')) &&
        visibleRows.some(row => row.includes('noumena/ncode')),
      {
        timeoutMs: 4000,
        label: 'resume task empty surface',
      },
    )

    expectRowsToContainSubstringsInDistinctOrder(
      rows,
      ['No Code sessions found for noumena/ncode', 'Press Esc to cancel'],
      'resume task empty rows',
    )

    expectTextSnapshot({
      snapshotFileUrl: new URL(
        './snapshots/ResumeTask.renderSnapshot.test__empty_surface.snap',
        import.meta.url,
      ),
      source: 'src/components/ResumeTask.renderSnapshot.test.tsx',
      expression: 'empty_surface',
      value: rows.join('\n'),
    })
  })
})
