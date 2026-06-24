export function getLogoProductNameText(): string {
  return 'Code';
}

export function getLogoHeaderPrefixText(): string {
  return `${getLogoProductNameText()} v`;
}

export function getLogoVersionText(version: string): string {
  return `v${version}`;
}

export function getLogoHeaderText(version: string): string {
  return `${getLogoProductNameText()} ${getLogoVersionText(version)}`;
}

export function getStartupCwdDisplayText(options: {
  cwd: string;
  agentName?: string | null;
}): string {
  return options.agentName ?
      `@${options.agentName} · ${options.cwd}` :
      options.cwd;
}

export function getWideStartupModelSummaryText(options: {
  modelDisplayName: string;
  billingType: string;
  organizationName?: string | null;
}): string {
  return options.organizationName ?
      `${options.modelDisplayName} · ${options.billingType} · ${options.organizationName}` :
      `${options.modelDisplayName} · ${options.billingType}`;
}

export function getWideStartupVisibleRowContract(options: {
  welcomeMessage: string;
  modelSummary: string;
  cwdDisplay: string;
}): string[] {
  return [options.welcomeMessage, options.modelSummary, options.cwdDisplay];
}

export function getCompactStartupVisibleRowContract(options: {
  welcomeMessage: string;
  modelDisplayName: string;
  billingType: string;
  cwdDisplay: string;
}): string[] {
  return [
    options.welcomeMessage,
    options.modelDisplayName,
    options.billingType,
    options.cwdDisplay,
  ];
}

export function getCompactModelBillingVisibleRowContract(options: {
  shouldSplit: boolean;
  truncatedModel: string;
  truncatedBilling: string;
}): string[] {
  return options.shouldSplit ?
      [options.truncatedModel, options.truncatedBilling] :
      [`${options.truncatedModel} · ${options.truncatedBilling}`];
}

export function getVoiceModeNoticeText(): string {
  return 'Voice mode is now available · /voice to enable';
}

export function getIssueReportingHintText(): string {
  return 'Use /issue to report model behavior issues';
}

export function getNoumenaLogsHeadingText(): string {
  return '[NOUMENA-ONLY] Logs:';
}

export function getNoumenaLogsVisibleRowContract(options: {
  apiCallsPath: string;
  debugLogPath: string;
  startupPerfPath?: string | null;
}): string[] {
  const rows = [
    getNoumenaLogsHeadingText(),
    `API calls: ${options.apiCallsPath}`,
    `Debug logs: ${options.debugLogPath}`,
  ];

  if (options.startupPerfPath) {
    rows.push(`Startup Perf: ${options.startupPerfPath}`);
  }

  return rows;
}

export function getStartupPromptVisibleRowContract(options: {
  apiCallsPath: string;
  debugLogPath: string;
  startupPerfPath?: string | null;
}): string[] {
  return [
    getIssueReportingHintText(),
    ...getNoumenaLogsVisibleRowContract(options),
  ];
}
