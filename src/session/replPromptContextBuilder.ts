import type { ProcessUserInputContext } from '../utils/processUserInput/processUserInput.js'

export type ReplPromptContextBuilderDeps = {
  buildRenderedSystemPrompt: (
    context: ProcessUserInputContext,
  ) => Promise<string>
  getUserContext: () => Promise<Record<string, string>>
  getSystemContext: () => Promise<Record<string, string>>
  setRenderedPromptOnContext?: boolean
}

export async function buildReplPromptContext(
  context: ProcessUserInputContext,
  deps: ReplPromptContextBuilderDeps,
): Promise<{
  systemPrompt: string
  userContext: Record<string, string>
  systemContext: Record<string, string>
}> {
  const [systemPrompt, userContext, systemContext] = await Promise.all([
    deps.buildRenderedSystemPrompt(context),
    deps.getUserContext(),
    deps.getSystemContext(),
  ])

  if (deps.setRenderedPromptOnContext) {
    context.renderedSystemPrompt = systemPrompt
  }

  return {
    systemPrompt,
    userContext,
    systemContext,
  }
}
