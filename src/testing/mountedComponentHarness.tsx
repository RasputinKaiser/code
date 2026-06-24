import React from 'react'
import { type Root, createRoot } from '../ink.js'
import {
  createFakeTerminal,
  getMountedInkProbe,
  installReplPerfEnvironment,
  waitFor,
} from '../ink/replPerfHarness.js'
import { getDefaultAppState, type AppState } from '../state/AppState.js'
import { App } from '../components/App.js'

export type MountedComponentHarnessResult = {
  readonly root: Root
  readonly ink: NonNullable<ReturnType<typeof getMountedInkProbe>>
}

let mountedRoot: Root | null = null

export async function cleanupMountedComponent(): Promise<void> {
  if (mountedRoot) {
    mountedRoot.unmount()
    mountedRoot = null
  }
  await Bun.sleep(0)
}

export async function mountMountedComponent(
  node: React.ReactNode,
  options?: {
    readonly columns?: number
    readonly rows?: number
    readonly settleMs?: number
    readonly wrapInApp?: boolean
    readonly initialState?: AppState
  },
): Promise<MountedComponentHarnessResult> {
  installReplPerfEnvironment()

  const terminal = createFakeTerminal(
    options?.columns ?? 80,
    options?.rows ?? 24,
  )
  let frames = 0

  mountedRoot = await createRoot({
    stdout: terminal.stdout,
    stdin: terminal.stdin,
    stderr: terminal.stderr,
    exitOnCtrlC: false,
    patchConsole: false,
    onFrame: () => {
      frames += 1
    },
  })

  const wrappedNode =
    options?.wrapInApp === false ? (
      node
    ) : (
      <App
        getFpsMetrics={() => undefined}
        initialState={options?.initialState ?? getDefaultAppState()}
      >
        {node}
      </App>
    )

  mountedRoot.render(wrappedNode)
  await waitFor(
    () => frames > 0,
    'mounted component harness never rendered a frame',
  )
  await Bun.sleep(options?.settleMs ?? 120)

  const ink = getMountedInkProbe(terminal)
  if (!ink) {
    throw new Error('mounted component harness never exposed an ink probe')
  }

  return {
    root: mountedRoot,
    ink,
  }
}
