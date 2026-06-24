const breakCache = {
  type: 'local',
  name: 'break-cache',
  description: 'Force a prompt-cache break by mutating system context injection',
  argumentHint: '[status|bump [reason]|set <value>|clear|reset-state]',
  isEnabled: () => (process.env.NCODE_BUILD_MODE === 'noumena' || process.env.USER_TYPE === 'ant'),
  isHidden: true,
  immediate: true,
  supportsNonInteractive: true,
  load: () => import('./break-cache.js'),
}

export default breakCache
