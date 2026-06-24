import { performAuthLogin } from '../../cli/handlers/auth.js'

export async function performManagedReauthentication(): Promise<void> {
  await performAuthLogin(
    { managed: true },
    {
      openingMessage: 'Managed session expired. Opening browser to re-authenticate…',
      successMessage: 'Re-authentication successful. Retrying…',
    },
  )
}
