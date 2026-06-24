import { isEnvTruthy } from '../utils/envUtils.js'
import { isInternalBuild } from 'src/capabilities/static.js'

// Internal-only GrowthBook SDK keys. These constants are intentionally not
// returned for public builds; public releases must set NOUMENA_GROWTHBOOK_CLIENT_KEY.
export const ANT_GROWTHBOOK_CLIENT_KEY = 'sdk-xRVcrliHIlrg4og4'
export const ANT_GROWTHBOOK_DEV_CLIENT_KEY = 'sdk-yZQvlplybuXjYh6L'
export const NOUMENA_GROWTHBOOK_CLIENT_KEY_DEFAULT = 'sdk-4goZclgHgKG2mtsb'
export const EXTERNAL_GROWTHBOOK_CLIENT_KEY = 'sdk-zAZezfDKGoZuXXKe'

function getTrimmedEnv(name: string): string | undefined {
  const value = process.env[name]?.trim()
  return value ? value : undefined
}

// Lazy read so ENABLE_GROWTHBOOK_DEV from globalSettings.env (applied after
// module load) is picked up. USER_TYPE is a build-time define so it's safe.
export function getGrowthBookClientKey(): string | undefined {
  const override = getTrimmedEnv('NOUMENA_GROWTHBOOK_CLIENT_KEY')
  if (override) {
    return override
  }

  if (!isInternalBuild()) {
    // Public builds must configure a client key explicitly. There is no
    // hardcoded public default to avoid shipping shared SDK keys in source.
    return undefined
  }

  if (isEnvTruthy(process.env.ENABLE_GROWTHBOOK_DEV)) {
    return ANT_GROWTHBOOK_DEV_CLIENT_KEY
  }

  return NOUMENA_GROWTHBOOK_CLIENT_KEY_DEFAULT
}
