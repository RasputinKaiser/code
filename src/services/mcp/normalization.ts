/**
 * Pure utility functions for MCP name normalization.
 * This file has no dependencies to avoid circular imports.
 */

// Managed connector display names moved to Noumena wording, but the legacy
// claude.ai prefix is still accepted for compatibility and remains the
// canonical normalization input so MCP tool names stay stable.
const LEGACY_MANAGED_CONNECTOR_PREFIX = 'claude.ai '
const NOUMENA_MANAGED_CONNECTOR_PREFIX = 'Noumena managed '

function stripManagedConnectorPrefix(name: string): string | null {
  if (name.startsWith(NOUMENA_MANAGED_CONNECTOR_PREFIX)) {
    return name.slice(NOUMENA_MANAGED_CONNECTOR_PREFIX.length)
  }
  if (name.startsWith(LEGACY_MANAGED_CONNECTOR_PREFIX)) {
    return name.slice(LEGACY_MANAGED_CONNECTOR_PREFIX.length)
  }
  return null
}

export function getManagedConnectorDisplayName(displayName: string): string {
  return `${NOUMENA_MANAGED_CONNECTOR_PREFIX}${displayName}`
}

export function getManagedConnectorCompatibilityNames(name: string): string[] {
  const suffix = stripManagedConnectorPrefix(name)
  if (suffix === null) {
    return [name]
  }
  return [
    getManagedConnectorDisplayName(suffix),
    `${LEGACY_MANAGED_CONNECTOR_PREFIX}${suffix}`,
  ]
}

/**
 * Normalize server names to be compatible with the API pattern ^[a-zA-Z0-9_-]{1,64}$
 * Replaces any invalid characters (including dots and spaces) with underscores.
 *
 * Managed connector display names keep the historical `claude_ai_` normalized
 * prefix even after the visible UI string moved from `claude.ai` to
 * `Noumena managed`. That preserves stable MCP tool names and lookup behavior
 * during the transition.
 */
export function normalizeNameForMCP(name: string): string {
  const compatibilityNames = getManagedConnectorCompatibilityNames(name)
  const normalizationInput =
    compatibilityNames.length > 1 ? compatibilityNames[1] : name

  let normalized = normalizationInput.replace(/[^a-zA-Z0-9_-]/g, '_')
  if (compatibilityNames.length > 1) {
    normalized = normalized.replace(/_+/g, '_').replace(/^_|_$/g, '')
  }
  return normalized
}
