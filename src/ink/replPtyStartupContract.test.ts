import { afterEach, describe, expect, it } from 'bun:test'
import { existsSync, readFileSync } from 'fs'
import {
  assertInteractionContract,
  expectPromptFooterModules,
  readJsonLines,
  sliceArrayFromIndex,
  sliceStringFromIndex,
  waitForFile,
  type InteractionFrameMetrics,
} from '../testing/replContractHarness.js'
import {
  expectRowsToContainSubstring,
  readVisibleRows,
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

type LoggedFrameEvent = InteractionFrameMetrics

const ptyIt = isPtyAvailableForTests() ? it : it.skip
const liveSessions: PtyContractSession[] = []
const liveFixtures: ReplPtyFixture[] = []

afterEach(async () => {
  while (liveSessions.length > 0) {
    const session = liveSessions.pop()!
    session.terminate()
    await Promise.race([
      session.finished.catch(() => ({
        exitCode: -1,
        stdout: '',
        stderr: '',
      })),
      Bun.sleep(500),
    ])
  }

  while (liveFixtures.length > 0) {
    liveFixtures.pop()!.cleanup()
  }
})

describe('real PTY REPL startup contracts', () => {
  ptyIt('renders the initial prompt footer and transcript through a real PTY', async () => {
    const fixture = spawnReplPtyFixture({ prefix: 'code-pty-startup-' })
    liveFixtures.push(fixture)
    const { readyPath, session } = fixture
    liveSessions.push(session)

    await waitForFile(readyPath, 8000)
    const visibleText = await waitForReplPtyPrompt(session, 8000)
    const visibleRows = readVisibleRows(visibleText)

    expectPromptFooterModules(visibleText, {
      cwdSegment: process.cwd(),
      label: 'real PTY startup footer',
    })
    expectRowsToContainSubstring(visibleRows, '❯', 'real PTY startup prompt row')
  }, 15000)

  ptyIt('toggles transcript mode incrementally through a real PTY', async () => {
    const fixture = spawnReplPtyFixture({ prefix: 'code-pty-transcript-' })
    liveFixtures.push(fixture)
    const { readyPath, frameLogPath, rawOutputPath, session } = fixture
    liveSessions.push(session)

    await waitForFile(readyPath, 8000)
    await waitForReplPtyPrompt(session, 8000)

    let frameCursor = readJsonLines<LoggedFrameEvent>(frameLogPath).length
    let rawCursor = existsSync(rawOutputPath)
      ? readFileSync(rawOutputPath, 'utf8').length
      : 0

    session.send('\x0f')
    const transcriptVisible = await session.waitForVisibleText(
      text => readVisibleRows(text).some(row => row.includes('Showing detailed transcript')),
      8000,
      'real PTY transcript mode',
    )
    const transcriptRows = readVisibleRows(transcriptVisible)

    const transcriptFrames = sliceArrayFromIndex(
      readJsonLines<LoggedFrameEvent>(frameLogPath),
      frameCursor,
    )
    frameCursor = transcriptFrames.nextIndex
    const transcriptOutput = sliceStringFromIndex(
      existsSync(rawOutputPath) ? readFileSync(rawOutputPath, 'utf8') : '',
      rawCursor,
    )
    rawCursor = transcriptOutput.nextIndex

    assertInteractionContract(
      'real PTY transcript toggle',
      transcriptFrames.values,
      transcriptOutput.value,
      { maxBytes: 2400, maxMeasured: 6500, maxVisited: 19000 },
      frame => frame,
    )
    expectRowsToContainSubstring(
      transcriptRows,
      'Showing detailed transcript',
      'real PTY transcript mode banner row',
    )
    expectRowsToContainSubstring(
      transcriptRows,
      'ctrl+o to toggle',
      'real PTY transcript toggle hint row',
    )
    expectPromptFooterModules(transcriptVisible, {
      cwdSegment: process.cwd(),
      label: 'real PTY transcript footer',
    })
  }, 15000)
})
