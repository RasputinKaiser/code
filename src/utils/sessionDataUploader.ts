import type { Message as MessageType } from '../types/message.js'

export type SessionTurnUploader = (messages: MessageType[]) => Promise<void>

// TODO(ant-parity): Replace this compile shim with the recovered Anthropic
// implementation once we have real receipts for the endpoint, auth contract,
// payload schema, and restore path.
export async function createSessionTurnUploader(): Promise<SessionTurnUploader | null> {
  if (process.env.CLAUDE_CODE_DISABLE_SESSION_DATA_UPLOAD === '1') {
    return null
  }

  return async (_messages: MessageType[]) => {
    void _messages
  }
}
