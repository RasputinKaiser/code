export const TELEPORT_PROGRESS_STEPS = [
  { key: 'validating', label: 'Validating session' },
  { key: 'fetching_logs', label: 'Fetching session logs' },
  { key: 'fetching_branch', label: 'Getting branch info' },
  { key: 'checking_out', label: 'Checking out branch' },
] as const;

export function getTeleportProgressIndex(currentStep: string): number {
  return TELEPORT_PROGRESS_STEPS.findIndex(step => step.key === currentStep);
}

export function getTeleportProgressHeading(spinnerFrame: string): string {
  return `${spinnerFrame} Teleporting session…`;
}

export function getTeleportProgressVisibleRowContract(options: {
  spinnerFrame: string;
  sessionId?: string | null;
}): string[] {
  return [
    getTeleportProgressHeading(options.spinnerFrame),
    ...(options.sessionId ? [options.sessionId] : []),
    ...TELEPORT_PROGRESS_STEPS.map(step => step.label),
  ];
}

export function getTeleportResumeSystemMessageContract(formattedBranchError: string | null): {
  message: string;
  level: 'suggestion' | 'warning';
} {
  if (formattedBranchError === null) {
    return {
      message: 'Session resumed',
      level: 'suggestion',
    };
  }

  return {
    message: `Session resumed without branch: ${formattedBranchError}`,
    level: 'warning',
  };
}

export function getTeleportResumeUserMessageText(originalCwd: string): string {
  return `This session is being continued from another machine. Application state may have changed. The updated working directory is ${originalCwd}`;
}

export function getTeleportResumeVisibleRowContract(options: {
  originalCwd: string;
  formattedBranchError: string | null;
  promptText?: string;
}): string[] {
  return [
    getTeleportResumeSystemMessageContract(options.formattedBranchError).message,
    options.originalCwd,
    options.promptText ?? '❯',
  ];
}
