import { afterEach, describe, expect, it } from 'bun:test';

import {
  getCreatedRemoteSessionOutputLines,
  getCreatedRemoteSessionOutputText,
} from './remoteSessionCliOutput.js';

const ORIGINAL_DISPLAY_COMMAND = process.env.NCODE_CLI_DISPLAY_COMMAND;

describe('remoteSessionCliOutput', () => {
  afterEach(() => {
    if (ORIGINAL_DISPLAY_COMMAND === undefined) {
      delete process.env.NCODE_CLI_DISPLAY_COMMAND;
    } else {
      process.env.NCODE_CLI_DISPLAY_COMMAND = ORIGINAL_DISPLAY_COMMAND;
    }
  });

  it('formats the created-session contract with the session id, view URL, and resume command', () => {
    process.env.NCODE_CLI_DISPLAY_COMMAND = '../ncode/code/ncode-staging-self-contained';

    expect(
      getCreatedRemoteSessionOutputLines(
        '019db03b-d85e-7863-a6d7-5a1f170035d4',
        'https://console.dev.noumena.test/code/019db03b-d85e-7863-a6d7-5a1f170035d4',
      ),
    ).toEqual([
      'Created remote session: 019db03b-d85e-7863-a6d7-5a1f170035d4',
      'View: https://console.dev.noumena.test/code/019db03b-d85e-7863-a6d7-5a1f170035d4?m=0',
      'Resume with: ../ncode/code/ncode-staging-self-contained --teleport 019db03b-d85e-7863-a6d7-5a1f170035d4',
    ]);
  });

  it('returns a newline-terminated text block with the ordered contract lines', () => {
    process.env.NCODE_CLI_DISPLAY_COMMAND = 'code';

    expect(
      getCreatedRemoteSessionOutputText(
        'session-123',
        'https://console.dev.noumena.test/code/session-123',
      ),
    ).toBe(
      [
        'Created remote session: session-123',
        'View: https://console.dev.noumena.test/code/session-123?m=0',
        'Resume with: code --teleport session-123',
        '',
      ].join('\n'),
    );
  });
});
