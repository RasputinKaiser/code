import stripAnsi from 'strip-ansi'

import { formatImageRef } from '../../history.js'
import type { PastedContent } from '../../utils/config.js'
import type { ImageDimensions } from '../../utils/imageResizer.js'
import { resolvePromptInputTextPastePlan } from './promptInputTextPastePlan.js'

export function dispatchPromptInputImagePaste(
  {
    image,
    mediaType,
    filename,
    dimensions,
    sourcePath,
    nextPasteId,
    pendingSpaceAfterPill,
  }: {
    image: string
    mediaType?: string
    filename?: string
    dimensions?: ImageDimensions
    sourcePath?: string
    nextPasteId: number
    pendingSpaceAfterPill: boolean
  },
  {
    logImagePaste,
    setModePrompt,
    cacheImagePath,
    storeImage,
    addPastedContent,
    insertTextAtCursor,
  }: {
    logImagePaste: () => void
    setModePrompt: () => void
    cacheImagePath: (content: PastedContent) => void
    storeImage: (content: PastedContent) => void
    addPastedContent: (id: number, content: PastedContent) => void
    insertTextAtCursor: (text: string) => void
  },
): {
  nextPasteId: number
  pendingSpaceAfterPill: boolean
} {
  logImagePaste()
  setModePrompt()
  const pasteId = nextPasteId
  const newContent: PastedContent = {
    id: pasteId,
    type: 'image',
    content: image,
    mediaType: mediaType || 'image/png',
    filename: filename || 'Pasted image',
    dimensions,
    sourcePath,
  }

  cacheImagePath(newContent)
  storeImage(newContent)
  addPastedContent(pasteId, newContent)
  const prefix = pendingSpaceAfterPill ? ' ' : ''
  insertTextAtCursor(prefix + formatImageRef(pasteId))

  return {
    nextPasteId: pasteId + 1,
    pendingSpaceAfterPill: true,
  }
}

export function dispatchPromptInputTextPaste(
  {
    rawText,
    inputLength,
    rows,
    nextPasteId,
  }: {
    rawText: string
    inputLength: number
    rows: number
    nextPasteId: number
  },
  {
    setMode,
    addPastedContent,
    insertTextAtCursor,
  }: {
    setMode: (mode: 'prompt' | 'bash') => void
    addPastedContent: (id: number, content: PastedContent) => void
    insertTextAtCursor: (text: string) => void
  },
): {
  nextPasteId: number
  pendingSpaceAfterPill: boolean
} {
  const text = stripAnsi(rawText).replace(/\r/g, '\n').replaceAll('\t', '    ')
  const pastePlan = resolvePromptInputTextPastePlan({
    sanitizedText: text,
    inputLength,
    rows,
    nextPasteId,
  })

  if (pastePlan.nextMode) {
    setMode(pastePlan.nextMode)
  }

  let updatedNextPasteId = nextPasteId
  if (pastePlan.newPastedContent) {
    updatedNextPasteId += 1
    addPastedContent(pastePlan.newPastedContent.id, pastePlan.newPastedContent)
  }

  insertTextAtCursor(pastePlan.textToInsert)

  return {
    nextPasteId: updatedNextPasteId,
    pendingSpaceAfterPill: false,
  }
}
