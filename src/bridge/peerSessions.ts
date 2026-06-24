export async function postInterClaudeMessage(
  _target: string,
  _message: string,
): Promise<{ ok: false; error: string }> {
  return {
    ok: false,
    error: 'Bridge peer sessions are not yet reconstructed in this source build.',
  }
}
