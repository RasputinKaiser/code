import React from 'react';
import {
  recordRawAnsiRender,
} from './rawAnsiRenderStats.js'
type Props = {
  /**
   * Pre-rendered ANSI lines. Each element must be exactly one terminal row
   * (already wrapped to `width` by the producer) with ANSI escape codes inline.
   */
  lines: string[];
  /** Column width the producer wrapped to. Sent to Yoga as the fixed leaf width. */
  width: number;
};

/**
 * Bypass the <Ansi> → React tree → Yoga → squash → re-serialize roundtrip for
 * content that is already terminal-ready.
 *
 * Use this when an external renderer has already produced ANSI-escaped,
 * width-wrapped output. A normal <Ansi> mount reparses that output into one
 * React <Text> per style span, lays out each span as a Yoga flex child, then
 * walks the tree to re-emit the same escape codes it was given. For a long
 * transcript full of syntax-highlighted files, that roundtrip is the dominant
 * cost of the render.
 *
 * This component emits a single Yoga leaf with a constant-time measure func
 * (width × lines.length) and hands the pre-split lines straight to
 * output.writeLines(), avoiding the old join-then-split loopback on every
 * large raw block mount.
 */
export function resetRawAnsiJoinCachesForTesting(): void {
  // No-op: RawAnsi now preserves pre-split lines through to Output.writeLines().
}

export function RawAnsi({ lines, width }: Props): React.ReactNode {
  recordRawAnsiRender(lines.length === 0)
  if (lines.length === 0) {
    return null
  }
  return <ink-raw-ansi rawLines={lines} rawWidth={width} rawHeight={lines.length} />
}
