import { afterEach, describe, expect, it } from 'bun:test'
import React, { useEffect, useState } from 'react'
import { PassThrough } from 'stream'
import { createRoot, type Root } from '../../ink/root.js'
import {
  AppStateProvider,
  getDefaultAppState,
  useAppState,
} from '../../state/AppState.js'
import { usePromptInputFooterController } from './usePromptInputFooterController.js'

type FakeInput = PassThrough &
  NodeJS.ReadStream & {
    isTTY: boolean
    isRaw: boolean
    setRawMode: (raw: boolean) => void
    ref: () => FakeInput
    unref: () => FakeInput
  }

type FakeOutput = PassThrough &
  NodeJS.WriteStream & {
    isTTY: boolean
    columns: number
    rows: number
    getWindowSize: () => [number, number]
  }

type FooterHarnessHandle = {
  selectFooterItem: (item: 'tasks' | 'tmux' | 'bagel' | 'teams' | 'bridge' | 'companion' | null) => void
  getSnapshot: () => {
    footerSelection: string | null
    footerItemSelected: string | null
    teammateFooterIndex: number
    coordinatorTaskIndex: number
    footerItems: string[]
  }
}

let liveRoot: Root | null = null

afterEach(async () => {
  if (liveRoot) {
    liveRoot.unmount()
    liveRoot = null
  }
  await Bun.sleep(0)
})

function createFakeInput(): FakeInput {
  const stdin = new PassThrough() as FakeInput
  stdin.isTTY = true
  stdin.isRaw = false
  stdin.setRawMode = (raw: boolean) => {
    stdin.isRaw = raw
  }
  stdin.ref = () => stdin
  stdin.unref = () => stdin
  return stdin
}

function createFakeOutput(columns: number, rows: number): FakeOutput {
  const stdout = new PassThrough() as FakeOutput
  stdout.isTTY = true
  stdout.columns = columns
  stdout.rows = rows
  stdout.getWindowSize = () => [columns, rows]
  return stdout
}

async function waitFor(
  predicate: () => boolean,
  message: string,
  timeoutMs = 1500,
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (predicate()) return
    await Bun.sleep(10)
  }
  throw new Error(message)
}

function FooterControllerHarness({
  bridgeFooterVisible,
  tasks = {},
  coordinatorTaskCount = 0,
  onReady,
}: {
  bridgeFooterVisible: boolean
  tasks?: Record<string, never>
  coordinatorTaskCount?: number
  onReady: (handle: FooterHarnessHandle) => void
}): React.ReactNode {
  const footerSelection = useAppState(state => state.footerSelection)
  const [teammateFooterIndex, setTeammateFooterIndex] = useState(7)
  const [coordinatorTaskIndex, setCoordinatorTaskIndex] = useState(9)
  const controller = usePromptInputFooterController({
    tasks,
    coordinatorTaskCount,
    showSpinnerTree: false,
    tmuxFooterVisible: false,
    bagelFooterVisible: false,
    teamsFooterVisible: false,
    bridgeFooterVisible,
    companionFooterVisible: false,
    minCoordinatorIndex: -1,
    setTeammateFooterIndex,
    setCoordinatorTaskIndex,
  })

  useEffect(() => {
    onReady({
      selectFooterItem: controller.selectFooterItem,
      getSnapshot: () => ({
        footerSelection,
        footerItemSelected: controller.footerItemSelected,
        teammateFooterIndex,
        coordinatorTaskIndex,
        footerItems: controller.footerItems,
      }),
    })
  }, [
    controller,
    footerSelection,
    teammateFooterIndex,
    coordinatorTaskIndex,
    onReady,
  ])

  return null
}

describe('usePromptInputFooterController', () => {
  it('clears stale raw footer selection when the selected pill is no longer visible', async () => {
    const stdin = createFakeInput()
    const stdout = createFakeOutput(80, 24)
    const stderr = createFakeOutput(80, 24)
    const handleRef = { current: null as FooterHarnessHandle | null }

    liveRoot = await createRoot({
      stdout,
      stdin,
      stderr,
      exitOnCtrlC: false,
      patchConsole: false,
    })

    liveRoot.render(
      <AppStateProvider
        initialState={{
          ...getDefaultAppState(),
          footerSelection: 'bridge',
        }}
      >
        <FooterControllerHarness
          bridgeFooterVisible={false}
          onReady={handle => {
            handleRef.current = handle
          }}
        />
      </AppStateProvider>,
    )

    await waitFor(
      () => handleRef.current !== null,
      'footer controller handle never became ready',
    )
    await waitFor(
      () => handleRef.current!.getSnapshot().footerSelection === null,
      'stale footer selection was not cleared',
    )

    expect(handleRef.current!.getSnapshot()).toMatchObject({
      footerSelection: null,
      footerItemSelected: null,
      footerItems: [],
    })
  })

  it('preserves tasks selection reset behavior through the hook boundary', async () => {
    const stdin = createFakeInput()
    const stdout = createFakeOutput(80, 24)
    const stderr = createFakeOutput(80, 24)
    const handleRef = { current: null as FooterHarnessHandle | null }
    const visibleTasks = {
      'task-1': {
        id: 'task-1',
        type: 'local_workflow',
        status: 'running',
        isBackgrounded: true,
      },
    } as Record<string, never>

    liveRoot = await createRoot({
      stdout,
      stdin,
      stderr,
      exitOnCtrlC: false,
      patchConsole: false,
    })

    liveRoot.render(
      <AppStateProvider initialState={getDefaultAppState()}>
        <FooterControllerHarness
          bridgeFooterVisible={true}
          tasks={visibleTasks}
          onReady={handle => {
            handleRef.current = handle
          }}
        />
      </AppStateProvider>,
    )

    await waitFor(
      () => handleRef.current !== null,
      'footer controller handle never became ready',
    )

    handleRef.current!.selectFooterItem('tasks')

    await waitFor(
      () => handleRef.current!.getSnapshot().footerSelection === 'tasks',
      'tasks selection never propagated through app state',
    )

    expect(handleRef.current!.getSnapshot()).toMatchObject({
      footerSelection: 'tasks',
      footerItemSelected: 'tasks',
      teammateFooterIndex: 0,
      coordinatorTaskIndex: -1,
    })
  })
})
