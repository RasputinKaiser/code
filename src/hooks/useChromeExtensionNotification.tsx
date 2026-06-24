import * as React from 'react'
import { Text } from '../ink.js'
import { getCurrentCommandAvailabilitySession } from '../utils/commandAvailability.js'
import {
  isChromeExtensionInstalled,
  shouldEnableClaudeInChrome,
} from '../utils/claudeInChrome/setup.js'
import { isRunningOnHomespace } from '../utils/envUtils.js'
import { useStartupNotification } from './notifs/useStartupNotification.js'
import { shouldRequireChromeManagedAccountNotice } from './chromeExtensionAvailability.js'

function getChromeFlag(): boolean | undefined {
  if (process.argv.includes('--chrome')) {
    return true
  }
  if (process.argv.includes('--no-chrome')) {
    return false
  }
  return undefined
}

export function useChromeExtensionNotification(): void {
  useStartupNotification(async () => {
    const chromeFlag = getChromeFlag()
    if (!shouldEnableClaudeInChrome(chromeFlag)) {
      return null
    }

    // Code in Chrome is only subscription-gated for external users.
    if (
      shouldRequireChromeManagedAccountNotice({
        buildMode: process.env.NCODE_BUILD_MODE,
        userType: process.env.USER_TYPE,
        session: getCurrentCommandAvailabilitySession(),
      })
    ) {
      return {
        key: 'chrome-requires-subscription',
        jsx: (
          <Text color="error">
            Code in Chrome requires a managed Noumena account
          </Text>
        ),
        priority: 'immediate' as const,
        timeoutMs: 5000,
      }
    }

    const installed = await isChromeExtensionInstalled()
    if (!installed && !isRunningOnHomespace()) {
      return {
        key: 'chrome-extension-not-detected',
        jsx: (
          <Text color="warning">
            Chrome extension not detected · https://console.noumena.com/chrome to install
          </Text>
        ),
        priority: 'immediate' as const,
        timeoutMs: 3000,
      }
    }

    if (chromeFlag === undefined) {
      return {
        key: 'claude-in-chrome-default-enabled',
        text: 'Code in Chrome enabled · /chrome',
        priority: 'low' as const,
      }
    }

    return null
  })
}
