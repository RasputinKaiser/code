import { afterEach, describe, expect, it } from 'bun:test'
import {
  expectRowsToContainNormalizedSubstringsInDistinctOrder,
  rowsContainNormalizedSubstringsInDistinctOrder,
} from '../testing/replScreenContractHarness.js'
import { isPtyAvailableForTests } from '../testing/ptyContractHarness.js'
import {
  spawnSelfContainedWrapperOnboardingFixture,
  spawnSelfContainedWrapperPromptFixture,
  type WrapperPtyFixture,
} from '../testing/wrapperPtyHarness.js'

const ptyIt = isPtyAvailableForTests() ? it : it.skip
const liveFixtures: WrapperPtyFixture[] = []

afterEach(async () => {
  while (liveFixtures.length > 0) {
    const fixture = liveFixtures.pop()!
    fixture.cleanup()
    await Promise.race([
      fixture.session.finished.catch(() => ({
        exitCode: -1,
        stdout: '',
        stderr: '',
      })),
      Bun.sleep(500),
    ])
  }
})

describe('real self-contained wrapper PTY startup contracts', () => {
  ptyIt('renders the steady-state prompt through ncode-staging-self-contained', async () => {
    const fixture = await spawnSelfContainedWrapperPromptFixture()
    liveFixtures.push(fixture)

    const rows = await fixture.session.waitForVisibleRows(
      visibleRows =>
        rowsContainNormalizedSubstringsInDistinctOrder(
          visibleRows,
          fixture.expectedRows,
        ),
      fixture.startupTimeoutMs,
      'self-contained wrapper steady-state prompt rows',
    )

    expectRowsToContainNormalizedSubstringsInDistinctOrder(
      rows,
      fixture.expectedRows,
      'self-contained wrapper steady-state prompt rows',
    )
    expect(fixture.getElapsedMs()).toBeLessThanOrEqual(fixture.startupBudgetMs)
  }, 30_000)

  ptyIt('renders the onboarding surface through ncode-staging-self-contained with a fresh config dir', async () => {
    const fixture = await spawnSelfContainedWrapperOnboardingFixture()
    liveFixtures.push(fixture)

    const rows = await fixture.session.waitForVisibleRows(
      visibleRows =>
        rowsContainNormalizedSubstringsInDistinctOrder(
          visibleRows,
          fixture.expectedRows,
        ),
      fixture.startupTimeoutMs,
      'self-contained wrapper onboarding rows',
    )

    expectRowsToContainNormalizedSubstringsInDistinctOrder(
      rows,
      fixture.expectedRows,
      'self-contained wrapper onboarding rows',
    )
    expect(fixture.getElapsedMs()).toBeLessThanOrEqual(fixture.startupBudgetMs)
  }, 30_000)
})
