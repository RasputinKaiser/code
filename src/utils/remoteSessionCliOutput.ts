import { getTeleportResumeCommand } from './cliDisplayCommand.js';

export function getCreatedRemoteSessionOutputLines(sessionId: string, sessionUrl: string): string[] {
  return [
    `Created remote session: ${sessionId}`,
    `View: ${sessionUrl}?m=0`,
    `Resume with: ${getTeleportResumeCommand(sessionId)}`,
  ];
}

export function getCreatedRemoteSessionOutputText(sessionId: string, sessionUrl: string): string {
  return `${getCreatedRemoteSessionOutputLines(sessionId, sessionUrl).join('\n')}\n`;
}
