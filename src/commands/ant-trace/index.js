const antTrace = {
  type: 'local',
  name: 'ant-trace',
  description: 'Show internal tracing and trace-file diagnostics',
  argumentHint: '[status|flush|--json]',
  isEnabled: () => (process.env.NCODE_BUILD_MODE === 'noumena' || process.env.USER_TYPE === 'ant'),
  isHidden: true,
  immediate: true,
  supportsNonInteractive: true,
  load: () => import('./ant-trace.js'),
}

export default antTrace
