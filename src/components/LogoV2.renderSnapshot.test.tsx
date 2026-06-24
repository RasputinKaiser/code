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

const logoUtilsPaths = [
  import.meta.resolve('../utils/logoV2Utils.js'),
  import.meta.resolve('../utils/logoV2Utils.ts'),
]
const configPaths = [
  import.meta.resolve('src/utils/config.js'),
  import.meta.resolve('src/utils/config.ts'),
]
const settingsPaths = [
  import.meta.resolve('src/utils/settings/settings.js'),
  import.meta.resolve('src/utils/settings/settings.ts'),
]
const debugPaths = [
  import.meta.resolve('src/utils/debug.js'),
  import.meta.resolve('src/utils/debug.ts'),
]
const releaseNotePaths = [
  import.meta.resolve('../utils/releaseNotes.js'),
  import.meta.resolve('../utils/releaseNotes.ts'),
]
const projectOnboardingPaths = [
  import.meta.resolve('../projectOnboardingState.js'),
  import.meta.resolve('../projectOnboardingState.ts'),
]
const guestPassPaths = [
  import.meta.resolve('./LogoV2/GuestPassesUpsell.js'),
  import.meta.resolve('./LogoV2/GuestPassesUpsell.tsx'),
]
const overagePaths = [
  import.meta.resolve('./LogoV2/OverageCreditUpsell.js'),
  import.meta.resolve('./LogoV2/OverageCreditUpsell.tsx'),
]
const mainLoopModelPaths = [
  import.meta.resolve('../hooks/useMainLoopModel.js'),
  import.meta.resolve('../hooks/useMainLoopModel.ts'),
]

const actualLogoUtils = await import(import.meta.resolve('../utils/logoV2Utils.ts'))

for (const logoUtilsPath of logoUtilsPaths) {
  mock.module(logoUtilsPath, () => ({
    ...actualLogoUtils,
    getRecentActivitySync() {
      return []
    },
    getRecentReleaseNotesSync() {
      return []
    },
    getLogoDisplayData() {
      return {
        version: '0.1.0',
        cwd: process.cwd(),
        billingType: 'pro',
        agentName: '',
      }
    },
  }))
}

for (const configPath of configPaths) {
  mock.module(configPath, () => ({
    getGlobalConfig() {
      return {
        oauthAccount: {
          displayName: 'Nina',
          organizationName: 'Noumena',
        },
        numStartups: 1,
        lastReleaseNotesSeen: '0.1.0',
      }
    },
    saveGlobalConfig() {},
  }))
}

for (const settingsPath of settingsPaths) {
  mock.module(settingsPath, () => ({
    getInitialSettings() {
      return {
        companyAnnouncements: [],
      }
    },
  }))
}

for (const debugPath of debugPaths) {
  mock.module(debugPath, () => ({
    isDebugMode() {
      return false
    },
    isDebugToStdErr() {
      return false
    },
    getDebugLogPath() {
      return '/tmp/code-debug.log'
    },
  }))
}

for (const releaseNotePath of releaseNotePaths) {
  mock.module(releaseNotePath, () => ({
    checkForReleaseNotesSync() {
      return { hasReleaseNotes: false }
    },
  }))
}

for (const projectOnboardingPath of projectOnboardingPaths) {
  mock.module(projectOnboardingPath, () => ({
    getSteps() {
      return []
    },
    shouldShowProjectOnboarding() {
      return false
    },
    incrementProjectOnboardingSeenCount() {},
  }))
}

for (const guestPassPath of guestPassPaths) {
  mock.module(guestPassPath, () => ({
    GuestPassesUpsell() {
      return null
    },
    incrementGuestPassesSeenCount() {},
    useShowGuestPassesUpsell() {
      return false
    },
  }))
}

for (const overagePath of overagePaths) {
  mock.module(overagePath, () => ({
    OverageCreditUpsell() {
      return null
    },
    createOverageCreditFeed() {
      return []
    },
    incrementOverageCreditUpsellSeenCount() {},
    useShowOverageCreditUpsell() {
      return false
    },
  }))
}

for (const mainLoopModelPath of mainLoopModelPaths) {
  mock.module(mainLoopModelPath, () => ({
    useMainLoopModel() {
      return 'claude-sonnet-4-6'
    },
  }))
}

