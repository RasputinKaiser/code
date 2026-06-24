let assistantForced = false

export function markAssistantForced(): void {
  assistantForced = true
}

export function isAssistantForced(): boolean {
  return assistantForced
}

export function isAssistantMode(): boolean {
  return assistantForced
}

export async function initializeAssistantTeam(): Promise<undefined> {
  return undefined
}

export function getAssistantSystemPromptAddendum(): string {
  return 'Assistant mode is not yet reconstructed in this source build.'
}

export function getAssistantActivationPath(): undefined {
  return undefined
}
