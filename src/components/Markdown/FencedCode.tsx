import React from 'react'
import { Ansi, RawAnsi } from '../../ink.js'
import {
  recordFencedCodeAnsiFallback,
  recordNativeFencedCodeRender,
} from './fencedCodeRenderStats.js'
import { renderNativeFence } from './nativeFence.js'

type Props = {
  code: string
  language: string | null
  getFallbackAnsi: () => string
  terminalWidth: number
  dimColor?: boolean
}

/**
 * Dedicated fenced-code seam for the future native long-history renderer.
 *
 * This component is intentionally conservative: it probes the native seam, but
 * while no native renderer exists it preserves the current <Ansi> behavior.
 */
export function FencedCode({
  code,
  language,
  getFallbackAnsi,
  terminalWidth,
  dimColor,
}: Props): React.ReactNode {
  const hasUsableTerminalWidth =
    Number.isFinite(terminalWidth) && terminalWidth > 0
  const nativeLines =
    dimColor || !hasUsableTerminalWidth
      ? null
      : renderNativeFence({
          code,
          language,
          terminalWidth,
        })

  if (nativeLines) {
    recordNativeFencedCodeRender({
      language,
      terminalWidth,
      codeLength: code.length,
      nativeLineCount: nativeLines.length,
    })
    return <RawAnsi lines={nativeLines as string[]} width={terminalWidth} />
  }

  const fallbackAnsi = getFallbackAnsi()
  recordFencedCodeAnsiFallback({
    language,
    terminalWidth,
    codeLength: code.length,
    reason: dimColor
      ? 'dim-color'
      : !hasUsableTerminalWidth
        ? 'no-terminal-width'
        : 'native-unavailable',
  })
  return <Ansi dimColor={dimColor}>{fallbackAnsi}</Ansi>
}
