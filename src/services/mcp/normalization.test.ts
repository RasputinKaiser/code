import { describe, expect, it } from 'bun:test'
import {
  getManagedConnectorCompatibilityNames,
  getManagedConnectorDisplayName,
  normalizeNameForMCP,
} from './normalization.js'

describe('managed connector normalization', () => {
  it('uses Noumena-managed display names', () => {
    expect(getManagedConnectorDisplayName('Slack')).toBe(
      'Noumena managed Slack',
    )
  })

  it('preserves stable normalized names across legacy and Noumena-managed labels', () => {
    expect(normalizeNameForMCP('claude.ai Slack')).toBe('claude_ai_Slack')
    expect(normalizeNameForMCP('Noumena managed Slack')).toBe(
      'claude_ai_Slack',
    )
  })

  it('returns compatibility aliases in canonical order', () => {
    expect(getManagedConnectorCompatibilityNames('claude.ai Slack')).toEqual([
      'Noumena managed Slack',
      'claude.ai Slack',
    ])
    expect(
      getManagedConnectorCompatibilityNames('Noumena managed Slack'),
    ).toEqual(['Noumena managed Slack', 'claude.ai Slack'])
    expect(getManagedConnectorCompatibilityNames('Slack')).toEqual(['Slack'])
  })
})
