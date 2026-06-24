import { describe, expect, it } from 'bun:test';

import {
  getThemeOnboardingVisibleRowContract,
  getThemePickerOptionContracts,
  getThemePickerSubtitle,
  getThemePickerTitle,
} from './themeOnboardingOutput.js';

describe('themeOnboardingOutput', () => {
  it('formats the onboarding and settings titles', () => {
    expect(getThemePickerTitle(true)).toEqual({
      text: "Let's get started.",
      onboarding: true,
    });
    expect(getThemePickerTitle(false)).toEqual({
      text: 'Theme',
      onboarding: false,
    });
  });

  it('formats the theme picker subtitle', () => {
    expect(getThemePickerSubtitle()).toBe(
      'Choose the text style that looks best with your terminal',
    );
  });

  it('defines the ordered theme option contract without auto-theme', () => {
    expect(
      getThemePickerOptionContracts({ includeAutoTheme: false }),
    ).toEqual([
      { label: 'Dark mode', value: 'dark' },
      { label: 'Light mode', value: 'light' },
      {
        label: 'Dark mode (colorblind-friendly)',
        value: 'dark-daltonized',
      },
      {
        label: 'Light mode (colorblind-friendly)',
        value: 'light-daltonized',
      },
      { label: 'Dark mode (ANSI colors only)', value: 'dark-ansi' },
      { label: 'Light mode (ANSI colors only)', value: 'light-ansi' },
    ]);
  });

  it('defines the ordered theme option contract with auto-theme', () => {
    expect(
      getThemePickerOptionContracts({ includeAutoTheme: true })[0],
    ).toEqual({
      label: 'Auto (match terminal)',
      value: 'auto',
    });
  });

  it('defines the onboarding visible-row contract for both lane variants', () => {
    expect(
      getThemeOnboardingVisibleRowContract({ includeAutoTheme: false }),
    ).toEqual([
      "Let's get started.",
      'Choose the text style that looks best with your terminal',
      'Dark mode',
    ]);

    expect(
      getThemeOnboardingVisibleRowContract({ includeAutoTheme: true }),
    ).toEqual([
      "Let's get started.",
      'Choose the text style that looks best with your terminal',
      'Auto (match terminal)',
    ]);
  });
});
