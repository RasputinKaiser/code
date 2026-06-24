import { getAuthRuntime } from './AuthRuntime.js'
import { buildContinuityStatusView } from './continuity.js'
import {
  buildLocalFirstPartyLease,
  type ContinuityStatusView,
  type IssuedRuntimeLease,
  type LeaseManager,
  type ResolveLeaseOptions,
} from './leases.js'

class DefaultLeaseManager implements LeaseManager {
  private cachedLease: IssuedRuntimeLease | null = null

  private async resolveLocalSessionAndLease(
    options: ResolveLeaseOptions = {},
  ): Promise<{
    lease: IssuedRuntimeLease | null
    session: Awaited<ReturnType<ReturnType<typeof getAuthRuntime>['resolveSession']>>
  }> {
    const session = await getAuthRuntime().resolveSession({
      allowRefresh: true,
    })
    const lease = buildLocalFirstPartyLease(session, options)
    this.cachedLease = lease
    return { lease, session }
  }

  getCachedLease(): IssuedRuntimeLease | null {
    return this.cachedLease
  }

  async resolveLease(
    options: ResolveLeaseOptions = {},
  ): Promise<IssuedRuntimeLease | null> {
    const { lease } = await this.resolveLocalSessionAndLease(options)
    return lease
  }

  async getStatusView(
    options: ResolveLeaseOptions = {},
  ): Promise<ContinuityStatusView> {
    const { lease, session } = await this.resolveLocalSessionAndLease(options)
    return buildContinuityStatusView(session, lease, options)
  }
}

const leaseManager = new DefaultLeaseManager()

export function getLeaseManager(): LeaseManager {
  return leaseManager
}
