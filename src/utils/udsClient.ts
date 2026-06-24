export type LiveSession = {
  sessionId?: string
  kind?: string
}

export async function sendToUdsSocket(
  _socketPath: string,
  _message: string,
): Promise<void> {}

export async function listAllLiveSessions(): Promise<LiveSession[]> {
  return []
}
