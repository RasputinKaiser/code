import { useEffect } from 'react'
import { gracefulShutdownSync } from '../utils/gracefulShutdown.js'
import { isEnvTruthy } from '../utils/envUtils.js'
import { isInternalBuild } from 'src/capabilities/static.js'

export function useAfterFirstRender(): void {
  useEffect(() => {
    if (
      isInternalBuild() &&
      isEnvTruthy(process.env.CLAUDE_CODE_EXIT_AFTER_FIRST_RENDER)
    ) {
      process.stderr.write(
        `\nStartup time: ${Math.round(process.uptime() * 1000)}ms\n`,
      )
      gracefulShutdownSync(0)
    }
  }, [])
}
