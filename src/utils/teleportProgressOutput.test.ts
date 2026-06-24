import { describe, expect, it } from 'bun:test';

import {
  getTeleportProgressHeading,
  getTeleportProgressIndex,
  getTeleportProgressVisibleRowContract,
  getTeleportResumeVisibleRowContract,
  getTeleportResumeSystemMessageContract,
  getTeleportResumeUserMessageText,
  TELEPORT_PROGRESS_STEPS,
} from './teleportProgressOutput.js';

describe('teleportProgressOutput', () => {
  it('defines the ordered progress-step contract shown during teleport', () => {
    expect(TELEPORT_PROGRESS_STEPS).toEqual([
      { key: 'validating', label: 'Validating session' },
      { key: 'fetching_logs', label: 'Fetching session logs' },
      { key: 'fetching_branch', label: 'Getting branch info' },
      { key: 'checking_out', label: 'Checking out branch' },
    ]);
  });

  it('maps current progress steps to their rendered order', () => {
    expect(getTeleportProgressIndex('validating')).toBe(0);
    expect(getTeleportProgressIndex('fetching_logs')).toBe(1);
    expect(getTeleportProgressIndex('fetching_branch')).toBe(2);
    expect(getTeleportProgressIndex('checking_out')).toBe(3);
    expect(getTeleportProgressIndex('done')).toBe(-1);
  });

  it('formats the teleport progress heading', () => {
    expect(getTeleportProgressHeading('◐')).toBe('◐ Teleporting session…');
  });

  it('defines the ordered visible-row contract for teleport progress', () => {
    expect(
      getTeleportProgressVisibleRowContract({
        spinnerFrame: '◐',
        sessionId: '019db03b-d85e-7863-a6d7-5a1f170035d4',
      }),
    ).toEqual([
      '◐ Teleporting session…',
      '019db03b-d85e-7863-a6d7-5a1f170035d4',
      'Validating session',
      'Fetching session logs',
      'Getting branch info',
      'Checking out branch',
    ]);
  });

  it('formats the resume system message contract for success and branch failure', () => {
    expect(getTeleportResumeSystemMessageContract(null)).toEqual({
      message: 'Session resumed',
      level: 'suggestion',
    });

    expect(
      getTeleportResumeSystemMessageContract('branch missing upstream'),
    ).toEqual({
      message: 'Session resumed without branch: branch missing upstream',
      level: 'warning',
    });
  });

  it('formats the resume user message contract', () => {
    expect(
      getTeleportResumeUserMessageText('/mlstore/src/noumena/ncode.dev'),
    ).toBe(
      'This session is being continued from another machine. Application state may have changed. The updated working directory is /mlstore/src/noumena/ncode.dev',
    );
  });

  it('defines the ordered visible-row contract for teleport resume', () => {
    expect(
      getTeleportResumeVisibleRowContract({
        originalCwd: '/mlstore/src/noumena/ncode.dev',
        formattedBranchError: null,
      }),
    ).toEqual([
      'Session resumed',
      '/mlstore/src/noumena/ncode.dev',
      '❯',
    ]);

    expect(
      getTeleportResumeVisibleRowContract({
        originalCwd: '/mlstore/src/noumena/ncode.dev',
        formattedBranchError: 'branch missing upstream',
        promptText: 'prompt>',
      }),
    ).toEqual([
      'Session resumed without branch: branch missing upstream',
      '/mlstore/src/noumena/ncode.dev',
      'prompt>',
    ]);
  });
});
