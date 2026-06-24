import type { Tools } from '../../Tool.js'
import { findToolByName } from '../../Tool.js'
import type { RenderableMessage } from '../../types/message.js'
import type { MessageLookups } from '../../utils/messages.js'
import { renderableSearchText } from '../../utils/transcriptSearch.js'

type TranscriptSearchTextExtractorDeps = {
  tools: Tools
  lookups: Pick<MessageLookups, 'toolUseByToolUseID'>
}

export function createTranscriptSearchTextExtractor({
  tools,
  lookups,
}: TranscriptSearchTextExtractorDeps): (message: RenderableMessage) => string {
  const cache = new WeakMap<RenderableMessage, string>()

  return (message: RenderableMessage): string => {
    const cached = cache.get(message)
    if (cached !== undefined) return cached

    let text = renderableSearchText(message)
    if (
      message.type === 'user' &&
      message.toolUseResult &&
      Array.isArray(message.message.content)
    ) {
      const toolResult = message.message.content.find(
        block => block.type === 'tool_result',
      )
      if (toolResult && 'tool_use_id' in toolResult) {
        const toolUse = lookups.toolUseByToolUseID.get(toolResult.tool_use_id)
        const tool = toolUse && findToolByName(tools, toolUse.name)
        const extracted = tool?.extractSearchText?.(message.toolUseResult as never)
        if (extracted !== undefined) {
          text = extracted
        }
      }
    }

    const lowered = text.toLowerCase()
    cache.set(message, lowered)
    return lowered
  }
}
