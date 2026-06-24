import type {
  AnyZodRawShape,
  ForkSessionOptions,
  ForkSessionResult,
  GetSessionInfoOptions,
  GetSessionMessagesOptions,
  InferShape,
  ListSessionsOptions,
  McpSdkServerConfigWithInstance,
  Options,
  Query,
  SDKSession,
  SDKSessionOptions,
  SdkMcpToolDefinition,
  SessionMessage,
  SessionMutationOptions,
} from '@anthropic-ai/claude-agent-sdk/sdk.js'

export type EffortLevel = 'low' | 'medium' | 'high' | 'max'

export type InternalOptions = Options
export interface InternalQuery extends Query {}

export type {
  AnyZodRawShape,
  ForkSessionOptions,
  ForkSessionResult,
  GetSessionInfoOptions,
  GetSessionMessagesOptions,
  InferShape,
  ListSessionsOptions,
  McpSdkServerConfigWithInstance,
  Options,
  Query,
  SDKSession,
  SDKSessionOptions,
  SdkMcpToolDefinition,
  SessionMessage,
  SessionMutationOptions,
}
