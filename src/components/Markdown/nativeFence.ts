import * as nativeFencedCodeRenderer from '../../utils/markdown/nativeFencedCodeRenderer.js'

export type NativeFenceRenderResult =
  nativeFencedCodeRenderer.NativeFencedCodeRendererLines | null

export type NativeFenceRenderParams = {
  code: string
  language: string | null
  terminalWidth?: number
}

export function renderNativeFence(
  params: NativeFenceRenderParams,
): NativeFenceRenderResult {
  return nativeFencedCodeRenderer.renderNativeFencedCode(params.code, {
    language: params.language,
    terminalWidth: params.terminalWidth,
  })
}
