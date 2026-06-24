export type RenderFencedCodeOptions = {
  language?: string | null;
  terminalWidth?: number;
};

export declare function renderFencedCode(
  code: string,
  options?: RenderFencedCodeOptions,
): string[] | null;
