import { getAuthRuntime } from '../../auth/runtime/AuthRuntime.js'
import { isCurrentFirstPartyOauthUiEnabled } from '../../utils/firstPartyOauthUiSession.js'

export function getCurrentInstallGitHubAppSession(): {
  existingApiKey: null | string
  oauthEnabled: boolean
} {
  const session = getAuthRuntime().getCurrentSession()

  return {
    existingApiKey: session.hasUsableApiKey ? session.apiKey : null,
    oauthEnabled: isCurrentFirstPartyOauthUiEnabled(),
  }
}
