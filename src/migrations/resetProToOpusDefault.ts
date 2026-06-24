import { logEvent } from 'src/services/analytics/index.js'
import { getGlobalConfig, saveGlobalConfig } from '../utils/config.js'
import { getSettings_DEPRECATED } from '../utils/settings/settings.js'
import { shouldRunCurrentResetProToOpusDefaultMigration } from './migrationSubscriptionSession.js'

export function resetProToOpusDefault(): void {
  const config = getGlobalConfig()

  if (config.opusProMigrationComplete) {
    return
  }

  // Pro users on firstParty get auto-migrated to Opus 4.5 default
  if (!shouldRunCurrentResetProToOpusDefaultMigration()) {
    saveGlobalConfig(current => ({
      ...current,
      opusProMigrationComplete: true,
    }))
    logEvent('ncode_reset_pro_to_default_model', { skipped: true })
    return
  }

  const settings = getSettings_DEPRECATED()

  // Only show notification if user was on default (no custom model setting)
  if (settings?.model === undefined) {
    const opusProMigrationTimestamp = Date.now()
    saveGlobalConfig(current => ({
      ...current,
      opusProMigrationComplete: true,
      opusProMigrationTimestamp,
    }))
    logEvent('ncode_reset_pro_to_default_model', {
      skipped: false,
      had_custom_model: false,
    })
  } else {
    // User has a custom model setting, just mark migration complete
    saveGlobalConfig(current => ({
      ...current,
      opusProMigrationComplete: true,
    }))
    logEvent('ncode_reset_pro_to_default_model', {
      skipped: false,
      had_custom_model: true,
    })
  }
}
