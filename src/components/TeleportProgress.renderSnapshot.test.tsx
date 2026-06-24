import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import React from 'react'
import {
  cleanupMountedComponent,
  mountMountedComponent,
} from '../testing/mountedComponentHarness.js'
import {
  expectRowsToContainSubstringsInOrder,
  waitForMountedVisibleRows,
} from '../testing/replScreenContractHarness.js'
import { expectTextSnapshot } from '../testing/textSnapshotHarness.js'
import {
  getTeleportProgressVisibleRowContract,
} from '../utils/teleportProgressOutput.js'
import { TeleportProgress } from './TeleportProgress.js'

const ORIGINAL_NO_FLICKER = process.env.CLAUDE_CODE_NO_FLICKER
const ORIGINAL_API_KEY = process.env.ANTHROPIC_API_KEY

beforeEach(() => {
  process.env.CLAUDE_CODE_NO_FLICKER = '1'
  process.env.ANTHROPIC_API_KEY = 'test-key'
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

describe('TeleportProgress rendered snapshots', () => {
  test('renders the teleport progress surface', async () => {
    const sessionId = '019db03b-d85e-7863-a6d7-5a1f170035d4'
    const { ink } = await mountMountedComponent(
      <TeleportProgress currentStep="fetching_branch" sessionId={sessionId} />,
      {
        columns: 80,
        rows: 16,
        settleMs: 0,
        wrapInApp: false,
      },
    )

    const expectedRows = getTeleportProgressVisibleRowContract({
      spinnerFrame: '◐',
      sessionId,
    })

    const rows = await waitForMountedVisibleRows(
      ink,
      visibleRows =>
        expectedRows.every(expectedRow =>
          visibleRows.some(row => row.includes(expectedRow)),
        ),
      {
        timeoutMs: 4000,
        label: 'teleport progress surface',
      },
    )

    expectRowsToContainSubstringsInOrder(
      rows,
      expectedRows,
      'teleport progress visible rows',
    )
    expectTextSnapshot({
      snapshotFileUrl: new URL(
        './snapshots/TeleportProgress.renderSnapshot.test__progress_surface.snap',
        import.meta.url,
      ),
      source: 'src/components/TeleportProgress.renderSnapshot.test.tsx',
      expression: 'progress_surface',
      value: rows.join('\n'),
    })
  })
})
