import { afterEach, describe, expect, it } from 'bun:test'
import { existsSync, readFileSync } from 'fs'
import {
  attachTmuxClient,
  capturePane,
  capturePaneFrame,
  destroyIsolatedTmuxSession,
  detachTmuxClient,
  isTmuxAvailableForTests,
  sendKeys,
  sendLiteral,
  type IsolatedTmuxSession,
} from '../testing/tmuxHarness.js'
import {
  assertInteractionContract,
  expectPromptFooterModules,
  parseMatchCounter,
  readJsonLines,
  sliceArrayFromIndex,
  sliceStringFromIndex,
  waitForFile,
  waitForText,
  type InteractionFrameMetrics,
} from '../testing/replContractHarness.js'
import {
  spawnReplTmuxFixture,
  waitForReplTmuxPrompt,
  type ReplTmuxFixture,
} from '../testing/replTmuxFixtureHarness.js'

type LoggedFrameEvent = InteractionFrameMetrics

const tmuxIt = isTmuxAvailableForTests() ? it : it.skip
const liveSessions: IsolatedTmuxSession[] = []
const liveFixtures: ReplTmuxFixture[] = []

afterEach(() => {
  while (liveFixtures.length > 0) {
    liveFixtures.pop()!.cleanup()
  }
  while (liveSessions.length > 0) {
    destroyIsolatedTmuxSession(liveSessions.pop()!)
  }
})

