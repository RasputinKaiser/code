export function getCliDisplayCommand(): string {
  const explicitCommand = process.env.NCODE_CLI_DISPLAY_COMMAND?.trim()
  if (explicitCommand) {
    return explicitCommand
  }

  if (process.env.NCODE_BUILD_MODE === 'noumena') {
    return 'code'
  }

  return 'claude'
}

export function getTeleportResumeCommand(sessionId: string): string {
  return `${getCliDisplayCommand()} --teleport ${sessionId}`
}
