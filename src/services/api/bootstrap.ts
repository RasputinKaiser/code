import axios from 'axios'
import isEqual from 'lodash-es/isEqual.js'
import { getAuthRuntime } from 'src/auth/runtime/AuthRuntime.js'
import { z } from 'zod'
import { OAUTH_BETA_HEADER } from '../../constants/oauth.js'
import { getGlobalConfig, saveGlobalConfig } from '../../utils/config.js'
import { logForDebugging } from '../../utils/debug.js'
import { withOAuth401Retry } from '../../utils/http.js'
import { lazySchema } from '../../utils/lazySchema.js'
import { logError } from '../../utils/log.js'
import { getAPIProvider } from '../../utils/model/providers.js'
import { isEssentialTrafficOnly } from '../../utils/privacyLevel.js'
import { getNcodeUserAgent } from '../../utils/userAgent.js'
import { getIdentityClient } from '../oauth/identityClient.js'

const bootstrapResponseSchema = lazySchema(() =>
  z.object({
    client_data: z.record(z.string(), z.unknown()).nullish(),
    additional_model_options: z
      .array(
        z
          .object({
            model: z.string(),
            name: z.string(),
            description: z.string(),
          })
          .transform(({ model, name, description }) => ({
            value: model,
            label: name,
            description,
          })),
      )
      .nullish(),
  }),
)

export type BootstrapResponse = z.infer<
  ReturnType<typeof bootstrapResponseSchema>
>

async function fetchBootstrapAPI(): Promise<BootstrapResponse | null> {
  if (isEssentialTrafficOnly()) {
    logForDebugging('[Bootstrap] Skipped: Nonessential traffic disabled')
    return null
  }

  if (getAPIProvider() !== 'firstParty') {
    logForDebugging('[Bootstrap] Skipped: 3P provider')
    return null
  }

  // OAuth preferred (requires user:profile scope — service-key OAuth tokens
  // lack it and would 403). Fall back to API key auth for console users.
  const initialSession = getAuthRuntime().getCurrentSession()
  const hasUsableOAuth =
    initialSession.principalSource === 'managed_oauth' &&
    initialSession.sessionState === 'usable' &&
    initialSession.scopes.includes('user:profile') &&
    Boolean(initialSession.accessToken)
  if (!hasUsableOAuth && !initialSession.apiKey) {
    logForDebugging('[Bootstrap] Skipped: no usable OAuth or API key')
    return null
  }

  // withOAuth401Retry handles the refresh-and-retry. API key users fail
  // through on 401 (no refresh mechanism — no OAuth token to pass).
  try {
    return await withOAuth401Retry(async () => {
      // Re-resolve session each call so the retry picks up refreshed auth.
      const session = await getAuthRuntime().resolveSession({
        allowRefresh: true,
      })
      const token =
        session.principalSource === 'managed_oauth' &&
        session.sessionState === 'usable' &&
        session.scopes.includes('user:profile')
          ? session.accessToken
          : null
      let authHeaders: Record<string, string>
      if (token) {
        authHeaders = {
          Authorization: `Bearer ${token}`,
          'anthropic-beta': OAUTH_BETA_HEADER,
        }
      } else if (session.apiKey) {
        authHeaders = { 'x-api-key': session.apiKey }
      } else {
        logForDebugging('[Bootstrap] No auth available on retry, aborting')
        return null
      }

      logForDebugging('[Bootstrap] Fetching')
      const response = await getIdentityClient().fetchBootstrap({
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': getNcodeUserAgent(),
          ...authHeaders,
        },
        timeout: 5000,
      })
      const parsed = bootstrapResponseSchema().safeParse(response)
      if (!parsed.success) {
        logForDebugging(
          `[Bootstrap] Response failed validation: ${parsed.error.message}`,
        )
        return null
      }
      logForDebugging('[Bootstrap] Fetch ok')
      return parsed.data
    })
  } catch (error) {
    logForDebugging(
      `[Bootstrap] Fetch failed: ${axios.isAxiosError(error) ? (error.response?.status ?? error.code) : 'unknown'}`,
    )
    throw error
  }
}

/**
 * Fetch bootstrap data from the API and persist to disk cache.
 */
export async function fetchBootstrapData(): Promise<void> {
  try {
    const response = await fetchBootstrapAPI()
    if (!response) return

    const clientData = response.client_data ?? null
    const additionalModelOptions = response.additional_model_options ?? []

    // Only persist if data actually changed — avoids a config write on every startup.
    const config = getGlobalConfig()
    if (
      isEqual(config.clientDataCache, clientData) &&
      isEqual(config.additionalModelOptionsCache, additionalModelOptions)
    ) {
      logForDebugging('[Bootstrap] Cache unchanged, skipping write')
      return
    }

    logForDebugging('[Bootstrap] Cache updated, persisting to disk')
    saveGlobalConfig(current => ({
      ...current,
      clientDataCache: clientData,
      additionalModelOptionsCache: additionalModelOptions,
    }))
  } catch (error) {
    logError(error)
  }
}
