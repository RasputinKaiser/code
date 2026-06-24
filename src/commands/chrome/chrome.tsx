import React, { useState } from 'react'
import {
  type OptionWithDescription,
  Select,
} from '../../components/CustomSelect/select.js'
import { Dialog } from '../../components/design-system/Dialog.js'
import { Box, Text } from '../../ink.js'
import { useAppState } from '../../state/AppState.js'
import { getCurrentCommandAvailabilitySession } from '../../utils/commandAvailability.js'
import { openBrowser } from '../../utils/browser.js'
import {
  CLAUDE_IN_CHROME_MCP_SERVER_NAME,
  openInChrome,
} from '../../utils/claudeInChrome/common.js'
import { isChromeExtensionInstalled } from '../../utils/claudeInChrome/setup.js'
import { getGlobalConfig, saveGlobalConfig } from '../../utils/config.js'
import { env } from '../../utils/env.js'
import { isRunningOnHomespace } from '../../utils/envUtils.js'
import { hasChromeCommandAccessForSession } from './chromeAvailability.js'

const CHROME_EXTENSION_URL = 'https://console.noumena.com/chrome'
const CHROME_PERMISSIONS_URL = 'https://console.noumena.com/chrome/permissions'
const CHROME_RECONNECT_URL = 'https://console.noumena.com/chrome/reconnect'
const CHROME_DOCS_URL = 'https://console.noumena.com/chrome'

type MenuAction =
  | 'install-extension'
  | 'reconnect'
  | 'manage-permissions'
  | 'toggle-default'

type Props = {
  onDone: (result?: string) => void
  isExtensionInstalled: boolean
  configEnabled: boolean | undefined
  hasChromeAccess: boolean
  isWSL: boolean
}

function ChromeMenu({
  onDone,
  isExtensionInstalled: installed,
  configEnabled,
  hasChromeAccess,
  isWSL,
}: Props): React.ReactNode {
  const mcpClients = useAppState(s => s.mcp.clients)
  const [selectKey, setSelectKey] = useState(0)
  const [enabledByDefault, setEnabledByDefault] = useState(
    configEnabled ?? false,
  )
  const [showInstallHint, setShowInstallHint] = useState(false)
  const [isExtensionInstalledState, setIsExtensionInstalledState] =
    useState(installed)

  const isHomespace =
    process.env.USER_TYPE === 'ant' && isRunningOnHomespace()
  const chromeClient = mcpClients.find(
    client => client.name === CLAUDE_IN_CHROME_MCP_SERVER_NAME,
  )
  const isConnected = chromeClient?.type === 'connected'

  function openUrl(url: string): void {
    if (isHomespace) {
      void openBrowser(url)
    } else {
      void openInChrome(url)
    }
  }

  function handleAction(action: MenuAction): void {
    switch (action) {
      case 'install-extension':
        setSelectKey(key => key + 1)
        setShowInstallHint(true)
        openUrl(CHROME_EXTENSION_URL)
        break
      case 'reconnect':
        setSelectKey(key => key + 1)
        void isChromeExtensionInstalled().then(installedNow => {
          setIsExtensionInstalledState(installedNow)
          if (installedNow) {
            setShowInstallHint(false)
          }
        })
        openUrl(CHROME_RECONNECT_URL)
        break
      case 'manage-permissions':
        setSelectKey(key => key + 1)
        openUrl(CHROME_PERMISSIONS_URL)
        break
      case 'toggle-default': {
        const newValue = !enabledByDefault
        saveGlobalConfig(current => ({
          ...current,
          claudeInChromeDefaultEnabled: newValue,
        }))
        setEnabledByDefault(newValue)
        break
      }
    }
  }

  const options: OptionWithDescription<MenuAction>[] = []
  const requiresExtensionSuffix = isExtensionInstalledState
    ? ''
    : ' (requires extension)'

  if (!isExtensionInstalledState && !isHomespace) {
    options.push({
      label: 'Install Chrome extension',
      value: 'install-extension',
    })
  }

  options.push(
    {
      label: (
        <>
          <Text>Manage permissions</Text>
          <Text dimColor>{requiresExtensionSuffix}</Text>
        </>
      ),
      value: 'manage-permissions',
    },
    {
      label: (
        <>
          <Text>Reconnect extension</Text>
          <Text dimColor>{requiresExtensionSuffix}</Text>
        </>
      ),
      value: 'reconnect',
    },
    {
      label: `Enabled by default: ${enabledByDefault ? 'Yes' : 'No'}`,
      value: 'toggle-default',
    },
  )

  const isDisabled = isWSL || !hasChromeAccess

  return (
    <Dialog
      title="Code in Chrome (Beta)"
      onCancel={() => onDone()}
      color="chromeYellow"
    >
      <Box flexDirection="column" gap={1}>
        <Text>
          Code in Chrome works with the Chrome extension to let you control your
          browser directly from Code. Navigate websites, fill forms, capture
          screenshots, record GIFs, and debug with console logs and network
          requests.
        </Text>

        {isWSL && (
          <Text color="error">
            Code in Chrome is not supported in WSL at this time.
          </Text>
        )}

        {!hasChromeAccess && !isWSL && (
          <Text color="error">
            Code in Chrome requires a managed Noumena account.
          </Text>
        )}

        {!isDisabled && (
          <>
            {!isHomespace && (
              <Box flexDirection="column">
                <Text>
                  Status:{' '}
                  {isConnected ? (
                    <Text color="success">Enabled</Text>
                  ) : (
                    <Text color="inactive">Disabled</Text>
                  )}
                </Text>
                <Text>
                  Extension:{' '}
                  {isExtensionInstalledState ? (
                    <Text color="success">Installed</Text>
                  ) : (
                    <Text color="warning">Not detected</Text>
                  )}
                </Text>
              </Box>
            )}

            <Select
              key={selectKey}
              options={options}
              onChange={value => handleAction(value as MenuAction)}
              hideIndexes
            />

            {showInstallHint && (
              <Text color="warning">
                Once installed, select &quot;Reconnect extension&quot; to
                connect.
              </Text>
            )}

            <Text>
              <Text dimColor>Usage: </Text>
              <Text>code --chrome</Text>
              <Text dimColor> or </Text>
              <Text>code --no-chrome</Text>
            </Text>

            <Text dimColor>
              Site-level permissions are inherited from the Chrome extension.
              Manage permissions in the Chrome extension settings to control
              which sites Code can browse, click, and type on.
            </Text>
          </>
        )}

        <Text dimColor>Learn more: {CHROME_DOCS_URL}</Text>
      </Box>
    </Dialog>
  )
}

export const call = async function (
  onDone: (result?: string) => void,
): Promise<React.ReactNode> {
  const isExtensionInstalled = await isChromeExtensionInstalled()
  const config = getGlobalConfig()
  const hasChromeAccess = hasChromeCommandAccessForSession(
    getCurrentCommandAvailabilitySession(),
  )
  const isWSL = env.isWslEnvironment()

  return (
    <ChromeMenu
      onDone={onDone}
      isExtensionInstalled={isExtensionInstalled}
      configEnabled={config.claudeInChromeDefaultEnabled}
      hasChromeAccess={hasChromeAccess}
      isWSL={isWSL}
    />
  )
}
