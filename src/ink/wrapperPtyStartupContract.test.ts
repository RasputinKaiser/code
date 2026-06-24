import { afterEach, describe, expect, it } from 'bun:test'
import {
  expectRowsNotToContainSubstring,
  expectRowsToContainNormalizedSubstringsInDistinctOrder,
  rowsContainNormalizedSubstringsInDistinctOrder,
} from '../testing/replScreenContractHarness.js'
import { isPtyAvailableForTests } from '../testing/ptyContractHarness.js'
import {
  spawnStagingWrapperPromptFixture,
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

describe('real wrapper PTY startup contracts', () => {
  ptyIt('renders the steady-state prompt through ncode-staging with compiled-binary override', async () => {
    const fixture = await spawnStagingWrapperPromptFixture()
    liveFixtures.push(fixture)

    const rows = await fixture.session.waitForVisibleRows(
      visibleRows =>
        rowsContainNormalizedSubstringsInDistinctOrder(
          visibleRows,
          fixture.expectedRows,
        ),
      fixture.startupTimeoutMs,
      'staging wrapper steady-state prompt rows',
    )

    expectRowsToContainNormalizedSubstringsInDistinctOrder(
      rows,
      fixture.expectedRows,
      'staging wrapper steady-state prompt rows',
    )
    expectRowsNotToContainSubstring(
      rows,
      "Let's get started.",
      'staging wrapper startup rows',
    )
    expect(fixture.getElapsedMs()).toBeLessThanOrEqual(fixture.startupBudgetMs)
  }, 30_000)
})
