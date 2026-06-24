import type { MaterializedAsset } from '../nativeAssetRuntime.js'

import pyReplHostUnix from '../../../.tmp/py_repl_host/ncode_py_repl_host' with { type: 'file' }
import pyReplHostWindows from '../../../.tmp/py_repl_host/ncode_py_repl_host.exe' with { type: 'file' }

export function getBundledPythonReplHostAsset(): MaterializedAsset | null {
  switch (process.platform) {
    case 'win32':
      return {
        embeddedPath: pyReplHostWindows,
        relativePath: 'vendor/py_repl_host/ncode_py_repl_host.exe',
      }
    case 'darwin':
    case 'linux':
      return {
        embeddedPath: pyReplHostUnix,
        relativePath: 'vendor/py_repl_host/ncode_py_repl_host',
        mode: 0o755,
      }
    default:
      return null
  }
}
