export function wsV2NativeAvailable(): boolean;
export function wsV2Connect(
  url: string,
  headersJson?: string | null,
  clientName?: string | null,
  optionsJson?: string | null,
): Promise<string>;
export function wsV2Start(
  sessionId: string,
  requestId: string,
  payloadJson: string,
): Promise<void>;
export function wsV2Next(sessionId: string): Promise<string | null>;
export function wsV2Cancel(sessionId: string, requestId: string): Promise<void>;
export function wsV2Close(sessionId: string): Promise<void>;
