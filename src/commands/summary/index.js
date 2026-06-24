const summary = {
  type: 'local',
  name: 'summary',
  description: 'Refresh and show the current session summary',
  isEnabled: () => (process.env.NCODE_BUILD_MODE === 'noumena' || process.env.USER_TYPE === 'ant'),
  isHidden: true,
  immediate: true,
  supportsNonInteractive: true,
  load: () => import('./summary.js'),
}

export default summary
