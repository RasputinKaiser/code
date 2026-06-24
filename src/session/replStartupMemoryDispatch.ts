import type { MemoryFileInfo } from '../utils/claudemd.js'

type CachedReadFileState = {
  content: string
  timestamp: number
  offset: undefined
  limit: undefined
  isPartialView: boolean
}

export type ReplStartupMemoryDispatchDeps = {
  reverify: () => void | Promise<void>
  getMemoryFiles: () => Promise<MemoryFileInfo[]>
  logDebug: (message: string) => void
  cacheReadFileState: (path: string, value: CachedReadFileState) => void
}

export async function dispatchReplStartupMemory(
  {
    reverify,
    getMemoryFiles,
    logDebug,
    cacheReadFileState,
  }: ReplStartupMemoryDispatchDeps,
): Promise<void> {
  void reverify()

  const memoryFiles = await getMemoryFiles()
  if (memoryFiles.length > 0) {
    const fileList = memoryFiles
      .map(
        file =>
          `  [${file.type}] ${file.path} (${file.content.length} chars)${
            file.parent ? ` (included by ${file.parent})` : ''
          }`,
      )
      .join('\n')
    logDebug(`Loaded ${memoryFiles.length} NCODE.md/rules files:\n${fileList}`)
  } else {
    logDebug('No NCODE.md/rules files found')
  }

  for (const file of memoryFiles) {
    cacheReadFileState(file.path, {
      content: file.contentDiffersFromDisk
        ? file.rawContent ?? file.content
        : file.content,
      timestamp: Date.now(),
      offset: undefined,
      limit: undefined,
      isPartialView: !!file.contentDiffersFromDisk,
    })
  }
}
