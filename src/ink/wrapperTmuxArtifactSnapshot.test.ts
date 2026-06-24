import { afterEach, describe, expect, it } from 'bun:test'
import { expectTextSnapshot, normalizeVisibleSurfaceText } from '../testing/textSnapshotHarness.js'
import {
  enterWrapperTmuxTranscriptMode,
  spawnSelfContainedWrapperTmuxOnboardingFixture,
  spawnSelfContainedWrapperTmuxPromptFixture,
  spawnStagingWrapperTmuxPromptFixture,
  waitForWrapperTmuxRows,
  waitForWrapperTmuxTranscriptRows,
  type WrapperTmuxFixture,
} from '../testing/wrapperTmuxHarness.js'
import { isTmuxAvailableForTests } from '../testing/tmuxHarness.js'

const tmuxIt = isTmuxAvailableForTests() ? it : it.skip
const liveFixtures: WrapperTmuxFixture[] = []

afterEach(() => {
  while (liveFixtures.length > 0) {
    liveFixtures.pop()!.cleanup()
  }
})

function snapshotPane(spec: {
  readonly expression: string
  readonly snapshotName: string
  readonly pane: string
}): void {
  const normalizedPane = spec.pane.replaceAll(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g,
    '<session-id>',
  )
  expectTextSnapshot({
    snapshotFileUrl: new URL(`./snapshots/${spec.snapshotName}`, import.meta.url),
    source: 'src/ink/wrapperTmuxArtifactSnapshot.test.ts',
    expression: spec.expression,
    value: normalizeVisibleSurfaceText(normalizedPane),
  })
}

describe('real wrapper tmux artifact snapshots', () => {
  tmuxIt('renders the staging wrapper steady-state prompt surface', async () => {
    const fixture = await spawnStagingWrapperTmuxPromptFixture()
    liveFixtures.push(fixture)

    const pane = await waitForWrapperTmuxRows(
      fixture,
      'staging wrapper tmux steady-state prompt rows',
    )
    expect(fixture.getElapsedMs()).toBeLessThanOrEqual(fixture.startupBudgetMs)

    snapshotPane({
      expression: 'staging_wrapper_prompt_surface',
      snapshotName:
        'wrapperTmuxArtifactSnapshot.test__staging_wrapper_prompt_surface.snap',
      pane,
    })
  }, 30_000)

  tmuxIt('renders the self-contained steady-state prompt surface', async () => {
    const fixture = await spawnSelfContainedWrapperTmuxPromptFixture()
    liveFixtures.push(fixture)

    const pane = await waitForWrapperTmuxRows(
      fixture,
      'self-contained wrapper tmux steady-state prompt rows',
    )
    expect(fixture.getElapsedMs()).toBeLessThanOrEqual(fixture.startupBudgetMs)

    snapshotPane({
      expression: 'self_contained_wrapper_prompt_surface',
      snapshotName:
        'wrapperTmuxArtifactSnapshot.test__self_contained_wrapper_prompt_surface.snap',
      pane,
    })
  }, 30_000)

  tmuxIt('renders the self-contained onboarding surface', async () => {
    const fixture = await spawnSelfContainedWrapperTmuxOnboardingFixture()
    liveFixtures.push(fixture)

    const pane = await waitForWrapperTmuxRows(
      fixture,
      'self-contained wrapper tmux onboarding rows',
    )
    expect(fixture.getElapsedMs()).toBeLessThanOrEqual(fixture.startupBudgetMs)

    snapshotPane({
      expression: 'self_contained_wrapper_onboarding_surface',
      snapshotName:
        'wrapperTmuxArtifactSnapshot.test__self_contained_wrapper_onboarding_surface.snap',
      pane,
    })
  }, 30_000)

  tmuxIt('renders the self-contained transcript surface through the wrapper path', async () => {
    const fixture = await spawnSelfContainedWrapperTmuxPromptFixture()
    liveFixtures.push(fixture)

    await waitForWrapperTmuxRows(
      fixture,
      'self-contained wrapper tmux prompt readiness',
    )
    enterWrapperTmuxTranscriptMode(fixture)
    const pane = await waitForWrapperTmuxTranscriptRows(
      fixture,
      'self-contained wrapper tmux transcript rows',
    )

    snapshotPane({
      expression: 'self_contained_wrapper_transcript_surface',
      snapshotName:
        'wrapperTmuxArtifactSnapshot.test__self_contained_wrapper_transcript_surface.snap',
      pane,
    })
  }, 30_000)
})
