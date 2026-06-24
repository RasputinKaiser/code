import type { ApiKeySource } from 'src/entrypoints/agentSdkTypes.js'
import { getAuthRuntime } from '../../auth/runtime/AuthRuntime.js'
import type { ResolvedAuthSession } from '../../auth/runtime/types.js'

type SystemInitSessionInput =
  | Pick<ResolvedAuthSession, 'rawApiKeySource'>
  | null
  | undefined

export function getSystemInitApiKeySourceForSession(
  session: SystemInitSessionInput,
): ApiKeySource {
  return (session?.rawApiKeySource ?? 'none') as ApiKeySource
}

export function getCurrentSystemInitApiKeySource(): ApiKeySource {
  return getSystemInitApiKeySourceForSession(getAuthRuntime().getCurrentSession())
}
