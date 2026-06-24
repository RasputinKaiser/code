import { afterEach, describe, it } from 'bun:test'
import {
  expectRowsToContainNormalizedSubstringsInDistinctOrder,
  expectRowsToContainSubstring,
  readVisibleRows,
  rowsContainNormalizedSubstringsInDistinctOrder,
} from '../testing/replScreenContractHarness.js'
import { isPtyAvailableForTests } from '../testing/ptyContractHarness.js'
import {
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

describe('real wrapper PTY transcript contracts', () => {
  ptyIt('enters transcript mode through the self-contained wrapper', async () => {
    const fixture = await spawnSelfContainedWrapperPromptFixture()
    liveFixtures.push(fixture)

    await fixture.session.waitForVisibleRows(
      rows =>
        rowsContainNormalizedSubstringsInDistinctOrder(
          rows,
          fixture.expectedRows,
        ),
      fixture.startupTimeoutMs,
      'self-contained wrapper prompt readiness',
    )

    fixture.session.send('\x0f')

    const visibleRows = await fixture.session.waitForVisibleRows(
      rows =>
        rows.some(
          row =>
            row.includes('Showing detailed transcript') &&
            row.includes('ctrl+o to toggle'),
        ) &&
        rowsContainNormalizedSubstringsInDistinctOrder(rows, [
          fixture.expectedRows[3]!,
        ]),
      8_000,
      'self-contained wrapper transcript mode',
    )

    expectRowsToContainSubstring(
      visibleRows,
      'Showing detailed transcript',
      'self-contained wrapper transcript mode row',
    )
    expectRowsToContainSubstring(
      visibleRows,
      'ctrl+o to toggle',
      'self-contained wrapper transcript toggle hint row',
    )
    expectRowsToContainNormalizedSubstringsInDistinctOrder(
      visibleRows,
      [fixture.expectedRows[3]!],
      'self-contained wrapper transcript status row',
    )
    expectRowsToContainSubstring(
      visibleRows,
      fixture.cwd,
      'self-contained wrapper transcript cwd row',
    )
  }, 30_000)
})
