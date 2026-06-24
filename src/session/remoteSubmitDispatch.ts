import type {
  ContentBlockParam,
  ImageBlockParam,
} from '@anthropic-ai/sdk/resources/messages.mjs'
import type { UserMessage } from '../types/message.js'
import type { PastedContent } from '../utils/config.js'
import { createUserMessage } from '../utils/messages.js'
import type { RemoteMessageContent } from '../utils/teleport/api.js'

export type BuildRemoteSubmitPayloadOptions = {
  input: string
  pastedContents: Record<number, PastedContent>
}

export type BuildRemoteSubmitPayloadResult = {
  messageContent: string | ContentBlockParam[]
  remoteContent: RemoteMessageContent
  imagePasteIds: number[] | undefined
}

export type DispatchRemoteSubmitDeps = {
  appendUserMessage: (message: UserMessage) => void
  sendMessage: (
    content: RemoteMessageContent,
    options: { uuid: string },
  ) => Promise<void>
  createUserMessageImpl?: typeof createUserMessage
}

export function buildRemoteSubmitPayload({
  input,
  pastedContents,
}: BuildRemoteSubmitPayloadOptions): BuildRemoteSubmitPayloadResult {
  const trimmedInput = input.trim()
  const pastedValues = Object.values(pastedContents)
  const imagePasteIds = pastedValues
    .filter(
      (pasted): pasted is PastedContent & { type: 'image' } =>
        pasted.type === 'image',
    )
    .map(pasted => pasted.id)

  if (pastedValues.length === 0) {
    return {
      messageContent: trimmedInput,
      remoteContent: trimmedInput,
      imagePasteIds: imagePasteIds.length > 0 ? imagePasteIds : undefined,
    }
  }

  const contentBlocks: ContentBlockParam[] = []
  const remoteBlocks: Array<{
    type: string
    [key: string]: unknown
  }> = []

  if (trimmedInput) {
    const textBlock = {
      type: 'text' as const,
      text: trimmedInput,
    }
    contentBlocks.push(textBlock)
    remoteBlocks.push(textBlock)
  }

  for (const pasted of pastedValues) {
    if (pasted.type === 'image') {
      const source: ImageBlockParam['source'] = {
        type: 'base64',
        media_type: (pasted.mediaType ?? 'image/png') as
          | 'image/jpeg'
          | 'image/png'
          | 'image/gif'
          | 'image/webp',
        data: pasted.content,
      }
      const imageBlock = {
        type: 'image' as const,
        source,
      }
      contentBlocks.push(imageBlock)
      remoteBlocks.push(imageBlock)
      continue
    }

    const textBlock = {
      type: 'text' as const,
      text: pasted.content,
    }
    contentBlocks.push(textBlock)
    remoteBlocks.push(textBlock)
  }

  return {
    messageContent: contentBlocks,
    remoteContent: remoteBlocks,
    imagePasteIds: imagePasteIds.length > 0 ? imagePasteIds : undefined,
  }
}

export async function dispatchRemoteSubmit(
  options: BuildRemoteSubmitPayloadOptions,
  deps: DispatchRemoteSubmitDeps,
): Promise<UserMessage> {
  const { messageContent, remoteContent, imagePasteIds } =
    buildRemoteSubmitPayload(options)
  const createUserMessageImpl = deps.createUserMessageImpl ?? createUserMessage
  const userMessage = createUserMessageImpl({
    content: messageContent,
    imagePasteIds,
  })

  deps.appendUserMessage(userMessage)
  await deps.sendMessage(remoteContent, {
    uuid: userMessage.uuid,
  })
  return userMessage
}
