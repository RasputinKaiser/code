import { feature } from 'bun:bundle'
import { resetCostState } from '../bootstrap/state.js'
import {
  clearTrustedDeviceToken,
  enrollTrustedDevice,
} from '../bridge/trustedDevice.js'
import type { LocalJSXCommandContext } from '../types/command.js'
import { refreshGrowthBookAfterAuthChange } from '../services/analytics/growthbook.js'
import { refreshPolicyLimits } from '../services/policyLimits/index.js'
import { refreshRemoteManagedSettings } from '../services/remoteManagedSettings/index.js'
import { stripSignatureBlocks } from './messages.js'
import {
  checkAndDisableAutoModeIfNeeded,
  checkAndDisableBypassPermissionsIfNeeded,
  resetAutoModeGateCheck,
  resetBypassPermissionsCheck,
} from './permissions/bypassPermissionsKillswitch.js'
import { resetUserCache } from './user.js'

export function refreshAuthDependentServices(): void {
  void refreshRemoteManagedSettings()
  void refreshPolicyLimits()
  resetUserCache()
  refreshGrowthBookAfterAuthChange()
  clearTrustedDeviceToken()
  void enrollTrustedDevice()
}

export function handleAuthChangeInCommand(
  context: LocalJSXCommandContext,
): void {
  context.onChangeAPIKey()
  // Signature-bearing blocks (thinking, connector_text) are bound to the API key.
  context.setMessages(stripSignatureBlocks)
  resetCostState()
  refreshAuthDependentServices()
  resetBypassPermissionsCheck()
  const appState = context.getAppState()
  void checkAndDisableBypassPermissionsIfNeeded(
    appState.toolPermissionContext,
    context.setAppState,
  )
  if (feature('TRANSCRIPT_CLASSIFIER')) {
    resetAutoModeGateCheck()
    void checkAndDisableAutoModeIfNeeded(
      appState.toolPermissionContext,
      context.setAppState,
      appState.fastMode,
    )
  }
  context.setAppState(prev => ({
    ...prev,
    authVersion: prev.authVersion + 1,
  }))
}