const { CondensedLogo } = await import(
  import.meta.resolve('./LogoV2/CondensedLogo.tsx')
)
const { LogoV2 } = await import(import.meta.resolve('./LogoV2/LogoV2.tsx'))

const ORIGINAL_NO_FLICKER = process.env.CLAUDE_CODE_NO_FLICKER
const ORIGINAL_API_KEY = process.env.ANTHROPIC_API_KEY
const ORIGINAL_BUILD_MODE = process.env.NCODE_BUILD_MODE
const ORIGINAL_DEMO_VERSION = process.env.DEMO_VERSION
const ORIGINAL_FORCE_FULL_LOGO = process.env.CLAUDE_CODE_FORCE_FULL_LOGO

beforeEach(() => {
  process.env.CLAUDE_CODE_NO_FLICKER = '1'
  process.env.ANTHROPIC_API_KEY = 'test-key'
  process.env.NCODE_BUILD_MODE = 'noumena'
  process.env.DEMO_VERSION = '1'
  delete process.env.CLAUDE_CODE_FORCE_FULL_LOGO
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

  if (ORIGINAL_BUILD_MODE === undefined) {
    delete process.env.NCODE_BUILD_MODE
  } else {
    process.env.NCODE_BUILD_MODE = ORIGINAL_BUILD_MODE
  }

  if (ORIGINAL_DEMO_VERSION === undefined) {
    delete process.env.DEMO_VERSION
  } else {
    process.env.DEMO_VERSION = ORIGINAL_DEMO_VERSION
  }

  if (ORIGINAL_FORCE_FULL_LOGO === undefined) {
    delete process.env.CLAUDE_CODE_FORCE_FULL_LOGO
  } else {
    process.env.CLAUDE_CODE_FORCE_FULL_LOGO = ORIGINAL_FORCE_FULL_LOGO
  }
})

describe('startup logo rendered snapshots', () => {
  test('renders the condensed startup surface', async () => {
    const { ink } = await mountMountedComponent(<CondensedLogo />, {
      columns: 90,
      rows: 18,
    })

    const rows = await waitForMountedVisibleRows(
      ink,
      visibleRows =>
        visibleRows.some(row => row.includes('Code v0.1.0')) &&
        visibleRows.some(row => row.includes('Sonnet 4.6')) &&
        visibleRows.some(row => row.includes(process.cwd())),
      {
        timeoutMs: 4000,
        label: 'condensed startup logo surface',
      },
    )

    expectRowsToContainSubstringsInDistinctOrder(
      rows,
      ['Code v0.1.0', 'Sonnet 4.6', process.cwd()],
      'condensed startup rows',
    )

    expectTextSnapshot({
      snapshotFileUrl: new URL(
        './snapshots/LogoV2.renderSnapshot.test__condensed_surface.snap',
        import.meta.url,
      ),
      source: 'src/components/LogoV2.renderSnapshot.test.tsx',
      expression: 'condensed_surface',
      value: rows.join('\n'),
    })
  })

  test('renders the forced full-logo startup surface', async () => {
    process.env.CLAUDE_CODE_FORCE_FULL_LOGO = '1'

    const { ink } = await mountMountedComponent(<LogoV2 />, {
      columns: 120,
      rows: 34,
      settleMs: 240,
    })

    const rows = await waitForMountedVisibleRows(
      ink,
      visibleRows =>
        visibleRows.some(row => row.includes('Welcome back Nina!')) &&
        visibleRows.some(row => row.includes('Code v0.1.0')) &&
        visibleRows.some(row => row.includes(process.cwd())),
      {
        timeoutMs: 4000,
        label: 'full startup logo surface',
      },
    )

    expectRowsToContainSubstringsInDistinctOrder(
      rows,
      ['Code v0.1.0', 'Welcome back Nina!', process.cwd()],
      'full startup rows',
    )

    expectTextSnapshot({
      snapshotFileUrl: new URL(
        './snapshots/LogoV2.renderSnapshot.test__full_surface.snap',
        import.meta.url,
      ),
      source: 'src/components/LogoV2.renderSnapshot.test.tsx',
      expression: 'full_surface',
      value: rows.join('\n'),
    })
  })
})
