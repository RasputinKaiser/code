import { getAuthRuntime } from '../auth/runtime/AuthRuntime.js'
import { getAuthHeaders, type AuthHeaders } from '../utils/http.js'

export async function resolveFeedbackAuthHeaders(): Promise<AuthHeaders> {
  await getAuthRuntime().resolveSession({ allowRefresh: true })
  return getAuthHeaders()
}
