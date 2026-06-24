import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { feature } from 'bun:bundle'
import React from 'react'
import { Box } from '../ink.js'
import {
  cleanupMountedComponent,
  mountMountedComponent,
} from '../testing/mountedComponentHarness.js'
import {
  expectRowsToContainSubstring,
  expectRowsToContainSubstringsInOrder,
  waitForMountedVisibleRows,
} from '../testing/replScreenContractHarness.js'
import { expectTextSnapshot } from '../testing/textSnapshotHarness.js'
import { ThemePicker } from './ThemePicker.js'
import { getThemeOnboardingVisibleRowContract } from '../utils/themeOnboardingOutput.js'

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

describe('ThemePicker rendered onboarding snapshots', () => {
  test('renders the onboarding theme-picker surface', async () => {
    const { ink } = await mountMountedComponent(
      <Box marginX={1}>
        <ThemePicker
          onThemeSelect={() => {}}
          showIntroText={true}
          helpText="To change this later, run /theme"
          hideEscToCancel={true}
          skipExitHandling={true}
        />
      </Box>,
      {
        columns: 80,
        rows: 28,
      },
    )

    const onboardingRows = getThemeOnboardingVisibleRowContract({
      includeAutoTheme: feature('AUTO_THEME') ? true : false,
    })

    const rows = await waitForMountedVisibleRows(
      ink,
      visibleRows =>
        onboardingRows.every(expectedRow =>
          visibleRows.some(row => row.includes(expectedRow)),
        ) &&
        visibleRows.some(row =>
          row.includes('To change this later, run /theme'),
        ),
      {
        timeoutMs: 4000,
        label: 'theme picker onboarding surface',
      },
    )

    expectRowsToContainSubstringsInOrder(
      rows,
      onboardingRows,
      'theme picker onboarding rows',
    )
    expectRowsToContainSubstring(
      rows,
      'To change this later, run /theme',
      'theme picker onboarding help row',
    )
    expectTextSnapshot({
      snapshotFileUrl: new URL(
        './snapshots/ThemePicker.renderSnapshot.test__onboarding_surface.snap',
        import.meta.url,
      ),
      source: 'src/components/ThemePicker.renderSnapshot.test.tsx',
      expression: 'onboarding_surface',
      value: rows.join('\n'),
    })
  })
})
