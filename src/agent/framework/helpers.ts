/**
 * StepContext builder and message utilities.
 */

import { randomUUID } from 'node:crypto';
import type {
  AgentMessage, Channel, StepContext, GateOpts, GatePayload,
  ReplyPayload, EmitPayload, ProgressPayload, CheckpointPayload,
} from './types.js';
import type { AgentConfig, LLMProvider } from '../../shared/types.js';
import { writeArtifact as writeArtifactFile, readArtifact as readArtifactFile } from './checkpoint.js';

// ---------------------------------------------------------------------------
// ID generation
// ---------------------------------------------------------------------------

export function generateRunId(): string {
  return randomUUID();
}

// ---------------------------------------------------------------------------
// Message factory
// ---------------------------------------------------------------------------

export function createMessage<T>(
  agentId: string,
  runId: string,
  kind: string,
  payload: T,
  replyTo?: string,
): AgentMessage<T> {
  return {
    id: randomUUID(),
    agentId,
    runId,
    kind,
    payload,
    timestamp: new Date().toISOString(),
    replyTo,
  };
}

// ---------------------------------------------------------------------------
// StepContext builder
// ---------------------------------------------------------------------------

export interface StepContextOpts {
  channel:         Channel;
  runId:           string;
  agentId:         string;
  runDir:          string;
  config:          AgentConfig;
  providers:       { local: LLMProvider; claude: LLMProvider | null };
  abortController: AbortController;
  /** Optional RPC function for daemon IPC. */
  rpcFn?:          (<T>(method: string, params?: unknown) => Promise<T>) | undefined;
}

export function buildStepContext(opts: StepContextOpts): StepContext {
  const { channel, runId, agentId, runDir, config, providers, abortController, rpcFn } = opts;

  return {
    channel,
    runId,
    agentId,
    runDir,
    config,
    providers,
    signal: abortController.signal,

    progress(msg: string, pct?: number): void {
      const payload: ProgressPayload = { message: msg, pct };
      channel.send(createMessage(agentId, runId, 'progress', payload));
    },

    async gate(gateOpts: GateOpts): Promise<ReplyPayload> {
      const gateId = randomUUID();
      const payload: GatePayload = { gateId, ...gateOpts };
      const msg = createMessage<GatePayload>(agentId, runId, 'gate', payload);
      return channel.gate(msg);
    },

    emit(text: string, stream?: boolean): void {
      const payload: EmitPayload = { text, stream };
      channel.send(createMessage(agentId, runId, 'emit', payload));
    },

    async rpc<T = unknown>(method: string, params?: unknown): Promise<T | null> {
      if (!rpcFn) return null;
      try {
        return await rpcFn<T>(method, params);
      } catch {
        return null;
      }
    },

    writeArtifact(name: string, content: string): string {
      return writeArtifactFile(runDir, name, content);
    },

    readArtifact(name: string): string | null {
      return readArtifactFile(runDir, name);
    },
  };
}