describe('tmux REPL interaction flicker lane', () => {
  tmuxIt('keeps transcript toggle and search navigation incremental through an attached tmux client', async () => {
    const fixture = spawnReplTmuxFixture({
      prefix: 'code-tmux-repl-trace-',
      columns: 80,
      lines: 24,
    })
    liveFixtures.push(fixture)
    const { readyPath, frameLogPath, rawOutputPath, session } = fixture

    await waitForFile(readyPath, 10_000)
    await waitForText(
      () => capturePane(session, { startLine: -120 }),
      pane => pane.includes('assistant-79') || pane.includes('user-79'),
      { timeoutMs: 6000, label: 'fixture transcript to render' },
    )
    const initialPane = capturePane(session, { startLine: -120 })
    expectPromptFooterModules(initialPane, {
      cwdSegment: process.cwd(),
      label: 'initial tmux prompt footer',
    })
    expect(initialPane.replace(/\s+/g, ' ').trim()).not.toContain('/ for commands')

    const client = await attachTmuxClient(session)
    try {
      let frameCursor = readJsonLines<LoggedFrameEvent>(frameLogPath).length
      let rawCursor = existsSync(rawOutputPath)
        ? readFileSync(rawOutputPath, 'utf8').length
        : 0

      sendKeys(session, 'C-o')
      await Bun.sleep(140)
      const transcriptPane = await waitForText(
        () => capturePane(session, { startLine: -120 }),
        pane => pane.includes('Showing detailed transcript'),
        { timeoutMs: 6000, label: 'transcript mode' },
      )
      const transcriptFrame = capturePaneFrame(session, 'transcript', {
        startLine: -120,
      })
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
        'tmux transcript toggle',
        transcriptFrames.values,
        transcriptOutput.value,
        { maxBytes: 2200, maxMeasured: 6000, maxVisited: 18000 },
        frame => frame,
      )
      expect(transcriptPane).toContain('Showing detailed transcript')
      expect(transcriptFrame.pane).toContain('ctrl+o to toggle')
      expectPromptFooterModules(transcriptFrame.pane, {
        cwdSegment: process.cwd(),
        label: 'tmux transcript footer',
      })

      sendKeys(session, '/')
      await Bun.sleep(50)
      sendLiteral(session, 'assistant')
      await Bun.sleep(80)
      sendKeys(session, 'Enter')
      await Bun.sleep(180)
      const searchPane = await waitForText(
        () => capturePane(session, { startLine: -120 }),
        pane => parseMatchCounter(pane) !== null,
        { timeoutMs: 6000, label: 'transcript search counter' },
      )
      const searchCounter = parseMatchCounter(searchPane)
      const searchFrames = sliceArrayFromIndex(
        readJsonLines<LoggedFrameEvent>(frameLogPath),
        frameCursor,
      )
      frameCursor = searchFrames.nextIndex
      const searchOutput = sliceStringFromIndex(
        existsSync(rawOutputPath) ? readFileSync(rawOutputPath, 'utf8') : '',
        rawCursor,
      )
      rawCursor = searchOutput.nextIndex

      assertInteractionContract(
        'tmux transcript search',
        searchFrames.values,
        searchOutput.value,
        { maxBytes: 2200, maxMeasured: 5500, maxVisited: 17000 },
        frame => frame,
      )
      expect(searchCounter).not.toBeNull()
      expect(searchCounter!.current).toBeGreaterThan(0)
      expect(searchCounter!.total).toBeGreaterThan(1)
      expect(searchPane).toContain('n/N')
      expectPromptFooterModules(searchPane, {
        cwdSegment: process.cwd(),
        label: 'tmux search footer',
      })

      sendKeys(session, 'n')
      await Bun.sleep(160)
      const navigatePane = await waitForText(
        () => capturePane(session, { startLine: -120 }),
        pane => {
          const counter = parseMatchCounter(pane)
          return counter !== null && counter.current >= 2
        },
        { timeoutMs: 6000, label: 'next transcript match' },
      )
      const navigateCounter = parseMatchCounter(navigatePane)
      const navigateFrames = sliceArrayFromIndex(
        readJsonLines<LoggedFrameEvent>(frameLogPath),
        frameCursor,
      )
      frameCursor = navigateFrames.nextIndex
      const navigateOutput = sliceStringFromIndex(
        existsSync(rawOutputPath) ? readFileSync(rawOutputPath, 'utf8') : '',
        rawCursor,
      )
      rawCursor = navigateOutput.nextIndex

      assertInteractionContract(
        'tmux next-match navigation',
        navigateFrames.values,
        navigateOutput.value,
        { maxBytes: 1600, maxMeasured: 4500, maxVisited: 15000 },
        frame => frame,
      )
      expect(navigateCounter).not.toBeNull()
      expect(navigateCounter!.current).not.toBe(searchCounter!.current)
      expect(navigateCounter!.total).toBe(searchCounter!.total)
      expectPromptFooterModules(navigatePane, {
        cwdSegment: process.cwd(),
        label: 'tmux next-match footer',
      })

      const paneHistory = capturePane(session, { startLine: -300 })
      expect(paneHistory).not.toContain('Conversationdcompacted')
      expect(paneHistory).not.toContain('Searched/for')
      expect(paneHistory).not.toContain('readc')
      expect(paneHistory).not.toContain('n/Ntonavigate')
    } finally {
      await detachTmuxClient(session, client)
    }
  }, 15000)

  tmuxIt('executes !ls in bash mode through a real tmux REPL', async () => {
    const fixture = spawnReplTmuxFixture({
      prefix: 'code-tmux-repl-bash-typed-',
      columns: 100,
      lines: 24,
      scenario: { initialMessages: [] },
    })
    liveFixtures.push(fixture)
    const { session } = fixture

    await waitForFile(fixture.readyPath)
    await waitForReplTmuxPrompt(fixture, 8000)

    sendLiteral(session, '!ls')
    await waitForText(
      () => capturePane(session, { startLine: -80 }),
      pane => pane.includes('ls'),
      { timeoutMs: 3000, label: 'typed !ls visible in tmux REPL prompt' },
    )

    sendKeys(session, 'Enter')

    const pane = await waitForText(
      () => capturePane(session, { startLine: -120 }),
      text =>
        (text.includes('package.json') || text.includes('src')) &&
        text.includes('⎿'),
      { timeoutMs: 8000, label: 'tmux REPL !ls bash output' },
    )

    expect(pane).toContain('⎿')
  }, 15_000)

})
