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

let mockTeleportResumeState: {
  resumeSession: (session: CodeSession) => Promise<unknown>
  isResuming: boolean
  error: { message: string; formattedMessage?: string } | null
  selectedSession: CodeSession | null
}

const hookPaths = [
  import.meta.resolve('../hooks/useTeleportResume.js'),
  import.meta.resolve('../hooks/useTeleportResume.tsx'),
]
const analyticsPaths = [
  import.meta.resolve('src/services/analytics/index.js'),
  import.meta.resolve('src/services/analytics/index.ts'),
]

for (const hookPath of hookPaths) {
  mock.module(hookPath, () => ({
    useTeleportResume: () => mockTeleportResumeState,
  }))
}

for (const analyticsPath of analyticsPaths) {
  mock.module(analyticsPath, () => ({
    logEvent() {},
  }))
}

const { TeleportResumeWrapper } = await import(
  import.meta.resolve('./TeleportResumeWrapper.tsx')
)

const ORIGINAL_NO_FLICKER = process.env.CLAUDE_CODE_NO_FLICKER
const ORIGINAL_API_KEY = process.env.ANTHROPIC_API_KEY

beforeEach(() => {
  process.env.CLAUDE_CODE_NO_FLICKER = '1'
  process.env.ANTHROPIC_API_KEY = 'test-key'
  mockTeleportResumeState = {
    resumeSession: async () => null,
    isResuming: false,
    error: null,
    selectedSession: null,
  }
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

function makeSelectedSession(title: string): CodeSession {
  return {
    id: 'session-123',
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
    updated_at: '2026-04-22T00:00:00Z',
  }
}

function normalizeTeleportResumeRows(rows: string[]): string[] {
  return rows.map(row =>
    row.replace(/^\s\S\sResuming session…$/, ' · Resuming session…'),
  )
}

describe('TeleportResumeWrapper rendered snapshots', () => {
  test('renders the resuming surface', async () => {
    mockTeleportResumeState = {
      resumeSession: async () => null,
      isResuming: true,
      error: null,
      selectedSession: makeSelectedSession('Hotfix deploy'),
    }

    const { ink } = await mountMountedComponent(
      <TeleportResumeWrapper
        onComplete={() => {}}
        onCancel={() => {}}
        source="localCommand"
      />,
      {
        columns: 80,
        rows: 16,
      },
    )

    const rows = await waitForMountedVisibleRows(
      ink,
      visibleRows =>
        visibleRows.some(row => row.includes('Resuming session…')) &&
        visibleRows.some(row => row.includes('Hotfix deploy')),
      {
        timeoutMs: 4000,
        label: 'teleport resume wrapper resuming surface',
      },
    )
    const normalizedRows = normalizeTeleportResumeRows(rows)

    expectRowsToContainSubstringsInDistinctOrder(
      normalizedRows,
      ['Resuming session…', 'Loading "Hotfix deploy"…'],
      'teleport resume wrapper resuming rows',
    )

    expectTextSnapshot({
      snapshotFileUrl: new URL(
        './snapshots/TeleportResumeWrapper.renderSnapshot.test__resuming_surface.snap',
        import.meta.url,
      ),
      source: 'src/components/TeleportResumeWrapper.renderSnapshot.test.tsx',
      expression: 'resuming_surface',
      value: normalizedRows.join('\n'),
    })
  })

  test('renders the resume-error surface', async () => {
    mockTeleportResumeState = {
      resumeSession: async () => null,
      isResuming: false,
      error: {
        message: 'Session expired',
      },
      selectedSession: null,
    }

    const { ink } = await mountMountedComponent(
      <TeleportResumeWrapper
        onComplete={() => {}}
        onCancel={() => {}}
        source="localCommand"
      />,
      {
        columns: 80,
        rows: 16,
      },
    )

    const rows = await waitForMountedVisibleRows(
      ink,
      visibleRows =>
        visibleRows.some(row => row.includes('Failed to resume session')) &&
        visibleRows.some(row => row.includes('Session expired')),
      {
        timeoutMs: 4000,
        label: 'teleport resume wrapper error surface',
      },
    )

    expectRowsToContainSubstringsInDistinctOrder(
      rows,
      ['Failed to resume session', 'Session expired', 'Press Esc to cancel'],
      'teleport resume wrapper error rows',
    )

    expectTextSnapshot({
      snapshotFileUrl: new URL(
        './snapshots/TeleportResumeWrapper.renderSnapshot.test__error_surface.snap',
        import.meta.url,
      ),
      source: 'src/components/TeleportResumeWrapper.renderSnapshot.test.tsx',
      expression: 'error_surface',
      value: rows.join('\n'),
    })
  })
})
