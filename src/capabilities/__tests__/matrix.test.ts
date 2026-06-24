// Copyright 2026 Noumena, Inc. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'bun:test'
import { getCapabilities } from '../matrix.js'

describe('capability matrix', () => {
  it('dev spin has all capabilities for every auth provider', () => {
    const auths = [
      'noumena-managed',
      'noumena-apikey',
      'byok-anthropic',
      'byok-openai',
    ] as const
    for (const auth of auths) {
      const caps = getCapabilities('dev', auth, 'direct')
      expect(caps.has('tungsten')).toBe(true)
      expect(caps.has('agent-swarms')).toBe(true)
      expect(caps.has('plan-mode')).toBe(true)
      expect(caps.has('auto-mode')).toBe(true)
      expect(caps.has('first-party-analytics')).toBe(true)
      expect(caps.has('internal-marketplace')).toBe(true)
      expect(caps.has('slash-commands')).toBe(true)
    }
  })

  it('public + byok has only production-safe capabilities', () => {
    const caps = getCapabilities('public', 'byok-anthropic', 'direct')
    expect(caps.has('tungsten')).toBe(false)
    expect(caps.has('agent-swarms')).toBe(false)
    expect(caps.has('plan-mode')).toBe(true)
    expect(caps.has('marketplace')).toBe(true)
    expect(caps.has('skills')).toBe(true)
    expect(caps.has('web-search')).toBe(true)
    expect(caps.has('internal-marketplace')).toBe(false)
    expect(caps.has('slash-commands')).toBe(false)
    expect(caps.has('first-party-analytics')).toBe(false)
    expect(caps.has('cost-tracking')).toBe(false)
  })

  it('public + noumena-managed has remote sessions and analytics', () => {
    const caps = getCapabilities('public', 'noumena-managed', 'remote')
    expect(caps.has('remote-sessions')).toBe(true)
    expect(caps.has('first-party-analytics')).toBe(true)
    expect(caps.has('first-party-features')).toBe(true)
    expect(caps.has('cost-tracking')).toBe(true)
    expect(caps.has('tungsten')).toBe(false)
    expect(caps.has('internal-marketplace')).toBe(false)
  })

  it('internal + noumena-managed has all capabilities', () => {
    const caps = getCapabilities('internal', 'noumena-managed', 'direct')
    expect(caps.has('tungsten')).toBe(true)
    expect(caps.has('internal-marketplace')).toBe(true)
    expect(caps.has('slash-commands')).toBe(true)
    expect(caps.has('first-party-analytics')).toBe(true)
    expect(caps.has('debug-preview')).toBe(true)
  })

  it('internal + byok is a superset of public byok but lacks internal-only surfaces', () => {
    const byokCaps = getCapabilities('internal', 'byok-anthropic', 'direct')
    expect(byokCaps.has('tungsten')).toBe(true)
    expect(byokCaps.has('slash-commands')).toBe(true)
    expect(byokCaps.has('internal-marketplace')).toBe(false)
    expect(byokCaps.has('first-party-analytics')).toBe(false)
    expect(byokCaps.has('plan-mode')).toBe(true)
  })
})
