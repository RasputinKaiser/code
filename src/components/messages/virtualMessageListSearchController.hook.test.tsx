import { afterEach, describe, expect, it, mock } from 'bun:test'
import React, { useEffect, useRef } from 'react'
import { PassThrough } from 'stream'
import { createRoot, type Root } from '../../ink/root.js'
import type { ScrollBoxHandle } from '../../ink/components/ScrollBox.js'
import type { DOMElement } from '../../ink/dom.js'
import type { MatchPosition } from '../../ink/render-to-screen.js'
import type { RenderableMessage } from '../../types/message.js'
import {
  createUserMessage,
  getContentText,
} from '../../utils/messages.js'
import { findNearestSearchMatchPointer } from './virtualMessageListSearchState.js'
import {
  useVirtualMessageListSearchJumpController,
  type VirtualMessageListJumpState,
  type VirtualMessageListSearchHandle,
} from './virtualMessageListSearchController.js'

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

function lowerText(message: RenderableMessage): string {
  return getContentText(message.message.content)?.toLowerCase() ?? ''
}

function SearchJumpHarness({
  jumpState,
  scrollRef,
  scanElement,
  setPositions,
  onSearchMatchesChange,
  onReady,
}: {
  jumpState: React.MutableRefObject<VirtualMessageListJumpState>
  scrollRef: React.RefObject<ScrollBoxHandle | null>
  scanElement: (element: DOMElement) => MatchPosition[]
  setPositions: (
    value:
      | null
      | {
          positions: MatchPosition[]
          rowOffset: number
          currentIdx: number
        },
  ) => void
  onSearchMatchesChange: (total: number, current: number) => void
  onReady: (handle: VirtualMessageListSearchHandle) => void
}): React.ReactNode {
  const handle = useVirtualMessageListSearchJumpController({
    jumpState,
    scrollRef,
    extractSearchText: lowerText,
    scanElement,
    setPositions,
    onSearchMatchesChange,
    findNearestMatchPointer: findNearestSearchMatchPointer,
    headroom: 3,
  })

  useEffect(() => {
    onReady(handle)
  }, [handle, onReady])

  return null
}

describe('useVirtualMessageListSearchJumpController', () => {
  it('retries a pending seek after scrollToIndex mounts the matched message', async () => {
    const stdin = createFakeInput()
    const stdout = createFakeOutput(80, 24)
    const stderr = createFakeOutput(80, 24)

    const messages = [
      createUserMessage({ content: 'alpha' }),
      createUserMessage({ content: 'assistant target' }),
      createUserMessage({ content: 'omega' }),
    ]
    const positions = [{ row: 1, col: 2, len: 6 }]
    const scanElement = mock(() => positions)
    const setPositions = mock(() => {})
    const onSearchMatchesChange = mock(() => {})
    const scrollTo = mock(() => {})

    let mountedElement: DOMElement | null = null
    const fakeElement = {
      yogaNode: {
        getComputedHeight: () => 4,
      },
    } as unknown as DOMElement

    const jumpState = {
      current: {
        offsets: new Float64Array([0, 10, 20]),
        start: 0,
        getItemElement: (index: number) => (index === 1 ? mountedElement : null),
        getItemTop: (index: number) => index * 10,
        messages,
        scrollToIndex: mock((index: number) => {
          if (index === 1) {
            mountedElement = fakeElement
          }
        }),
      },
    } as React.MutableRefObject<VirtualMessageListJumpState>

    const scrollRef = {
      current: {
        scrollTo,
        getViewportTop: () => 0,
        getScrollTop: () => 0,
        getViewportHeight: () => 20,
      } as unknown as ScrollBoxHandle,
    }

    const handleRef = { current: null as VirtualMessageListSearchHandle | null }

    liveRoot = await createRoot({
      stdout,
      stdin,
      stderr,
      exitOnCtrlC: false,
      patchConsole: false,
    })

    liveRoot.render(
      <SearchJumpHarness
        jumpState={jumpState}
        scrollRef={scrollRef}
        scanElement={scanElement}
        setPositions={setPositions}
        onSearchMatchesChange={onSearchMatchesChange}
        onReady={handle => {
          handleRef.current = handle
        }}
      />,
    )

    await waitFor(
      () => handleRef.current !== null,
      'search jump handle never became ready',
    )

    handleRef.current!.setSearchQuery('assistant')

    await waitFor(
      () => scanElement.mock.calls.length > 0,
      'search seek never retried after mounting the matched message',
    )

    expect(jumpState.current.scrollToIndex).toHaveBeenCalledWith(1)
    expect(scanElement).toHaveBeenCalledWith(fakeElement)
    expect(scrollTo).toHaveBeenCalledWith(7)
    expect(setPositions).toHaveBeenCalledWith({
      positions,
      rowOffset: 10,
      currentIdx: 0,
    })
    expect(onSearchMatchesChange).toHaveBeenLastCalledWith(1, 1)
  })
})
