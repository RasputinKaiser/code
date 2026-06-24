import { describe, expect, it } from 'bun:test'
import type { RenderableMessage } from '../../types/message.js'
import {
  computeDividerBeforeIndex,
  computeSelectedIndex,
  computeSliceStart,
  selectRenderableMessages,
  type SliceAnchor,
} from './useTranscriptViewModel.js'

function msg(uuid: string): RenderableMessage {
  return {
    type: 'assistant',
    uuid,
    message: { content: [] },
  } as unknown as RenderableMessage
}

describe('useTranscriptViewModel helpers', () => {
  it('applies cap slicing with monotonic slice anchors', () => {
    const collapsed = [
      msg('m-0'),
      msg('m-1'),
      msg('m-2'),
      msg('m-3'),
      msg('m-4'),
      msg('m-5'),
    ]
    const anchorRef: { current: SliceAnchor } = { current: null }
    const start = computeSliceStart(collapsed, anchorRef, 3, 1)
    expect(start).toBe(3)
    expect(anchorRef.current).toEqual({ uuid: 'm-3', idx: 3 })

    const nextCollapsed = [...collapsed, msg('m-6')]
    const nextStart = computeSliceStart(nextCollapsed, anchorRef, 3, 1)
    expect(nextStart).toBe(3)
    expect(anchorRef.current).toEqual({ uuid: 'm-3', idx: 3 })
  })

  it('gives renderRange precedence over cap slicing', () => {
    const collapsed = [
      msg('m-0'),
      msg('m-1'),
      msg('m-2'),
      msg('m-3'),
      msg('m-4'),
    ]
    const anchorRef: { current: SliceAnchor } = { current: null }
    const selected = selectRenderableMessages(collapsed, {
      virtualScrollRuntimeGate: false,
      disableRenderCap: false,
      cap: 2,
      step: 1,
      anchorRef,
      renderRange: [1, 3],
    })
    expect(selected.map(m => m.uuid)).toEqual(['m-1', 'm-2'])
  })

  it('derives unseen divider and selected indices from renderable messages', () => {
    const renderable = [
      msg('aaaaaaaaaaaaaaaaaaaaaaaa-0'),
      msg('bbbbbbbbbbbbbbbbbbbbbbbb-1'),
      msg('cccccccccccccccccccccccc-2'),
    ]
    expect(
      computeDividerBeforeIndex(
        {
          firstUnseenUuid: 'bbbbbbbbbbbbbbbbbbbbbbbb-zzz',
          count: 3,
        },
        renderable,
      ),
    ).toBe(1)
    expect(
      computeSelectedIndex(
        { uuid: 'cccccccccccccccccccccccc-2', expanded: false },
        renderable,
      ),
    ).toBe(2)
  })
})
