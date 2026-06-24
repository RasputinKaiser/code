import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test'
import * as trustedDeviceModule from '../../bridge/trustedDevice.js'
import * as growthbookModule from '../../services/analytics/growthbook.js'
import * as remoteManagedSettingsModule from '../../services/remoteManagedSettings/index.js'
import * as authModule from '../../utils/auth.js'
import * as betasModule from '../../utils/betas.js'
import * as toolSchemaModule from '../../utils/toolSchemaCache.js'
import * as userModule from '../../utils/user.js'
import { clearAuthRelatedCaches } from './logout.js'

describe('clearAuthRelatedCaches', () => {
  const clearOAuthTokenCacheSpy = spyOn(
    authModule,
    'clearOAuthTokenCache',
  ).mockImplementation(() => {})
  const clearTrustedDeviceTokenCacheSpy = spyOn(
    trustedDeviceModule,
    'clearTrustedDeviceTokenCache',
  ).mockImplementation(() => {})
  const clearBetasCachesSpy = spyOn(
    betasModule,
    'clearBetasCaches',
  ).mockImplementation(() => {})
  const clearToolSchemaCacheSpy = spyOn(
    toolSchemaModule,
    'clearToolSchemaCache',
  ).mockImplementation(() => {})
  const resetUserCacheSpy = spyOn(userModule, 'resetUserCache').mockImplementation(
    () => {},
  )
  const refreshGrowthBookAfterAuthChangeSpy = spyOn(
    growthbookModule,
    'refreshGrowthBookAfterAuthChange',
  ).mockImplementation(() => {})
  const clearRemoteManagedSettingsCacheSpy = spyOn(
    remoteManagedSettingsModule,
    'clearRemoteManagedSettingsCache',
  ).mockImplementation(async () => {})

  let originalGroveNoticeCache: unknown
  let originalGroveSettingsCache: unknown
  const clearGroveNoticeConfigCache = mock(() => {})
  const clearGroveSettingsCache = mock(() => {})

  beforeEach(async () => {
    clearOAuthTokenCacheSpy.mockClear()
    clearTrustedDeviceTokenCacheSpy.mockClear()
    clearBetasCachesSpy.mockClear()
    clearToolSchemaCacheSpy.mockClear()
    resetUserCacheSpy.mockClear()
    refreshGrowthBookAfterAuthChangeSpy.mockClear()
    clearRemoteManagedSettingsCacheSpy.mockClear()
    clearGroveNoticeConfigCache.mockClear()
    clearGroveSettingsCache.mockClear()

    const groveModule = await import('../../services/api/grove.js')
    originalGroveNoticeCache = groveModule.getGroveNoticeConfig.cache
    originalGroveSettingsCache = groveModule.getGroveSettings.cache
    groveModule.getGroveNoticeConfig.cache = {
      clear: clearGroveNoticeConfigCache,
    }
    groveModule.getGroveSettings.cache = {
      clear: clearGroveSettingsCache,
    }
  })

  afterEach(async () => {
    const groveModule = await import('../../services/api/grove.js')
    groveModule.getGroveNoticeConfig.cache = originalGroveNoticeCache as never
    groveModule.getGroveSettings.cache = originalGroveSettingsCache as never
  })

  test('clears the explicit oauth cache and dependent auth caches', async () => {
    await clearAuthRelatedCaches()

    expect(clearOAuthTokenCacheSpy).toHaveBeenCalledTimes(1)
    expect(clearTrustedDeviceTokenCacheSpy).toHaveBeenCalledTimes(1)
    expect(clearBetasCachesSpy).toHaveBeenCalledTimes(1)
    expect(clearToolSchemaCacheSpy).toHaveBeenCalledTimes(1)
    expect(resetUserCacheSpy).toHaveBeenCalledTimes(1)
    expect(refreshGrowthBookAfterAuthChangeSpy).toHaveBeenCalledTimes(1)
    expect(clearGroveNoticeConfigCache).toHaveBeenCalledTimes(1)
    expect(clearGroveSettingsCache).toHaveBeenCalledTimes(1)
    expect(clearRemoteManagedSettingsCacheSpy).toHaveBeenCalledTimes(1)
  })
})
