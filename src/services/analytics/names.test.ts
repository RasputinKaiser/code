import { describe, expect, it } from 'bun:test'

import {
  getLegacyCompatibleAnalyticsNames,
  getLegacyCompatibleValue,
  toCanonicalAnalyticsName,
  toLegacyAnalyticsName,
} from './names.js'

describe('analytics name compatibility', () => {
  it('canonicalizes inherited tengu event and flag names to ncode names', () => {
    expect(toCanonicalAnalyticsName('tengu_started')).toBe('ncode_started')
    expect(toCanonicalAnalyticsName('ncode_started')).toBe('ncode_started')
    expect(toCanonicalAnalyticsName('tengu-off-switch')).toBe('ncode-off-switch')
  })

  it('keeps a legacy fallback during GrowthBook and event-name migration', () => {
    expect(getLegacyCompatibleAnalyticsNames('ncode_bridge_repl_v2')).toEqual([
      'ncode_bridge_repl_v2',
      'tengu_bridge_repl_v2',
    ])
    expect(toLegacyAnalyticsName('ncode_bridge_repl_v2')).toBe(
      'tengu_bridge_repl_v2',
    )
    expect(toLegacyAnalyticsName('ncode-off-switch')).toBe('tengu-off-switch')
  })

  it('prefers canonical values but can read legacy cached config', () => {
    expect(
      getLegacyCompatibleValue(
        {
          tengu_feature: 'legacy',
          ncode_feature: 'canonical',
        },
        'tengu_feature',
      ),
    ).toBe('canonical')
    expect(getLegacyCompatibleValue({ tengu_feature: true }, 'ncode_feature')).toBe(
      true,
    )
  })
})
