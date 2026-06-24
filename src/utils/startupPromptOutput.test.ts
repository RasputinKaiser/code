import { describe, expect, it } from 'bun:test';

import {
  getCompactModelBillingVisibleRowContract,
  getCompactStartupVisibleRowContract,
  getIssueReportingHintText,
  getLogoHeaderPrefixText,
  getLogoHeaderText,
  getLogoProductNameText,
  getLogoVersionText,
  getNoumenaLogsHeadingText,
  getNoumenaLogsVisibleRowContract,
  getStartupCwdDisplayText,
  getStartupPromptVisibleRowContract,
  getVoiceModeNoticeText,
  getWideStartupModelSummaryText,
  getWideStartupVisibleRowContract,
} from './startupPromptOutput.js';

describe('startupPromptOutput', () => {
  it('defines the startup product name and version contracts', () => {
    expect(getLogoProductNameText()).toBe('Code');
    expect(getLogoHeaderPrefixText()).toBe('Code v');
    expect(getLogoVersionText('0.1.0')).toBe('v0.1.0');
    expect(getLogoHeaderText('0.1.0')).toBe('Code v0.1.0');
  });

  it('defines the agent-aware cwd display contract', () => {
    expect(
      getStartupCwdDisplayText({
        cwd: '/mlstore/src/noumena/ncode',
        agentName: 'reviewer',
      }),
    ).toBe('@reviewer · /mlstore/src/noumena/ncode');

    expect(
      getStartupCwdDisplayText({
        cwd: '/mlstore/src/noumena/ncode',
      }),
    ).toBe('/mlstore/src/noumena/ncode');
  });

  it('defines the wide startup model summary contract', () => {
    expect(
      getWideStartupModelSummaryText({
        modelDisplayName: 'Kimi K2.6 · high',
        billingType: 'Noumena Managed',
      }),
    ).toBe('Kimi K2.6 · high · Noumena Managed');

    expect(
      getWideStartupModelSummaryText({
        modelDisplayName: 'Kimi K2.6 · high',
        billingType: 'Noumena Managed',
        organizationName: 'Noumena',
      }),
    ).toBe('Kimi K2.6 · high · Noumena Managed · Noumena');
  });

  it('defines the ordered wide startup visible-row contract', () => {
    expect(
      getWideStartupVisibleRowContract({
        welcomeMessage: 'Welcome back xjdr!',
        modelSummary: 'Kimi K2.6 · high · Noumena Managed',
        cwdDisplay: '@reviewer · /mlstore/src/noumena/ncode',
      }),
    ).toEqual([
      'Welcome back xjdr!',
      'Kimi K2.6 · high · Noumena Managed',
      '@reviewer · /mlstore/src/noumena/ncode',
    ]);
  });

  it('defines the ordered compact startup visible-row contract', () => {
    expect(
      getCompactStartupVisibleRowContract({
        welcomeMessage: 'Welcome back!',
        modelDisplayName: 'Kimi K2.6 · high',
        billingType: 'Noumena Managed',
        cwdDisplay: '/mlstore/src/noumena/ncode',
      }),
    ).toEqual([
      'Welcome back!',
      'Kimi K2.6 · high',
      'Noumena Managed',
      '/mlstore/src/noumena/ncode',
    ]);
  });

  it('defines the compact condensed model/billing row contract', () => {
    expect(
      getCompactModelBillingVisibleRowContract({
        shouldSplit: false,
        truncatedModel: 'Kimi K2.6',
        truncatedBilling: 'Noumena Managed',
      }),
    ).toEqual(['Kimi K2.6 · Noumena Managed']);

    expect(
      getCompactModelBillingVisibleRowContract({
        shouldSplit: true,
        truncatedModel: 'Kimi K2.6',
        truncatedBilling: 'Noumena Managed',
      }),
    ).toEqual(['Kimi K2.6', 'Noumena Managed']);
  });

  it('defines the voice mode notice text contract', () => {
    expect(getVoiceModeNoticeText()).toBe(
      'Voice mode is now available · /voice to enable',
    );
  });

  it('defines the issue reporting hint contract', () => {
    expect(getIssueReportingHintText()).toBe(
      'Use /issue to report model behavior issues',
    );
  });

  it('defines the ordered Noumena logs row contract without startup perf', () => {
    expect(
      getNoumenaLogsVisibleRowContract({
        apiCallsPath: '/tmp/api.jsonl',
        debugLogPath: '/tmp/debug.txt',
      }),
    ).toEqual([
      '[NOUMENA-ONLY] Logs:',
      'API calls: /tmp/api.jsonl',
      'Debug logs: /tmp/debug.txt',
    ]);
  });

  it('defines the ordered Noumena logs row contract with startup perf', () => {
    expect(
      getNoumenaLogsVisibleRowContract({
        apiCallsPath: '/tmp/api.jsonl',
        debugLogPath: '/tmp/debug.txt',
        startupPerfPath: '/tmp/startup.txt',
      }),
    ).toEqual([
      '[NOUMENA-ONLY] Logs:',
      'API calls: /tmp/api.jsonl',
      'Debug logs: /tmp/debug.txt',
      'Startup Perf: /tmp/startup.txt',
    ]);
  });

  it('defines the full startup visible-row contract in order', () => {
    expect(
      getStartupPromptVisibleRowContract({
        apiCallsPath: '/tmp/api.jsonl',
        debugLogPath: '/tmp/debug.txt',
        startupPerfPath: '/tmp/startup.txt',
      }),
    ).toEqual([
      'Use /issue to report model behavior issues',
      '[NOUMENA-ONLY] Logs:',
      'API calls: /tmp/api.jsonl',
      'Debug logs: /tmp/debug.txt',
      'Startup Perf: /tmp/startup.txt',
    ]);
  });

  it('defines the standalone logs heading contract', () => {
    expect(getNoumenaLogsHeadingText()).toBe('[NOUMENA-ONLY] Logs:');
  });
});
