export type ResolveRemoteSubmitPolicyInput = {
  isRemoteMode: boolean
  isSlashCommand: boolean
  matchedCommandType?: string
}

export function shouldUseRemoteSubmit({
  isRemoteMode,
  isSlashCommand,
  matchedCommandType,
}: ResolveRemoteSubmitPolicyInput): boolean {
  if (!isRemoteMode) {
    return false
  }

  return !(isSlashCommand && matchedCommandType === 'local-jsx')
}
