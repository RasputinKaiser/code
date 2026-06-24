import type { ResolvedAuthSession } from '../../auth/runtime/types.js'

export type MCPRemoteServerMenuManagedSession =
  | Pick<ResolvedAuthSession, 'identity' | 'principalSource'>
  | null
  | undefined

export function getManagedProxyOrganizationUuid(
  session: MCPRemoteServerMenuManagedSession,
): string | null {
  if (session?.principalSource !== 'managed_oauth') {
    return null
  }

  const organizationUuid = session.identity.organizationUuid?.trim()
  return organizationUuid ? organizationUuid : null
}
