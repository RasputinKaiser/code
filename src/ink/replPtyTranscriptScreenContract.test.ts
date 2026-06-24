import { afterEach, describe, expect, it } from 'bun:test'
import {
  readVisibleRows,
  expectRowsToContainSubstring,
} from '../testing/replScreenContractHarness.js'
import {
  isPtyAvailableForTests,
  type PtyContractSession,
} from '../testing/ptyContractHarness.js'
import {
  spawnReplPtyFixture,
  waitForReplPtyPrompt,
  type ReplPtyFixture,
} from '../testing/replPtyFixtureHarness.js'
import { waitForFile } from '../testing/replContractHarness.js'

const ptyIt = isPtyAvailableForTests() ? it : it.skip
const liveSessions: PtyContractSession[] = []
const liveFixtures: ReplPtyFixture[] = []

afterEach(async () => {
  while (liveSessions.length > 0) {
    const session = liveSessions.pop()!
    session.terminate()
    await Promise.race([
      session.finished.catch(() => ({ exitCode: -1, stdout: '', stderr: '' })),
      Bun.sleep(500),
    ])
  }

  while (liveFixtures.length > 0) {
    liveFixtures.pop()!.cleanup()
  }
})

async function spawnTranscriptFixture(
  prefix: string,
  scenario: Parameters<typeof spawnReplPtyFixture>[0]['scenario'],
): Promise<ReplPtyFixture> {
  const fixture = spawnReplPtyFixture({
    prefix,
    scenario,
    columns: 60,
    lines: 28,
  })
  liveFixtures.push(fixture)
  liveSessions.push(fixture.session)
  await waitForFile(fixture.readyPath, 8000)
  await waitForReplPtyPrompt(fixture.session, 8000)
  fixture.session.send('\x0f')
  await fixture.session.waitForVisibleText(
    text => text.includes('Showing detailed transcript'),
    8000,
    'real PTY transcript mode',
  )
  return fixture
}

describe('real PTY REPL transcript visible screen contracts', () => {
  ptyIt('keeps wrapped transcript history from splitting words mid-word', async () => {
    const sample =
      "Years passed, and Willowmere thrived in peace and friendship. Mira's herb garden flourished with both ordinary and enchanted plants, and travelers spoke of the kindness of the woman who tended them."

    const fixture = await spawnTranscriptFixture('code-pty-wrap-contract-', {
      initialMessages: [
        { role: 'user', content: 'show transcript' },
        { role: 'assistant', content: sample },
      ],
    })

    const visibleText = await fixture.session.waitForVisibleText(
      text => text.includes('both ordinary'),
      8000,
      'wrapped transcript content in real PTY',
    )

    expect(visibleText).not.toContain('bo\nth')
    expect(visibleText).not.toContain('insi\nde')
    expect(visibleText).toContain('both ordinary')
  }, 15000)

  ptyIt('preserves emoji and CJK characters in real PTY transcript mode', async () => {
    const sample = '😀😀😀😀😀 你好世界 codex-style transcript contract'
    const fixture = await spawnTranscriptFixture('code-pty-unicode-contract-', {
      initialMessages: [
        { role: 'user', content: 'show unicode transcript' },
        { role: 'assistant', content: sample },
      ],
    })

    const visibleText = await fixture.session.waitForVisibleText(
      text => text.includes('你好世界'),
      8000,
      'unicode transcript content in real PTY',
    )

    for (const char of [...sample].filter(char => !/\s/.test(char))) {
      expect(
        visibleText.includes(char),
        `visible PTY transcript is missing glyph ${JSON.stringify(char)}:\n${visibleText}`,
      ).toBe(true)
    }
  }, 15000)

  ptyIt('shows Bash tool use summary and stdout result in real PTY transcript mode', async () => {
    const fixture = await spawnTranscriptFixture('code-pty-tool-contract-', {
      initialMessages: [
        { role: 'user', content: 'show tool transcript' },
        {
          role: 'assistant',
          toolUse: {
            id: 'toolu_bash_contract',
            name: 'Bash',
            input: { command: "printf 'hello from bash\\n'" },
          },
        },
        {
          role: 'user',
          toolResult: {
            toolUseId: 'toolu_bash_contract',
            content: 'completed',
            toolUseResult: {
              stdout: 'hello from bash\n',
              stderr: '',
              interrupted: false,
            },
          },
        },
      ],
    })

    const visibleText = await fixture.session.waitForVisibleText(
      text => text.includes('hello from bash') && text.includes('printf'),
      8000,
      'tool transcript stdout content in real PTY',
    )
    const rows = readVisibleRows(visibleText)

    expectRowsToContainSubstring(rows, 'printf', 'real PTY bash tool use summary')
    expectRowsToContainSubstring(
      rows,
      'hello from bash',
      'real PTY bash tool stdout result',
    )
  }, 15000)

  ptyIt('shows Done for successful Bash tool results with no output in real PTY transcript mode', async () => {
    const fixture = await spawnTranscriptFixture('code-pty-tool-no-output-', {
      initialMessages: [
        { role: 'user', content: 'show no output transcript' },
        {
          role: 'assistant',
          toolUse: {
            id: 'toolu_bash_contract',
            name: 'Bash',
            input: { command: 'mkdir tmp-contract-dir' },
          },
        },
        {
          role: 'user',
          toolResult: {
            toolUseId: 'toolu_bash_contract',
            content: 'completed',
            toolUseResult: {
              stdout: '',
              stderr: '',
              interrupted: false,
              noOutputExpected: true,
            },
          },
        },
      ],
    })

    const visibleText = await fixture.session.waitForVisibleText(
      text => text.includes('Done') && text.includes('mkdir'),
      8000,
      'tool transcript no-output content in real PTY',
    )
    const rows = readVisibleRows(visibleText)

    expectRowsToContainSubstring(rows, 'mkdir', 'real PTY bash tool use summary')
    expectRowsToContainSubstring(rows, 'Done', 'real PTY bash no-output state')
  }, 15000)
})
