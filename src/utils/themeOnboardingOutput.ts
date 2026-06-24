import type { ThemeSetting } from './theme.js';

export function getThemePickerTitle(showIntroText: boolean): {
  text: string;
  onboarding: boolean;
} {
  return showIntroText ?
      { text: "Let's get started.", onboarding: true } :
      { text: 'Theme', onboarding: false };
}

export function getThemePickerSubtitle(): string {
  return 'Choose the text style that looks best with your terminal';
}

export function getThemePickerOptionContracts(options: {
  includeAutoTheme: boolean;
}): Array<{ label: string; value: ThemeSetting }> {
  return [
    ...(options.includeAutoTheme ?
      [{ label: 'Auto (match terminal)', value: 'auto' as const }] :
      []),
    { label: 'Dark mode', value: 'dark' as const },
    { label: 'Light mode', value: 'light' as const },
    {
      label: 'Dark mode (colorblind-friendly)',
      value: 'dark-daltonized' as const,
    },
    {
      label: 'Light mode (colorblind-friendly)',
      value: 'light-daltonized' as const,
    },
    { label: 'Dark mode (ANSI colors only)', value: 'dark-ansi' as const },
    { label: 'Light mode (ANSI colors only)', value: 'light-ansi' as const },
  ];
}

export function getThemeOnboardingVisibleRowContract(options: {
  includeAutoTheme: boolean;
}): string[] {
  return [
    getThemePickerTitle(true).text,
    getThemePickerSubtitle(),
    getThemePickerOptionContracts(options)[0]!.label,
  ];
}
