/**
 * In brief-only mode, filter messages to show ONLY Brief tool_use blocks,
 * their tool_results, and real user input. All assistant text is dropped —
 * if the model forgets to call Brief, the user sees nothing for that turn.
 * That's on the model to get right; the filter does not second-guess it.
 */
export function filterForBriefTool<T extends {
  type: string;
  subtype?: string;
  isMeta?: boolean;
  isApiErrorMessage?: boolean;
  message?: {
    content: Array<{
      type: string;
      name?: string;
      tool_use_id?: string;
    }>;
  };
  attachment?: {
    type: string;
    isMeta?: boolean;
    origin?: unknown;
    commandMode?: string;
  };
}>(messages: T[], briefToolNames: string[]): T[] {
  const nameSet = new Set(briefToolNames)
  // tool_use always precedes its tool_result in the array, so we can collect
  // IDs and match against them in a single pass.
  const briefToolUseIDs = new Set<string>()
  return messages.filter(msg => {
    // System messages (attach confirmation, remote errors, compact boundaries)
    // must stay visible — dropping them leaves the viewer with no feedback.
    // Exception: api_metrics is per-turn debug noise (TTFT, config writes,
    // hook timing) that defeats the point of brief mode. Still visible in
    // transcript mode (ctrl+o) which bypasses this filter.
    if (msg.type === 'system') return msg.subtype !== 'api_metrics'
    const block = msg.message?.content[0]
    if (msg.type === 'assistant') {
      // API error messages (auth failures, rate limits, etc.) must stay visible
      if (msg.isApiErrorMessage) return true
      // Keep Brief tool_use blocks (renders with standard tool call chrome,
      // and must be in the list so buildMessageLookups can resolve tool results)
      if (block?.type === 'tool_use' && block.name && nameSet.has(block.name)) {
        if ('id' in block) {
          briefToolUseIDs.add(
            (block as {
              id: string
            }).id,
          )
        }
        return true
      }
      return false
    }
    if (msg.type === 'user') {
      if (block?.type === 'tool_result') {
        return (
          block.tool_use_id !== undefined &&
          briefToolUseIDs.has(block.tool_use_id)
        )
      }
      // Real user input only — drop meta/tick messages.
      return !msg.isMeta
    }
    if (msg.type === 'attachment') {
      // Human input drained mid-turn arrives as a queued_command attachment
      // (query.ts mid-chain drain → getQueuedCommandAttachments). Keep it —
      // it's what the user typed. commandMode === 'prompt' positively
      // identifies human-typed input; task-notification callers set
      // mode: 'task-notification' but not origin/isMeta, so the positive
      // commandMode check is required to exclude them.
      const att = msg.attachment
      return (
        att?.type === 'queued_command' &&
        att.commandMode === 'prompt' &&
        !att.isMeta &&
        att.origin === undefined
      )
    }
    return false
  })
}

/**
 * Full-transcript companion to filterForBriefTool. When the Brief tool is
 * in use, the model's text output is redundant with the SendUserMessage
 * content it wrote right after — drop the text so only the SendUserMessage
 * block shows. Tool calls and their results stay visible.
 *
 * Per-turn: only drops text in turns that actually called Brief. If the
 * model forgets, text still shows — otherwise the user would see nothing.
 */
export function dropTextInBriefTurns<T extends {
  type: string;
  isMeta?: boolean;
  message?: {
    content: Array<{
      type: string;
      name?: string;
    }>;
  };
}>(messages: T[], briefToolNames: string[]): T[] {
  const nameSet = new Set(briefToolNames)
  // First pass: find which turns (bounded by non-meta user messages) contain
  // a Brief tool_use. Tag each assistant text block with its turn index.
  const turnsWithBrief = new Set<number>()
  const textIndexToTurn: number[] = []
  let turn = 0
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]!
    const block = msg.message?.content[0]
    if (msg.type === 'user' && block?.type !== 'tool_result' && !msg.isMeta) {
      turn++
      continue
    }
    if (msg.type === 'assistant') {
      if (block?.type === 'text') {
        textIndexToTurn[i] = turn
      } else if (
        block?.type === 'tool_use' &&
        block.name &&
        nameSet.has(block.name)
      ) {
        turnsWithBrief.add(turn)
      }
    }
  }
  if (turnsWithBrief.size === 0) return messages
  // Second pass: drop text blocks whose turn called Brief.
  return messages.filter((_, i) => {
    const turnIndex = textIndexToTurn[i]
    return turnIndex === undefined || !turnsWithBrief.has(turnIndex)
  })
}
