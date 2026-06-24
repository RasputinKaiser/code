import { extname } from 'path'
import React from 'react'
import { HighlightedCode } from './HighlightedCode.js'
import { Markdown } from './Markdown.js'

type Props = {
  content: string
  filePath: string
  width?: number
}

export function shouldRenderFileContentAsMarkdown(filePath: string): boolean {
  const extension = extname(filePath).toLowerCase()
  return extension === '.md' || extension === '.markdown'
}

export function FileContentPreview({
  content,
  filePath,
  width,
}: Props): React.ReactNode {
  if (shouldRenderFileContentAsMarkdown(filePath)) {
    return <Markdown>{content}</Markdown>
  }

  return <HighlightedCode code={content} filePath={filePath} width={width} />
}
