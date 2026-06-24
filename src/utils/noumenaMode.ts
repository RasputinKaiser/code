export function isNoumenaMode(): boolean {
  return (
    process.env.NCODE_BUILD_MODE === 'noumena' ||
    process.env.NCODE_BUILD_MODE === 'n'
  )
}
