const ctxViz = {
  type: 'local-jsx',
  name: 'ctx_viz',
  description: 'Internal alias for the context visualization command',
  isHidden: true,
  isEnabled: () => (process.env.NCODE_BUILD_MODE === 'noumena' || process.env.USER_TYPE === 'ant'),
  load: () => import('../context/context.js'),
}

export default ctxViz
