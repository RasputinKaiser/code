import { afterEach, describe, it } from 'bun:test'
import {
  REPL_KEY_SEQUENCES,
  expectPromptInputBlock,
  expectRowsNotToContainSubstring,
  expectRowsToContainSubstring,
  readPromptBand,
  readVisibleRows,
} from '../testing/replScreenContractHarness.js'
import {
  capturePane,
  isTmuxAvailableForTests,
  sendKeys,
  sendLiteral,
} from '../testing/tmuxHarness.js'
import {
  spawnSelfContainedWrapperTmuxPromptFixture,
  waitForWrapperTmuxRows,
  type WrapperTmuxFixture,
} from '../testing/wrapperTmuxHarness.js'

const tmuxIt = isTmuxAvailableForTests() ? it : it.skip
const liveFixtures: WrapperTmuxFixture[] = []

async function waitForPromptRows(
  fixture: WrapperTmuxFixture,
  predicate: (rows: string[]) => boolean,
  timeoutMs = 2_000,
): Promise<string | null> {
  const deadline = Date.now() + timeoutMs
  let pane = ''
  while (Date.now() < deadline) {
    pane = capturePane(fixture.session, { startLine: 0 })
    const promptRows = readVisibleRows(readPromptBand(pane, { rowsBelow: 3 }))
    if (predicate(promptRows)) {
      return pane
    }
    await Bun.sleep(50)
  }
  return null
}

async function enterMultilinePrompt(fixture: WrapperTmuxFixture): Promise<string> {
  let pane = ''
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (attempt > 0) {
      sendKeys(fixture.session, 'C-u')
      await Bun.sleep(100)
    }

    sendLiteral(fixture.session, 'alpha')
    pane =
      (await waitForPromptRows(fixture, rows =>
        rows.some(row => row.includes('alpha')),
      )) ?? pane

    sendLiteral(fixture.session, REPL_KEY_SEQUENCES.shiftEnterKitty)
    await Bun.sleep(150)
    sendLiteral(fixture.session, 'beta')

    const multilinePane = await waitForPromptRows(fixture, rows => {
      const firstRow = rows[0] ?? ''
      return (
        firstRow.includes('❯') &&
        firstRow.includes('alpha') &&
        rows.slice(1).some(row => row.includes('beta'))
      )
    })
    if (multilinePane) {
      return multilinePane
    }

    // Under load, tmux may deliver the literal text before the modified
    // Enter sequence is interpreted. Send another newline+beta rather than
    // failing on a same-line "alphabeta" prompt.
    sendLiteral(fixture.session, REPL_KEY_SEQUENCES.shiftEnterKitty)
    await Bun.sleep(150)
    sendLiteral(fixture.session, 'beta')
    const retryPane = await waitForPromptRows(fixture, rows => {
      const firstRow = rows[0] ?? ''
      return (
        firstRow.includes('❯') &&
        firstRow.includes('alpha') &&
        rows.slice(1).some(row => row.includes('beta'))
      )
    })
    if (retryPane) {
      return retryPane
    }
  }

  return pane || capturePane(fixture.session, { startLine: 0 })
}

afterEach(() => {
  while (liveFixtures.length > 0) {
    liveFixtures.pop()!.cleanup()
  }
})

describe('real wrapper input contracts', () => {
  tmuxIt('inserts a newline on Shift+Enter through the self-contained wrapper without submitting', async () => {
    const fixture = await spawnSelfContainedWrapperTmuxPromptFixture()
    liveFixtures.push(fixture)

    await waitForWrapperTmuxRows(
      fixture,
      'self-contained wrapper tmux prompt readiness',
    )
    await Bun.sleep(1_000)

    const pane = await enterMultilinePrompt(fixture)

    expectPromptInputBlock(pane, ['alpha', 'beta'])
    const visibleRows = readVisibleRows(pane)
    expectRowsToContainSubstring(
      visibleRows,
      '❯',
      'self-contained wrapper multiline prompt row',
    )
    expectRowsToContainSubstring(
      visibleRows,
      'alpha',
      'self-contained wrapper multiline first input row',
    )
    expectRowsNotToContainSubstring(
      visibleRows,
      "Let's get started.",
      'self-contained wrapper multiline visible rows',
    )
    expectRowsNotToContainSubstring(
      visibleRows,
      'Showing detailed transcript',
      'self-contained wrapper multiline visible rows',
    )
  }, 30_000)
})
